import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, MessageSquarePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const LAST_SEEN_KEY = 'whats_new_last_seen';
const PAGE_SIZE = 7;

interface ReleaseNotification {
  id: string;
  title: string;
  description: string;
  category: string;
  button_label: string | null;
  discover_link: string;
  image_url: string | null;
  published_at: string;
}

/** Returns the count of notifications newer than the stored last-seen timestamp. */
export function useUnreadCount(notifications: { published_at: string }[]): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      setCount(notifications.length);
      return;
    }
    const ts = parseInt(lastSeen, 10);
    setCount(
      notifications.filter(n => new Date(n.published_at).getTime() > ts).length
    );
  }, [notifications]);

  return count;
}

interface WhatsNewDrawerProps {
  open: boolean;
  onClose: () => void;
  onSeen: () => void; // called after open so parent can clear badge
}

export function WhatsNewDrawer({ open, onClose, onSeen }: WhatsNewDrawerProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<ReleaseNotification[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('release_notifications')
        .select('id, title, description, category, discover_link, image_url, published_at')
        .order('published_at', { ascending: false });
      if (error) {
        setFetchError('Failed to load notifications.');
      } else if (data) {
        setNotifications(data as ReleaseNotification[]);
      }
    } catch {
      // Network error (e.g. Safari "Load failed") — silently ignore
    }
    setLoading(false);
  }, []);

  // Fetch once on mount
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Mark unread ids before clearing them
  useEffect(() => {
    if (!open) return;
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const ts = lastSeen ? parseInt(lastSeen, 10) : 0;
    const ids = new Set(
      notifications
        .filter(n => new Date(n.published_at).getTime() > ts)
        .map(n => n.id)
    );
    setUnreadIds(ids);

    // After a short delay, mark as seen and notify parent
    const t = setTimeout(() => {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      setUnreadIds(new Set());
      onSeen();
    }, 700);
    return () => clearTimeout(t);
  }, [open, notifications, onSeen]);

  const visible = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-[55] md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[60] w-[400px] max-w-[100vw] bg-[#1F1F21] flex flex-col',
          'transition-transform duration-300 ease-in-out',
          'rounded-l-2xl shadow-2xl',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-white font-mono">What's New</h2>
              {unreadIds.size > 0 && (
                <span className="bg-[#FFD528] text-[#1F1F21] text-[10px] font-black px-2 py-0.5 rounded-full">
                  {unreadIds.size} NEW
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Feature request CTA */}
          <button
            onClick={() => { navigate('/support'); onClose(); }}
            className="w-full flex items-center justify-between gap-3 bg-[#FFD528]/8 hover:bg-[#FFD528]/13 border border-[#FFD528]/20 rounded-xl px-4 py-3 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <MessageSquarePlus className="h-4 w-4 text-[#FFD528] shrink-0" />
              <div>
                <p className="text-[12px] font-bold text-white font-mono leading-tight">Request a Feature</p>
                <p className="text-[11px] text-white/40 font-mono">Tell us what you need next</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-white/25 shrink-0" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && notifications.length === 0 && (
            <p className="text-center text-white/30 text-xs font-mono py-12">Loading...</p>
          )}

          {visible.map(n => (
            <div
              key={n.id}
              className={cn(
                'rounded-xl overflow-hidden border transition-colors',
                unreadIds.has(n.id)
                  ? 'bg-[#FFD528]/7 border-[#FFD528]/25'
                  : 'bg-white/5 border-white/8'
              )}
            >
              {/* Image */}
              {n.image_url ? (
                <img
                  src={n.image_url}
                  alt={n.title}
                  className="w-full h-[140px] object-cover block"
                />
              ) : (
                <div className="w-full h-[140px] bg-[#2a2a2c] flex items-center justify-center">
                  <span className="text-[10px] text-white/20 uppercase tracking-widest font-mono">Feature image</span>
                </div>
              )}

              {/* Body */}
              <div className="p-3.5 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[#FFD528]/15 text-[#FFD528] px-2 py-0.5 rounded-full shrink-0">
                    {n.category}
                  </span>
                  <span className="text-[10px] text-white/30 font-mono shrink-0">
                    {new Date(n.published_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <h3 className="text-[13px] font-bold text-white font-mono leading-snug mb-1.5 break-words">{n.title}</h3>
                <p className="text-[11px] text-white/50 font-mono leading-relaxed mb-3 whitespace-pre-wrap break-words">{n.description}</p>
                <button
                  onClick={() => {
                    if (n.discover_link.startsWith('http')) {
                      window.open(n.discover_link, '_blank', 'noopener,noreferrer');
                    } else {
                      navigate(n.discover_link);
                    }
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#FFD528] text-[#1F1F21] text-[11px] font-bold px-3 py-1.5 rounded-md font-mono"
                >
                  {n.button_label || `Discover ${n.category}`}
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="w-full py-2.5 text-[12px] font-semibold text-white/40 border border-white/10 rounded-lg font-mono hover:text-white/70 hover:border-white/20 transition-colors"
            >
              See more releases
            </button>
          )}

          {fetchError && (
            <p className="text-center text-red-400 text-xs font-mono py-12">{fetchError}</p>
          )}
          {!fetchError && !loading && notifications.length === 0 && (
            <p className="text-center text-white/25 text-xs font-mono py-12">No releases yet</p>
          )}
        </div>
      </div>
    </>
  );
}
