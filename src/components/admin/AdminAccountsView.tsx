import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShoppingBag,
  Plus,
  Upload,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Edit2,
  DollarSign,
  Users,
  Calendar,
  Layers,
  Sparkles,
  Search,
  Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

interface AdminAccountCategory {
  id: string;
  name: string;
  description?: string;
  price_ngn: number;
  active: boolean;
  in_stock: number;
  sold_count: number;
  created_at: string;
}

interface AdminAccountOrder {
  id: string;
  user_id: string;
  category_id: string;
  category_name: string;
  listing_id: string;
  price_charged: number;
  currency: string;
  created_at: string;
}

export const AdminAccountsView: React.FC = () => {
  const { token, showToast } = useApp();
  const [categories, setCategories] = useState<AdminAccountCategory[]>([]);
  const [orders, setOrders] = useState<AdminAccountOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk stock upload state
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [rawCredentials, setRawCredentials] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    added: number;
    rejected_count: number;
    rejected_lines: string[];
  } | null>(null);

  // Category modal / edit state
  const [editingCategory, setEditingCategory] = useState<Partial<AdminAccountCategory> | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, orderRes] = await Promise.all([
        fetch('/api/admin/accounts/stock', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/accounts/orders', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const catData = await catRes.json();
      const orderData = await orderRes.json();

      if (catData.success) {
        setCategories(catData.categories || []);
        if (catData.categories && catData.categories.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(catData.categories[0].id);
        }
      }
      if (orderData.success) {
        setOrders(orderData.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin accounts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !rawCredentials.trim()) {
      showToast('Please select a category and paste credentials.', 'error');
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);

      const res = await fetch('/api/admin/accounts/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          raw_credentials: rawCredentials
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to upload stock');
      }

      setUploadResult({
        added: data.added,
        rejected_count: data.rejected_count,
        rejected_lines: data.rejected_lines || []
      });

      if (data.added > 0) {
        showToast(`Successfully added ${data.added} account(s) to stock!`, 'success');
        setRawCredentials('');
        await fetchData();
      } else {
        showToast('No valid accounts were imported. Check format: email:password', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.id || !editingCategory?.name || editingCategory?.price_ngn === undefined) {
      showToast('ID, Name, and Price (NGN) are required.', 'error');
      return;
    }

    try {
      setIsSavingCategory(true);
      const res = await fetch('/api/admin/accounts/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: editingCategory.id,
          name: editingCategory.name,
          description: editingCategory.description || '',
          price_ngn: Number(editingCategory.price_ngn),
          active: editingCategory.active !== false
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save category');
      }

      showToast(`Category "${data.category.name}" saved successfully!`, 'success');
      setEditingCategory(null);
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const toggleCategoryActive = async (cat: AdminAccountCategory) => {
    try {
      const res = await fetch('/api/admin/accounts/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          price_ngn: cat.price_ngn,
          active: !cat.active
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category "${cat.name}" is now ${!cat.active ? 'active' : 'inactive'}`, 'info');
        await fetchData();
      }
    } catch (err) {
      showToast('Failed to toggle category state', 'error');
    }
  };

  const totalStock = categories.reduce((sum, c) => sum + c.in_stock, 0);
  const totalSold = categories.reduce((sum, c) => sum + c.sold_count, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.price_charged, 0);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <KeyRound className="w-3.5 h-3.5" />
            Inventory & Stock Control
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Account Store Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage pre-made accounts inventory (UK TikTok, etc.), paste bulk credentials, and track customer purchases.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setEditingCategory({
                id: '',
                name: '',
                description: '',
                price_ngn: 8000,
                active: true
              })
            }
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Category</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Total Units In Stock</div>
          <div className="text-2xl font-extrabold text-white mt-1">{totalStock}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Ready for instant delivery</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Accounts Sold</div>
          <div className="text-2xl font-extrabold text-indigo-400 mt-1">{totalSold}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Across all product categories</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Total Account Revenue</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            ₦{(totalRevenue ?? 0).toLocaleString('en-NG')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Settled via wallet debits</div>
        </div>
      </div>

      {/* Main Grid: Left is Categories Table, Right is Bulk Upload Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Categories & Stock Status (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Categories & Stock Levels
            </h2>
            <span className="text-xs text-slate-500">{categories.length} categories</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Price</th>
                    <th className="px-4 py-3.5">In Stock</th>
                    <th className="px-4 py-3.5">Sold</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {categories.map(cat => {
                    const isOutOfStock = cat.in_stock === 0;
                    const isLowStock = cat.in_stock > 0 && cat.in_stock <= 3;

                    return (
                      <tr key={cat.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-white">{cat.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{cat.id}</div>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-200">
                          ₦{(cat.price_ngn ?? 0).toLocaleString('en-NG')}
                        </td>
                        <td className="px-4 py-3.5">
                          {isOutOfStock ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              0 (Out)
                            </span>
                          ) : isLowStock ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
                              {cat.in_stock} (Low Stock)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {cat.in_stock} available
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 font-medium">
                          {cat.sold_count}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => toggleCategoryActive(cat)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                              cat.active
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
                                : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-750'
                            }`}
                          >
                            {cat.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedCategoryId(cat.id);
                              // Smooth scroll to upload form if on small screen
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                            title="Restock this category"
                          >
                            Restock
                          </button>
                          <button
                            onClick={() => setEditingCategory(cat)}
                            className="text-xs text-slate-400 hover:text-white"
                            title="Edit Category"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bulk Stock Upload Form (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-400" />
              Bulk Stock Upload
            </h2>
          </div>

          <form
            onSubmit={handleBulkUpload}
            className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Category
              </label>
              <select
                value={selectedCategoryId}
                onChange={e => setSelectedCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Stock: {c.in_stock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Credentials Input
                </label>
                <span className="text-[10px] text-slate-500 font-mono">Format: email:password</span>
              </div>
              <textarea
                rows={6}
                value={rawCredentials}
                onChange={e => setRawCredentials(e.target.value)}
                placeholder={`user1@gmail.com:SecretPass123!\nuser2@outlook.com:Pass4567#\n...`}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                One account per line. Each line must have an email and password separated by a colon (<code className="text-indigo-400">:</code>). Encrypted with AES-256-GCM before saving.
              </p>
            </div>

            <button
              type="submit"
              disabled={isUploading || !rawCredentials.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Encrypting & Storing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload & Encrypt Stock</span>
                </>
              )}
            </button>

            {/* Upload Result Feedback */}
            {uploadResult && (
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  <span>Successfully imported {uploadResult.added} account(s).</span>
                </div>

                {uploadResult.rejected_count > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800/60 text-rose-400">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{uploadResult.rejected_count} line(s) were rejected (missing colon separator):</span>
                    </div>
                    <div className="bg-rose-950/30 p-2 rounded border border-rose-500/20 font-mono text-[10px] max-h-24 overflow-y-auto">
                      {uploadResult.rejected_lines.map((line, idx) => (
                        <div key={idx} className="truncate">{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Category Creation / Edit Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingCategory.id && categories.some(c => c.id === editingCategory.id)
                  ? 'Edit Account Category'
                  : 'New Account Category'}
              </h3>
              <button
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Category ID (Slug)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. uk_tiktok or usa_instagram"
                  value={editingCategory.id || ''}
                  onChange={e => setEditingCategory({ ...editingCategory, id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UK TikTok Account"
                  value={editingCategory.name || ''}
                  onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Description (shown to customers)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Aged UK-region TikTok account, email login..."
                  value={editingCategory.description || ''}
                  onChange={e => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Fixed Price (₦ NGN)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="100"
                  value={editingCategory.price_ngn ?? 8000}
                  onChange={e => setEditingCategory({ ...editingCategory, price_ngn: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cat_active"
                  checked={editingCategory.active !== false}
                  onChange={e => setEditingCategory({ ...editingCategory, active: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="cat_active" className="text-slate-300 font-medium">
                  Active in storefront
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors"
                >
                  {isSavingCategory ? 'Saving...' : 'Save Category'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Account Purchase History Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-400" />
            Account Purchase Log
          </h2>
          <span className="text-xs text-slate-500">{orders.length} total sales</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {orders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No account purchases recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">Order ID</th>
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">Account Product</th>
                    <th className="px-4 py-3.5">Price Charged</th>
                    <th className="px-4 py-3.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-indigo-400">{order.id}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-300">{order.user_id}</td>
                      <td className="px-4 py-3.5 font-semibold text-white">{order.category_name}</td>
                      <td className="px-4 py-3.5 font-bold text-emerald-400">
                        ₦{(order.price_charged ?? 0).toLocaleString('en-NG')}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">
                        {new Date(order.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
