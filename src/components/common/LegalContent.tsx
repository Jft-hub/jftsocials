import React from 'react';

// Shared legal texts (single source of truth). Rendered in the landing-page
// footer modal and the signup consent links. Written for how JFT Socials
// actually operates: NGN/USDT wallets, investigated refunds, 18+ accounts.
export type LegalKey = 'terms' | 'privacy' | 'refund' | 'acceptable';

export const LEGAL_TITLES: Record<LegalKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  refund: 'Refund & Investigation Policy',
  acceptable: 'Acceptable Use Policy',
};

const P = ({ children }: { children: React.ReactNode }) => (
  <p>{children}</p>
);

export const LegalContent: React.FC<{ which: LegalKey }> = ({ which }) => {
  if (which === 'terms') {
    return (
      <>
        <P>
          <strong>1. The service:</strong> JFT Socials (jftsocials.online) sells social-media growth services
          (followers, likes, views, engagement), temporary virtual numbers for SMS verification, and
          pre-made social accounts. Orders are fulfilled through upstream provider networks; delivery
          speed and final counts vary by platform and package.
        </P>
        <P>
          <strong>2. Accounts & eligibility:</strong> You must be 18 or older. One account per person.
          You are responsible for keeping your password secret and for all activity under your account.
        </P>
        <P>
          <strong>3. Wallets & payments:</strong> The platform uses internal NGN and USDT wallets funded
          via Paystack (NGN) or manual USDT transfer. Wallet funds are store credit for platform
          services only and cannot be withdrawn or transferred out. A deposit fee may apply where shown
          before you pay. Minimum deposits are ₦100 and 5 USDT.
        </P>
        <P>
          <strong>4. Orders:</strong> Prices are calculated live at order time (provider cost + platform
          markup) and debited instantly. Always double-check your link/handle and quantity before
          submitting — delivery starts automatically and usually cannot be stopped mid-flight.
          Refill and cancellation are only available where the service page says so.
        </P>
        <P>
          <strong>5. Virtual numbers:</strong> Numbers are temporary activations (typically ~15 minutes).
          Enter the number in the target app promptly and read your code from this dashboard. Numbers
          with no SMS can be cancelled for an instant wallet refund.
        </P>
        <P>
          <strong>6. Account store:</strong> Pre-made accounts are one-per-buyer digital goods. Login
          details are revealed after payment and remain visible under "My Accounts". Change the
          password and linked email immediately after purchase.
        </P>
        <P>
          <strong>7. Fair use & termination:</strong> We may suspend accounts for fraud, chargebacks,
          spam, impersonation, or abuse of support/refund channels, with or without notice. Fraudulent
          deposits are forfeited. Questions: WhatsApp <strong>+2347018409997</strong>.
        </P>
      </>
    );
  }

  if (which === 'privacy') {
    return (
      <>
        <P>
          <strong>1. What we collect:</strong> name, username, email and password hash at signup;
          wallet balances and the full transaction ledger; orders, links/handles you submit;
          payments (amounts, references, blockchain TXIDs); support tickets and messages.
        </P>
        <P>
          <strong>2. What we never collect:</strong> no card numbers (Paystack processes cards on its
          own pages), no tracking cookies, no sale of personal data to anyone, ever.
        </P>
        <P>
          <strong>3. How it is protected:</strong> passwords are bcrypt-hashed; provider API keys and
          sold account credentials are AES-256 encrypted at rest; admin actions write tamper-evident
          audit logs. Access is limited to operating staff.
        </P>
        <P>
          <strong>4. Your rights:</strong> request a copy of your data, correction of mistakes, or
          deletion of your account at any time via a support ticket or WhatsApp{' '}
          <strong>+2347018409997</strong>. Financial rows (orders, payments) are kept anonymized for
          honest bookkeeping after deletion.
        </P>
      </>
    );
  }

  if (which === 'refund') {
    return (
      <>
        <P>
          <strong>1. No automatic instant refunds:</strong> to prevent duplicate reversals, customers
          cannot self-refund from the dashboard (except cancelling an SMS-less virtual number, which
          refunds instantly).
        </P>
        <P>
          <strong>2. How to claim:</strong> open a Support Ticket (category "Refund") or message our
          verified WhatsApp agent at <strong>+2347018409997</strong> with your order ID and what went
          wrong. Claims are strongest within 7 days of the order.
        </P>
        <P>
          <strong>3. Investigation:</strong> an administrator checks the order against the upstream
          provider ledger (start count, remains, provider status). Undelivered or short-delivered
          quantities are eligible; completed-as-ordered work is not.
        </P>
        <P>
          <strong>4. Payout:</strong> approved refunds are credited to your platform wallet in the
          original currency (NGN or USDT), never to bank/card, with a full audit entry you can see in
          Transaction History. Failed dispatches that never reach a provider are auto-refunded by the
          system without you asking.
        </P>
      </>
    );
  }

  return (
    <>
      <P>
        <strong>1. Lawful use only:</strong> no fraud, phishing, impersonation, hate speech,
        defamation, threats, or any activity illegal in Nigeria or the target platform's country.
      </P>
      <P>
        <strong>2. Platform rules:</strong> no spam or artificial manipulation that violates the terms
        of Instagram, TikTok, YouTube, X, Facebook, Telegram, WhatsApp or any service you boost; no
        botting, scraping, credential stuffing, or probing our API for vulnerabilities (report them
        instead — we appreciate it).
      </P>
      <P>
        <strong>3. Marketing honesty:</strong> services are sold for reach enhancement. We make no
        warranty of virality, monetization eligibility, permanent retention, or account safety on
        third-party platforms. Dropped quantities on refill-eligible services can be refilled; check
        eligibility on the service page.
      </P>
      <P>
        <strong>4. Enforcement:</strong> violations lead to order cancellation without refund,
        blacklisting (login blocked), or permanent deletion and forfeiture of fraudulent balances.
      </P>
    </>
  );
};
