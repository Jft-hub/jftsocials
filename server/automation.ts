import { db } from './db.js';
import { PeakerrClient, ServiceProvider } from './peakerrClient.js';
import {
  OrderStatus,
  Order,
  GroupedService,
  ServiceProviderOption,
  ServiceCategoryType
} from '../src/types/index.js';

export type ProviderResolver = (providerId?: string) => ServiceProvider;

export class AutomationEngine {
  private peakerr: PeakerrClient;
  private providerResolver?: ProviderResolver;
  private providers?: Record<string, ServiceProvider>;
  private syncTimer: NodeJS.Timeout | null = null;
  private serviceSyncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  constructor(
    peakerrOrResolver: PeakerrClient | ProviderResolver,
    providers?: Record<string, ServiceProvider>
  ) {
    if (typeof peakerrOrResolver === 'function') {
      this.providerResolver = peakerrOrResolver;
      this.peakerr = peakerrOrResolver('peakerr') as PeakerrClient;
    } else {
      this.peakerr = peakerrOrResolver;
    }
    this.providers = providers;
  }

  public getProvider(providerId?: string): ServiceProvider {
    if (this.providerResolver) {
      return this.providerResolver(providerId);
    }
    if (this.providers && providerId && this.providers[providerId]) {
      return this.providers[providerId];
    }
    return this.peakerr;
  }

  public start() {
    console.log('[AutomationEngine] Background order status & provider synchronizer started.');
    // Initial catalog aggregation from existing services
    try {
      this.aggregateGroupedServices();
    } catch (e) {
      console.warn('[AutomationEngine] Initial grouping warning:', e);
    }
    // Run an initial order-status sync after 5 seconds
    setTimeout(() => this.runOrderSync(), 5000);
    // Then every 60 seconds. (Was 15s: on small instances the tight loop
    // starved the API thread and made the whole site feel slow.)
    this.syncTimer = setInterval(() => this.runOrderSync(), 60 * 1000);

    // Pull the full service catalog from every configured provider shortly
    // after boot, then keep it fresh on a slower schedule (catalogs don't
    // change minute to minute the way order statuses do).
    setTimeout(() => this.syncAllProviderCatalogs(), 30000);
    this.serviceSyncTimer = setInterval(() => this.syncAllProviderCatalogs(), 2 * 60 * 60 * 1000); // every 2 hours
  }

