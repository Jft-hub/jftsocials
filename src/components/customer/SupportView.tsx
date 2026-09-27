import React, { useState, useEffect } from 'react';
import {
  Headphones,
  MessageCircle,
  PlusCircle,
  Send,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  FileText
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { SupportTicket, TicketMessage } from '../../types/index.js';
import { WhatsAppBadge } from '../layout/WhatsAppBadge.js';

export const SupportView: React.FC = () => {
  const { token, user, showToast } = useApp();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // New Ticket Form state
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [category, setCategory] = useState<'order' | 'payment' | 'refund' | 'technical' | 'general'>('order');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  const whatsappNumber = '+2347018409997';

  // Fetch Tickets
  const fetchTickets = async () => {
    if (!token) return;
    setLoadingTickets(true);
    try {
      const res = await fetch('/api/support/tickets', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
        if (data.tickets.length > 0 && !selectedTicketId) {
          setSelectedTicketId(data.tickets[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTickets(false);
    }
  };

  // Fetch specific ticket messages
  const fetchTicketDetails = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setTicketMessages(data.messages || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [token]);

  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetails(selectedTicketId);
    }
  }, [selectedTicketId]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !subject.trim() || !initialMessage.trim()) return;

    setCreatingTicket(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category, subject, message: initialMessage })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Ticket submitted successfully.', 'success');
        setShowNewTicketModal(false);
        setSubject('');
        setInitialMessage('');
        await fetchTickets();
        setSelectedTicketId(data.ticket.id);
      } else {
        showToast(data.error || 'Failed to create ticket.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTicketId || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicketId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: replyText.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        await fetchTicketDetails(selectedTicketId);
      } else {
        showToast(data.error || 'Failed to send reply.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const activeTicket = tickets.find(t => t.id === selectedTicketId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#0b0f19] border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Support & Assistance</h1>
          <p className="text-xs text-slate-400 mt-1">
            Fast ticketing system & priority human support via WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewTicketModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Ticket</span>
          </button>
        </div>
      </div>

      {/* WhatsApp Hero Support Banner */}
      <WhatsAppBadge variant="banner" message="Hello JFT Socials Support! I need priority assistance with my account/order." />

      {/* Main Support Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tickets List: 4 cols */}
        <div className="lg:col-span-4 bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300">Your Tickets ({tickets.length})</span>
            <button
              onClick={fetchTickets}
              className="text-[11px] text-cyan-400 hover:underline"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tickets.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No tickets opened yet.
              </div>
            ) : (
              tickets.map(ticket => {
                const isSelected = ticket.id === selectedTicketId;
                const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-slate-850 border-indigo-500/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono text-slate-400 uppercase font-bold text-[10px]">
                        {ticket.category}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isResolved
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>

                    <div className="font-semibold text-white text-xs truncate">
                      {ticket.subject}
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation Thread: 8 cols */}
        <div className="lg:col-span-8 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between min-h-[500px]">
          {activeTicket ? (
            <>
              {/* Ticket Header */}
              <div className="pb-4 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-indigo-400 font-bold">
                      #{activeTicket.id}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">
                      {activeTicket.category}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Opened {new Date(activeTicket.created_at).toLocaleString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold font-display text-white mt-1">
                  {activeTicket.subject}
                </h3>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 py-4 overflow-y-auto space-y-4 max-h-[380px]">
                {ticketMessages.map(msg => {
                  const isCustomer = msg.sender_role === 'customer';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1 px-1">
                        <span className="font-semibold text-slate-300">
                          {msg.sender_name} {isCustomer ? '(You)' : '• Staff Agent'}
                        </span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`p-3 rounded-2xl text-xs max-w-lg leading-relaxed ${
                          isCustomer
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  placeholder="Type your reply to staff..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 space-y-2">
              <Headphones className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm">Select a ticket from the left panel or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Transparent Refund Policy Explainer */}
      <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-3">
        <div className="flex items-center gap-2 font-bold text-sm text-white">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          <span>Understanding our Investigation & Refund Policy</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          To maintain upstream node balance and protect against duplicate transactions, JFT Socials executes all refund claims through a supervised administrator review.
          If an order encounters an upstream failure or partial drop, select category <strong>"Refund"</strong> in a support ticket or ping our verified WhatsApp agent at <strong className="text-emerald-400">{whatsappNumber}</strong>. Once approved, the exact charge is credited directly back to your NGN or USDT wallet balance.
        </p>
      </div>

      {/* NEW TICKET MODAL */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 sm:p-8 text-slate-100 shadow-2xl space-y-4">
            <button
              onClick={() => setShowNewTicketModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              ✕
            </button>

            <div className="text-center">
              <h3 className="text-lg font-bold font-display text-white">Open Support Ticket</h3>
              <p className="text-xs text-slate-400 mt-1">Our support agents respond within minutes.</p>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ticket Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="order">Order Tracking / Status</option>
                  <option value="refund">Refund Claim / Investigation</option>
                  <option value="payment">Deposit / Payment Inquiry</option>
                  <option value="technical">Technical / API Issue</option>
                  <option value="general">General Support</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Order #ord_123 Inquiry"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Describe the Issue
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide all relevant details, target link, or order ID..."
                  value={initialMessage}
                  onChange={e => setInitialMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={creatingTicket}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {creatingTicket ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Submit Ticket</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
