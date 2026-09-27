import React from 'react';
import { MessageCircle, ExternalLink } from 'lucide-react';

interface WhatsAppProps {
  variant?: 'floating' | 'button' | 'banner';
  message?: string;
  className?: string;
}

export const WhatsAppBadge: React.FC<WhatsAppProps> = ({
  variant = 'floating',
  message = 'Hello JFT Socials Support! I would like assistance with my account/order.',
  className = ''
}) => {
  const whatsappNumber = '+2347018409997';
  const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '');
  const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;

  if (variant === 'button') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold text-sm transition-all shadow-lg shadow-[#25D366]/20 active:scale-[0.98] ${className}`}
      >
        <MessageCircle className="w-5 h-5 fill-current" />
        <span>Talk to an Agent on WhatsApp</span>
        <ExternalLink className="w-4 h-4 opacity-75" />
      </a>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 backdrop-blur-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#25D366]/20 border border-[#25D366]/30 flex items-center justify-center text-[#25D366] shrink-0">
            <MessageCircle className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>Instant Human Support</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-normal">Online</span>
            </div>
            <p className="text-xs text-slate-300">
              Direct verification, refund inquiries & fast assistance on WhatsApp: <span className="font-mono text-emerald-300 font-semibold">{whatsappNumber}</span>
            </p>
          </div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white font-medium text-xs whitespace-nowrap transition shadow-md shadow-[#25D366]/20"
        >
          <span>Chat on WhatsApp</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  // Floating variant (pinned to bottom right)
  return (
    <div className={`fixed bottom-5 right-5 z-40 flex items-center gap-3 ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#25D366] hover:bg-[#20ba59] text-white font-medium text-sm shadow-xl shadow-black/50 border border-emerald-400/30 transition-all duration-300 hover:scale-105 active:scale-95"
        title="Talk to an Agent on WhatsApp"
        aria-label="Talk to an Agent on WhatsApp"
      >
        <MessageCircle className="w-5 h-5 fill-current" />
        <span className="hidden sm:inline font-semibold">Talk to an Agent on WhatsApp</span>
        <span className="sm:hidden font-semibold">WhatsApp</span>
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      </a>
    </div>
  );
};