  public stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.serviceSyncTimer) {
      clearInterval(this.serviceSyncTimer);
      this.serviceSyncTimer = null;
    }
  }

  private static readonly MAX_DISPATCH_ATTEMPTS = 5;
  private static readonly DISPATCH_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between retries

  // Consecutive status-check failures per order. Orders whose provider IDs are
  // permanently rejected ("Incorrect order ID") back off exponentially instead
  // of spamming the provider (and logs) every 15 seconds. In-memory only:
  // a restart resumes normal polling. Success clears the entry.
  private statusFailures = new Map<string, { fails: number; skipUntil: number }>();

  public async runOrderSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const activeOrders = db.getOrders().filter(o =>
        ['pending', 'processing', 'in_progress'].includes(o.status)
      );

      if (activeOrders.length === 0) {
        this.isSyncing = false;
        return;
      }

      // Retry orders that never made it to the provider, before checking status of the rest.
      await this.retryFailedDispatches(activeOrders.filter(o => !o.provider_order_id));

      // Check provider statuses
      for (const order of activeOrders.slice(0, 20)) {
        try {
          if (!order.provider_order_id || String(order.provider_order_id) === '0') continue;

          const backoff = this.statusFailures.get(order.id);
          if (backoff && backoff.skipUntil > Date.now()) continue;

          const provider = this.getProvider(order.provider_id);
          const providerStatus = await provider.getOrderStatus(order.provider_order_id);

          if (providerStatus && (providerStatus as any).error &&
              String((providerStatus as any).error).toLowerCase().includes('ncorrect order id')) {
            const fails = (backoff?.fails || 0) + 1;
            const waitMs = Math.min(fails * 5 * 60 * 1000, 2 * 60 * 60 * 1000);
            this.statusFailures.set(order.id, { fails, skipUntil: Date.now() + waitMs });
            if (fails === 1 || fails % 10 === 0) {
              console.warn(`[AutomationEngine] Order ${order.id}: provider rejects status checks (${fails}x) - backing off.`);
            }
            continue;
          }
          this.statusFailures.delete(order.id);

          if (providerStatus && !providerStatus.error) {
            let normalizedStatus: OrderStatus = order.status;
            const pStatus = (providerStatus.status || '').toLowerCase();

            if (pStatus.includes('completed') || pStatus === 'finish') {
              normalizedStatus = 'completed';
            } else if (pStatus.includes('progress')) {
              normalizedStatus = 'in_progress';
            } else if (pStatus.includes('partial')) {
              normalizedStatus = 'partial';
            } else if (pStatus.includes('canceled') || pStatus.includes('cancelled')) {
              normalizedStatus = 'cancelled';
            }

            const currentRemains = providerStatus.remains !== undefined ? parseInt(providerStatus.remains, 10) : order.remains;
            const currentStartCount = providerStatus.start_count !== undefined ? parseInt(providerStatus.start_count, 10) : order.start_count;

            const hasChanged = order.status !== normalizedStatus || order.remains !== currentRemains;

            if (hasChanged) {
              db.updateOrder(order.id, {
                status: normalizedStatus,
                provider_status: providerStatus.status || 'Updated',
                remains: isNaN(currentRemains) ? 0 : currentRemains,
                start_count: isNaN(currentStartCount) ? order.start_count : currentStartCount,
                completed_at: normalizedStatus === 'completed' ? new Date().toISOString() : order.completed_at
              });

              if (normalizedStatus === 'completed') {
                db.createNotification({
                  user_id: order.user_id,
                  type: 'order',
                  title: 'Order Completed',
                  message: `Your order ${order.id} for ${order.service_name || 'Social Growth'} has completed successfully.`,
                  read: false,
                  link: '/orders'
                });
              }
            }
          }
        } catch (e) {
          // Individual order check failure, continue others
        }
      }
    } catch (err) {
      console.error('[AutomationEngine] Order status sync error:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  // Retries orders that were charged to the customer but never successfully
  // dispatched to the provider. Backs off between attempts, and auto-refunds
  // the customer if the order still hasn't dispatched after the attempt cap.
  private async retryFailedDispatches(undispatchedOrders: Order[]) {
    const now = Date.now();

    for (const order of undispatchedOrders) {
      const attempts = order.dispatch_attempts || 0;
      const lastAttemptAt = order.last_dispatch_attempt_at
        ? new Date(order.last_dispatch_attempt_at).getTime()
        : 0;

      if (now - lastAttemptAt < AutomationEngine.DISPATCH_RETRY_INTERVAL_MS) {
        continue; // Not due for a retry yet
      }

      if (attempts >= AutomationEngine.MAX_DISPATCH_ATTEMPTS) {
        try {
          db.processSystemRefund(
            order.id,
            `Provider dispatch failed after ${attempts} attempts.`
          );
          console.warn(`[AutomationEngine] Auto-refunded order ${order.id} after ${attempts} failed dispatch attempts.`);
        } catch (refundErr) {
          console.error(`[AutomationEngine] Auto-refund failed for order ${order.id}:`, refundErr);
        }
        continue;
      }

      try {
        const service = db.findServiceById(order.service_id);
        const rawServiceId = order.provider_service_id ?? service?.provider_service_id;
        const providerServiceId = typeof rawServiceId === 'number' ? rawServiceId : parseInt(String(rawServiceId), 10);

        if (isNaN(providerServiceId)) {
          console.error(`[AutomationEngine] Missing valid numeric provider_service_id for order ${order.id}`);
          continue;
        }

        const provider = this.getProvider(order.provider_id);
        const providerRes = await provider.addOrder(
          providerServiceId,
          order.target_link,
          order.quantity
        );

        if (providerRes.orderId) {
          db.updateOrder(order.id, {
            provider_order_id: providerRes.orderId,
            status: 'in_progress',
            provider_status: 'In progress',
            dispatch_attempts: attempts + 1,
            last_dispatch_attempt_at: new Date().toISOString()
          });
          console.log(`[AutomationEngine] Order ${order.id} dispatched successfully on retry ${attempts + 1}.`);
        } else {
          db.updateOrder(order.id, {
            dispatch_attempts: attempts + 1,
            last_dispatch_attempt_at: new Date().toISOString()
          });
          console.warn(`[AutomationEngine] Retry ${attempts + 1} failed for order ${order.id}: ${providerRes.error}`);
        }
      } catch (e) {
        db.updateOrder(order.id, {
          dispatch_attempts: attempts + 1,
          last_dispatch_attempt_at: new Date().toISOString()
        });
        console.error(`[AutomationEngine] Retry ${attempts + 1} threw for order ${order.id}:`, e);
      }
    }
  }

  public async syncAllProviderCatalogs() {
    const providersToSync: string[] = [];
    const peakerr = this.getProvider('peakerr');
    if (peakerr && peakerr.isLive()) {
      providersToSync.push('peakerr');
    }
    const eagains = this.getProvider('eagainsmedia');
    if (eagains && eagains.isLive()) {
      providersToSync.push('eagainsmedia');
    }

    if (providersToSync.length === 0) {
      return;
    }

    for (const pId of providersToSync) {
      try {
        const result = await this.syncServicesFromProvider(pId);
        console.log(`[AutomationEngine] Catalog sync (${pId}): ${result.added} added, ${result.updated} updated, ${result.total} retrieved from provider.`);
      } catch (err: any) {
        console.info(`[AutomationEngine] Catalog sync note for ${pId}: ${err?.message || err}`);
      }
    }

    // Automatically rebuild multi-provider grouped catalog after sync
    try {
      this.aggregateGroupedServices();
    } catch (err) {
      console.warn('[AutomationEngine] Service grouping failed:', err);
    }
  }

  public async syncServicesFromProvider(providerId: string = 'peakerr'): Promise<{ added: number; updated: number; total: number }> {
    const provider = this.getProvider(providerId);
    const rawServices = await provider.getServices();
    const existingServices = db.getServices(false);
    const now = new Date().toISOString();

    let added = 0;
    let updated = 0;

    for (const raw of rawServices) {
      // Find matching category or map to existing platform
      let categoryId = 'cat_ig';
      const catLower = (raw.category || '').toLowerCase();
      if (catLower.includes('tiktok')) categoryId = 'cat_tk';
      else if (catLower.includes('youtube')) categoryId = 'cat_yt';
      else if (catLower.includes('telegram')) categoryId = 'cat_tg';
      else if (catLower.includes('twitter') || catLower.includes(' x')) categoryId = 'cat_tw';
      else if (catLower.includes('facebook')) categoryId = 'cat_fb';
      else if (catLower.includes('spotify')) categoryId = 'cat_sp';

      // Engainsmedia returns rates directly in Nigerian Naira (NGN).
      // Peakerr returns rates in USD and must be multiplied by the USD/NGN exchange rate.
      const rawRate = parseFloat(raw.rate) || 1.0;
      let rateInNGN = Math.round(rawRate * 100) / 100;
      if (providerId === 'peakerr') {
        const exchangeRate = db.getSettings().exchange_rate_usd_ngn || 1500;
        rateInNGN = Math.round(rawRate * exchangeRate * 100) / 100;
      }

      const parsedMin = parseInt(raw.min, 10);
      const effectiveMin = parsedMin && parsedMin > 0 ? (parsedMin === 50 ? 10 : parsedMin) : 10;
      const parsedMax = parseInt(raw.max, 10) || 100000;

      const existing = existingServices.find(s => s.provider_id === providerId && s.provider_service_id === raw.service);

      if (existing) {
        // Update provider-only rate without overwriting custom admin overrides
        db.updateService(existing.id, {
          provider_rate: rateInNGN,
          min_quantity: effectiveMin,
          max_quantity: parsedMax,
          refill_supported: Boolean(raw.refill),
          cancel_supported: Boolean(raw.cancel),
          synced_at: now
        });
        updated++;
      } else {
        // New service
        const newService = {
          id: `srv_${providerId}_${raw.service}`,
          provider_id: providerId,
          provider_service_id: raw.service,
          name: raw.name,
          description: `Fast delivery guaranteed. High-quality accounts. Min: ${effectiveMin}, Max: ${parsedMax}.`,
          category_id: categoryId,
          provider_rate: rateInNGN,
          min_quantity: effectiveMin,
          max_quantity: parsedMax,
          refill_supported: Boolean(raw.refill),
          cancel_supported: Boolean(raw.cancel),
          active: true,
          ordering_enabled: true,
          sort_order: existingServices.length + added + 1,
          synced_at: now
        };
        existingServices.push(newService);
        added++;
      }
    }

    if (added > 0) {
      db.setServices(existingServices);
    }

    // Rebuild grouped catalog
    try {
      this.aggregateGroupedServices();
    } catch (e) {
      console.warn('[AutomationEngine] Group aggregation warning:', e);
    }

    return { added, updated, total: rawServices.length };
  }

  /**
   * Cross-provider service catalog aggregator.
   * Merges services across providers (e.g. Peakerr and Engainsmedia) into parent
   * GroupedService entities with child provider options, ensuring consistent 20%
   * markup and ranking from cheapest to highest.
   */
  public aggregateGroupedServices(): GroupedService[] {
    const services = db.getServices(true);
    const now = new Date().toISOString();

    const groupsMap = new Map<string, {
      normalizedKey: string;
      platform: string;
      categoryId: string;
      categoryType: ServiceCategoryType;
      name: string;
      description: string;
      refill: boolean;
      cancel: boolean;
      options: ServiceProviderOption[];
    }>();

    for (const service of services) {
      const nameLower = service.name.toLowerCase();

      // 1. Identify Platform
      let platform = 'instagram';
      if (nameLower.includes('tiktok') || service.category_id === 'cat_tk') platform = 'tiktok';
      else if (nameLower.includes('youtube') || service.category_id === 'cat_yt') platform = 'youtube';
      else if (nameLower.includes('telegram') || service.category_id === 'cat_tg') platform = 'telegram';
      else if (nameLower.includes('twitter') || nameLower.includes(' x ') || service.category_id === 'cat_tw') platform = 'twitter';
      else if (nameLower.includes('facebook') || service.category_id === 'cat_fb') platform = 'facebook';
      else if (nameLower.includes('spotify') || service.category_id === 'cat_sp') platform = 'spotify';

      // 2. Identify Category Type (Followers, Likes, Comments, Saves, Shares, Views)
      let categoryType: ServiceCategoryType = 'other';
      if (/follower|subscriber|member/i.test(nameLower)) categoryType = 'followers';
      else if (/like|reaction/i.test(nameLower)) categoryType = 'likes';
      else if (/comment/i.test(nameLower)) categoryType = 'comments';
      else if (/save/i.test(nameLower)) categoryType = 'saves';
      else if (/share|retweet|repost/i.test(nameLower)) categoryType = 'shares';
      else if (/view|play|stream|story|impression/i.test(nameLower)) categoryType = 'views';

      // 3. Extract Refill / Quality tier
      let refillTier = 'standard';
      if (/30\s*day|30d/i.test(nameLower)) refillTier = '30d_refill';
      else if (/60\s*day|60d/i.test(nameLower)) refillTier = '60d_refill';
      else if (/90\s*day|90d/i.test(nameLower)) refillTier = '90d_refill';
      else if (/365\s*day|365d|1\s*year/i.test(nameLower)) refillTier = '365d_refill';
      else if (/lifetime/i.test(nameLower)) refillTier = 'lifetime_refill';
      else if (/no\s*refill/i.test(nameLower)) refillTier = 'no_refill';

      // 4. Generate normalized parent key
      const normalizedKey = `${platform}_${categoryType}_${refillTier}`;

      // Calculate customer price with pure 20% markup (no 2000 floor)
      const customerPrice = Math.round(service.provider_rate * 1.20 * 100) / 100;

      const providerOption: ServiceProviderOption = {
        service_id: service.id,
        provider_id: service.provider_id || (service.id.includes('eagains') ? 'eagainsmedia' : 'peakerr'),
        provider_service_id: service.provider_service_id,
        provider_name: (service.provider_id === 'eagainsmedia' || service.id.includes('eagains')) ? 'Engainsmedia' : 'Peakerr',
        original_name: service.name,
        provider_rate: service.provider_rate,
        customer_price_per_1000: customerPrice,
        min_quantity: service.min_quantity === 50 ? 10 : (service.min_quantity || 10),
        max_quantity: service.max_quantity || 100000,
        refill_supported: service.refill_supported,
        cancel_supported: service.cancel_supported,
        is_cheapest: false
      };

      if (!groupsMap.has(normalizedKey)) {
        const platformTitle = platform.charAt(0).toUpperCase() + platform.slice(1);
        const actionTitle = categoryType.charAt(0).toUpperCase() + categoryType.slice(1);
        const tierTitle = refillTier === '30d_refill' ? ' [30-Day Refill]'
          : refillTier === '60d_refill' ? ' [60-Day Refill]'
          : refillTier === '90d_refill' ? ' [90-Day Refill]'
          : refillTier === '365d_refill' ? ' [365-Day Refill]'
          : refillTier === 'lifetime_refill' ? ' [Lifetime Refill]'
          : refillTier === 'no_refill' ? ' [Direct Fast]'
          : '';

        groupsMap.set(normalizedKey, {
          normalizedKey,
          platform,
          categoryId: service.category_id,
          categoryType,
          name: `${platformTitle} ${actionTitle}${tierTitle}`,
          description: service.description || `Fast high-retention ${platformTitle} ${categoryType}. Multi-provider routed for lowest rate and maximum reliability.`,
          refill: service.refill_supported,
          cancel: service.cancel_supported,
          options: [providerOption]
        });
      } else {
        const grp = groupsMap.get(normalizedKey)!;
        grp.options.push(providerOption);
        grp.refill = grp.refill || service.refill_supported;
        grp.cancel = grp.cancel || service.cancel_supported;
      }
    }

    // Assemble final GroupedService entities
    const result: GroupedService[] = [];
    for (const [key, grp] of groupsMap.entries()) {
      // Sort provider options from cheapest to highest
      grp.options.sort((a, b) => a.customer_price_per_1000 - b.customer_price_per_1000);

      // Flag cheapest option
      if (grp.options.length > 0) {
        grp.options[0].is_cheapest = true;
      }

      const cheapest = grp.options[0];
      const minQty = Math.min(...grp.options.map(o => o.min_quantity));
      const maxQty = Math.max(...grp.options.map(o => o.max_quantity));

      result.push({
        id: `grp_${key}`,
        name: grp.name,
        normalized_key: key,
        platform: grp.platform,
        category_id: grp.categoryId,
        category_type: grp.categoryType,
        description: grp.description,
        refill_supported: grp.refill,
        cancel_supported: grp.cancel,
        min_quantity: minQty <= 0 ? 10 : minQty,
        max_quantity: maxQty <= 0 ? 100000 : maxQty,
        best_price_per_1000: cheapest ? cheapest.customer_price_per_1000 : 0,
        best_provider_id: cheapest ? cheapest.provider_id : 'peakerr',
        options_count: grp.options.length,
        provider_options: grp.options,
        active: true,
        created_at: now,
        updated_at: now
      });
    }

    // Sort grouped services by platform, then category type, then cheapest price
    result.sort((a, b) => a.best_price_per_1000 - b.best_price_per_1000);

    db.setGroupedServices(result);
    console.log(`[AutomationEngine] Service aggregation complete: ${result.length} grouped services created across providers.`);
    return result;
  }
}
