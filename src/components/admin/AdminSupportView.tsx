import React, { useState, useEffect } from 'react';
import { Headphones, Send, CheckCircle2, RotateCw } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminSupportView: React.FC = () => {
  const { token, showToast } = useApp();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchTickets = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/support/tickets', {
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
    }
  };

  const fetchMessages = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
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
      fetchMessages(selectedTicketId);
    }
  }, [selectedTicketId]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTicketId || !replyText.trim()) return;

    setSending(true);
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
        fetchMessages(selectedTicketId);
        showToast('Reply dispatched to customer.', 'success');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!token || !selectedTicketId) return;
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Ticket status updated to ${status}.`, 'success');
        fetchTickets();
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const activeTicket = tickets.find(t => t.id === selectedTicketId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Support Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Resolve customer inquiries, order disputes, and refund reviews.
          </p>
        </div>

        <button
          onClick={fetchTickets}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh Tickets</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List: 4 cols */}
        <div className="lg:col-span-4 bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-bold text-slate-300 pb-2 border-b border-slate-800">
            Open Tickets ({tickets.length})
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tickets.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  selectedTicketId === t.id
                    ? 'bg-slate-850 border-indigo-500/50'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-mono text-cyan-400 font-semibold">{t.user_name || t.user_id}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">
                    {t.status}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate">{t.subject}</div>
                <div className="text-[10px] text-slate-400 mt-1">{new Date(t.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Conversation: 8 cols */}
        <div className="lg:col-span-8 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between min-h-[500px]">
          {activeTicket ? (
            <>
              <div className="pb-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-indigo-400 font-bold">#{activeTicket.id}</span>
                    <span className="text-xs text-slate-400">by {activeTicket.user_name}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">{activeTicket.subject}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdateStatus('resolved')}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition"
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('closed')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 py-4 overflow-y-auto space-y-4 max-h-[360px]">
                {messages.map(m => {
                  const isStaff = m.sender_role !== 'customer';
                  return (
                    <div key={m.id} className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}>
                      <div className="text-[10px] text-slate-400 mb-1 px-1 font-semibold">
                        {m.sender_name} {isStaff ? '(Staff Response)' : '(Customer)'}
                      </div>
                      <div
                        className={`p-3 rounded-2xl text-xs max-w-lg leading-relaxed ${
                          isStaff
                            ? 'bg-cyan-600 text-white rounded-tr-none'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {m.message}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  placeholder="Type administrative reply..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Reply</span>
                </button>
              </form>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select a ticket to inspect conversation thread.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
