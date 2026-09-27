import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  CreditCard,
  QrCode,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  RotateCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { Currency, Transaction } from '../../types/index.js';

export const WalletView: React.FC = () => {
  const { user, token, wallets, settings, refreshUserData, showToast } = useApp();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Modals state
  const [showPaystackModal, setShowPaystackModal] = useState(false);
  const [showUsdtModal, setShowUsdtModal] = useState(false);

  // Paystack Form
  const [ngnDepositAmount, setNgnDepositAmount] = useState<number>(5000);
  const [isDepositingPaystack, setIsDepositingPaystack] = useState(false);

  // USDT Form
  const [usdtDepositAmount, setUsdtDepositAmount] = useState<number>(20);
  const [usdtTxid, setUsdtTxid] = useState('');
  const [isSubmittingUsdt, setIsSubmittingUsdt] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const usdtDepositAddress = settings?.usdt_trc20_address || '';

  const ngnWallet = wallets.find(w => w.currency === 'NGN');
  const usdtWallet = wallets.find(w => w.currency === 'USDT');

  // Fetch Transaction Ledger
  const fetchTransactions = async () => {
    if (!token) return;
    setLoadingTx(true);
    try {
      const res = await fetch('/api/wallet/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [token]);

  // Handle Paystack Deposit
  const handlePaystackDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minDeposit = settings?.min_deposit_ngn ?? 100;
    if (!token || ngnDepositAmount < minDeposit) {
      showToast(`Minimum deposit is ₦${minDeposit.toLocaleString()}.`, 'error');
      return;
    }

    const publicKey = settings?.paystack_public_key;
    if (!publicKey) {
      showToast('Payment provider is not configured. Please contact support.', 'error');
      return;
    }

    if (typeof (window as any).PaystackPop === 'undefined') {
      showToast('Payment SDK failed to load. Please refresh the page and try again.', 'error');
      return;
    }

    setIsDepositingPaystack(true);
    try {
      // 1. Initialize deposit record + get a reference from our own server
      const initRes = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: ngnDepositAmount })
      });
      const initData = await initRes.json().catch(() => null);

      if (!initRes.ok || !initData?.success) {
        showToast(initData?.error || 'Failed to initialize Paystack deposit.', 'error');
        setIsDepositingPaystack(false);
        return;
      }

      // 2. Open the real Paystack popup and let the user actually pay
      const handler = (window as any).PaystackPop.setup({
        key: publicKey,
        email: initData.email,
        amount: Math.round(initData.amount * 100), // Paystack expects kobo
        currency: 'NGN',
        ref: initData.reference,
        callback: (response: any) => {
          // 3. Only now, after Paystack confirms the popup succeeded, ask our
          // server to independently verify against Paystack's API and credit the wallet.
          fetch(`/api/payments/paystack/verify/${encodeURIComponent(response.reference)}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
            .then(res => res.json())
            .then(verifyData => {
              if (verifyData?.success) {
                showToast(`₦${ngnDepositAmount.toLocaleString()} credited to your NGN wallet!`, 'success');
                setShowPaystackModal(false);
                refreshUserData();
                fetchTransactions();
              } else {
                showToast(verifyData?.error || 'Payment verification failed. If you were charged, contact support with your reference.', 'error');
              }
            })
            .catch(() => {
              showToast('Could not confirm payment with our server. If you were charged, contact support with your reference.', 'error');
            })
            .finally(() => setIsDepositingPaystack(false));
        },
        onClose: () => {
          setIsDepositingPaystack(false);
        }
      });

      handler.openIframe();
    } catch (err: any) {
      showToast(err.message || 'Error executing payment.', 'error');
      setIsDepositingPaystack(false);
    }
  };

  // Handle USDT Submission
  const handleUsdtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || usdtDepositAmount < 10) {
      showToast('Minimum USDT deposit is 10 USDT.', 'error');
      return;
    }
    if (!usdtTxid.trim()) {
      showToast('Please enter the Blockchain Transaction Hash (TXID).', 'error');
      return;
    }

    setIsSubmittingUsdt(true);
    try {
      const res = await fetch('/api/payments/usdt/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(usdtDepositAmount),
          tx_hash: usdtTxid.trim(),
          network: 'TRC-20'
        })
      });
      const data = await res.json();

      if (data.success) {
        showToast('USDT deposit submitted! Admin will verify and credit your wallet.', 'success');
        setShowUsdtModal(false);
        setUsdtTxid('');
        await fetchTransactions();
      } else {
        showToast(data.error || 'Submission failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setIsSubmittingUsdt(false);
    }
  };

  const copyAddress = () => {
    if (!usdtDepositAddress) {
      showToast('Deposit address is not configured yet. Please contact support.', 'error');
      return;
    }
    navigator.clipboard.writeText(usdtDepositAddress);
    setCopiedAddress(true);
    showToast('Platform USDT address copied to clipboard.', 'info');
    setTimeout(() => setCopiedAddress(false), 3000);
  };

  // Calculate Paystack fee preview (3% payment gateway charge)
  const paystackFee = ngnDepositAmount * 0.03;
  const paystackTotal = ngnDepositAmount + paystackFee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Wallet & Ledger</h1>
          <p className="text-xs text-slate-400 mt-1">
            Dual NGN and USDT balances with immutable audit history.
          </p>
        </div>

        <button
          onClick={fetchTransactions}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Dual Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* NGN Card */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-indigo-500/30 shadow-xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Nigerian Naira (NGN)</div>
                <div className="text-xs font-semibold text-white">Local Payments & Cards</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 font-bold">
              PAYSTACK
            </span>
          </div>

          <div className="pt-2">
            <div className="text-[11px] text-slate-400">Available Balance</div>
            <div className="text-3xl font-extrabold font-mono text-white tracking-tight">
              ₦{ngnWallet?.available_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={() => setShowPaystackModal(true)}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Fund NGN (Paystack)</span>
            </button>
          </div>
        </div>

        {/* USDT Card */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-emerald-500/30 shadow-xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Tether (USDT)</div>
                <div className="text-xs font-semibold text-white">Blockchain Cryptocash</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
              TRC-20
            </span>
          </div>

          <div className="pt-2">
            <div className="text-[11px] text-slate-400">Available Balance</div>
            <div className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight">
              {usdtWallet?.available_balance !== undefined ? usdtWallet.available_balance.toFixed(2) : '0.00'}{' '}
              <span className="text-xs text-slate-400 font-normal">USDT</span>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={() => setShowUsdtModal(true)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Deposit USDT</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-display text-white">Transaction History</h2>
            <p className="text-xs text-slate-400">
              Complete credit, debit, and verified refund audit trail
            </p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            No transactions found on this account yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Balance After</th>
                  <th className="py-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map(tx => {
                  const isCredit = tx.type === 'deposit' || tx.type === 'refund';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-white text-[11px]">
                        {tx.reference}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.type === 'deposit'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : tx.type === 'refund'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                        {tx.description}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold whitespace-nowrap">
                        <span className={isCredit ? 'text-emerald-400' : 'text-rose-400'}>
                          {isCredit ? '+' : '-'}{' '}
                          {tx.currency === 'NGN'
                            ? `₦${(tx.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : `${(tx.amount ?? 0).toFixed(2)} USDT`}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {tx.currency === 'NGN'
                          ? `₦${(tx.balance_after ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : `${(tx.balance_after ?? 0).toFixed(2)} USDT`}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAYSTACK MODAL */}
      {showPaystackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 sm:p-8 text-slate-100 shadow-2xl">
            <button
              onClick={() => setShowPaystackModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold font-display text-white">Deposit NGN via Paystack</h3>
              <p className="text-xs text-slate-400 mt-1">
                Instant credit via Cards, USSD, and Bank Transfer.
              </p>
            </div>

            <form onSubmit={handlePaystackDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Amount to Fund (₦)
                </label>
                <input
                  type="number"
                  min={settings?.min_deposit_ngn ?? 100}
                  step={100}
                  required
                  value={ngnDepositAmount}
                  onChange={e => setNgnDepositAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Quick Select Buttons */}
              <div className="grid grid-cols-5 gap-2">
                {[100, 500, 2000, 5000, 10000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNgnDepositAmount(val)}
                    className="py-1 px-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-300 transition text-center"
                  >
                    ₦{val.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Transparent 3% Payment Gateway Fee Breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Credit to Wallet:</span>
                  <span className="font-mono text-white">₦{ngnDepositAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Processing Fee (3%):</span>
                  <span className="font-mono text-slate-300">₦{paystackFee.toLocaleString()}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold text-white">
                  <span>Total Payable:</span>
                  <span className="font-mono text-cyan-400">₦{paystackTotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isDepositingPaystack || ngnDepositAmount < (settings?.min_deposit_ngn ?? 100)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {isDepositingPaystack ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Proceed to Paystack</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* USDT MODAL */}
      {showUsdtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 sm:p-8 text-slate-100 shadow-2xl space-y-4">
            <button
              onClick={() => setShowUsdtModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              ✕
            </button>

            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold font-display text-white">Deposit USDT (TRC-20)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Send USDT to the address below, then submit your transaction hash.
              </p>
            </div>

            {/* Platform TRC-20 Address */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Official TRC-20 Deposit Address
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono text-xs font-semibold truncate ${usdtDepositAddress ? 'text-emerald-400' : 'text-slate-500 italic'}`}>
                  {usdtDepositAddress || 'Deposit address loading or not configured...'}
                </span>
                <button
                  type="button"
                  onClick={copyAddress}
                  disabled={!usdtDepositAddress}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition cursor-pointer"
                  title="Copy TRC-20 Address"
                >
                  {copiedAddress ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <form onSubmit={handleUsdtSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Amount Transferred (USDT)
                </label>
                <input
                  type="number"
                  min={10}
                  step={1}
                  required
                  value={usdtDepositAmount}
                  onChange={e => setUsdtDepositAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Blockchain Transaction Hash (TXID)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5f8a7e3b9c2d1..."
                  value={usdtTxid}
                  onChange={e => setUsdtTxid(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-[11px] text-slate-300">
                <span className="font-semibold text-emerald-300">Verification note:</span> Deposits are verified against the Tron blockchain ledger by an administrator before appearing in your balance.
              </div>

              <button
                type="submit"
                disabled={isSubmittingUsdt || !usdtDepositAddress}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmittingUsdt ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Submit Deposit for Verification</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
