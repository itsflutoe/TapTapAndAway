import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Delivery, Profile } from '../types';
import PageHeader from '../components/PageHeader';
import ReportModal from '../components/ReportModal';
import UserAvatar from '../components/UserAvatar';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';
import { formatSmartTime } from '../lib/utils';

interface RawItem {
  message: Message;
  delivery: Delivery | null;
  other: Profile | null;
  otherSprite: string | null;
}

interface Thread {
  otherId: string;
  other: Profile | null;
  otherSprite: string | null;
  lastMessage: Message;
  lastDelivery: Delivery | null;
  unread: number;
}

const RECEIVER_VISIBLE = new Set(['DELIVERED', 'READ']);

function isVisibleToUser(message: Message, delivery: Delivery | null, userId: string): boolean {
  if (message.sender_id === userId) return true;
  if (!delivery) return false;
  return RECEIVER_VISIBLE.has(delivery.status);
}

/** Receiver: no body until delivered. Sender may see own text. */
function previewLine(
  message: Message,
  delivery: Delivery | null,
  userId: string
): string {
  const isSender = message.sender_id === userId;
  const flying =
    delivery &&
    ['FLYING', 'DISPATCHED', 'PREPARING', 'ARRIVED'].includes(delivery.status);

  if (!isSender) {
    // Receiver: never show content until delivered
    if (!delivery || !RECEIVER_VISIBLE.has(delivery.status)) {
      return '';
    }
    return message.content;
  }

  // Sender
  if (flying) return 'Sent · pigeon en route…';
  if (delivery?.status === 'FAILED') return 'Failed to deliver';
  return `You: ${message.content}`;
}

function statusTag(delivery: Delivery | null, unread: boolean): string {
  if (!delivery) return '';
  if (['FLYING', 'DISPATCHED', 'PREPARING'].includes(delivery.status)) return 'En route';
  if (delivery.status === 'ARRIVED') return 'Arrived';
  if (delivery.status === 'FAILED') return 'Failed';
  if (unread) return 'New';
  if (delivery.status === 'READ') return 'Read';
  if (delivery.status === 'DELIVERED') return 'Delivered';
  return '';
}

export default function InboxPage() {
  const { user } = useAuth();
  const [raw, setRaw] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [reportTarget, setReportTarget] = useState<{
    id: string;
    username: string;
    messageId?: string;
  } | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    // Resolve flights past ETA even if Delivery page was never opened
    try {
      await resolveOverdueDeliveriesForUser(user.id);
    } catch {
      /* non-fatal */
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!messages?.length) {
      setRaw([]);
      setLoading(false);
      return;
    }

    const otherIds = [
      ...new Set(
        messages.map((m) => (m.sender_id === user.id ? m.receiver_id : m.sender_id))
      ),
    ];
    const msgIds = messages.map((m) => m.id);

    const [{ data: profiles }, { data: deliveries }, { data: pigeons }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', otherIds),
      supabase.from('deliveries').select('*').in('message_id', msgIds),
      supabase.from('pigeons').select('owner_id, sprite_id').in('owner_id', otherIds).eq('is_active', true),
    ]);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p as Profile]));
    const delMap = new Map((deliveries || []).map((d) => [d.message_id, d as Delivery]));
    const spriteMap = new Map(
      (pigeons || []).map((p) => [p.owner_id, (p as { sprite_id?: string }).sprite_id ?? null])
    );

    const enriched: RawItem[] = [];
    for (const m of messages) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const delivery = delMap.get(m.id) ?? null;
      const message = m as Message;
      if (!isVisibleToUser(message, delivery, user.id)) continue;
      enriched.push({
        message,
        delivery,
        other: profileMap.get(otherId) ?? null,
        otherSprite: spriteMap.get(otherId) ?? null,
      });
    }

    setRaw(enriched);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const threads: Thread[] = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, Thread>();
    for (const item of raw) {
      const otherId =
        item.message.sender_id === user.id ? item.message.receiver_id : item.message.sender_id;
      const isReceiver = item.message.receiver_id === user.id;
      const deliveredOk =
        item.delivery && RECEIVER_VISIBLE.has(item.delivery.status);
      const thisUnread = isReceiver && !item.message.read_at && !!deliveredOk ? 1 : 0;

      const existing = map.get(otherId);
      if (!existing) {
        map.set(otherId, {
          otherId,
          other: item.other,
          otherSprite: item.otherSprite,
          lastMessage: item.message,
          lastDelivery: item.delivery,
          unread: thisUnread,
        });
      } else {
        existing.unread += thisUnread;
        // raw is newest-first; first wins as lastMessage
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    );
  }, [raw, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const u = t.other;
      if (!u) return false;
      return (
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q) ||
        u.pigeon_id.toLowerCase().includes(q)
      );
    });
  }, [threads, query]);

  return (
    <div className="page">
      <PageHeader title="Inbox" />

      <div style={{ marginBottom: 14 }}>
        <input
          className="search-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, username, PID…"
        />
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card empty-state">
          <div className="emoji">📬</div>
          <p className="muted">
            {query.trim() ? 'No matches.' : 'No messages yet. Send a pigeon!'}
          </p>
          {!query.trim() && (
            <Link to="/send" className="btn btn-primary" style={{ marginTop: 16 }}>
              Send
            </Link>
          )}
        </div>
      )}

      <div>
        {filtered.map((t) => {
          const del = t.lastDelivery;
          const preview = previewLine(t.lastMessage, del, user!.id);
          const tag = statusTag(del, t.unread > 0);
          const href = `/inbox/${t.otherId}`;
          const isNew = t.unread > 0;
          const pillClass =
            tag === 'En route' ? 'route' : tag === 'New' ? 'new' : tag === 'Failed' ? 'fail' : '';

          return (
            <div key={t.otherId} style={{ marginBottom: 8 }}>
              <Link to={href} className={`list-row ${isNew ? 'unread' : ''}`}>
                <UserAvatar name={t.other?.display_name} src={t.other?.avatar_url} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: isNew ? 800 : 700,
                      }}
                    >
                      {t.other?.display_name || 'Unknown'}
                    </strong>
                    <span className="caption" style={{ flexShrink: 0 }}>
                      {formatSmartTime(t.lastMessage.created_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {tag && <span className={`status-pill ${pillClass}`}>{tag}</span>}
                    {preview ? (
                      <span
                        className="muted"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preview}
                      </span>
                    ) : null}
                  </div>
                </div>
                {isNew && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                )}
              </Link>
              {t.other && (
                <button
                  type="button"
                  className="caption"
                  onClick={() =>
                    setReportTarget({
                      id: t.other!.id,
                      username: t.other!.username,
                      messageId: t.lastMessage.id,
                    })
                  }
                  style={{ margin: '4px 4px 0 auto', display: 'block' }}
                >
                  Report
                </button>
              )}
            </div>
          );
        })}
      </div>

      {reportTarget && (
        <ReportModal
          reportedUserId={reportTarget.id}
          reportedUsername={reportTarget.username}
          messageId={reportTarget.messageId}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
