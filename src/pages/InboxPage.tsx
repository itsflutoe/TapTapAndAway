import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Delivery, Profile } from '../types';
import { formatDistanceToNow } from 'date-fns';
import PageHeader from '../components/PageHeader';
import ReportModal from '../components/ReportModal';
import PigeonAvatar from '../components/PigeonAvatar';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';

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
  if (['FLYING', 'DISPATCHED', 'PREPARING'].includes(delivery.status)) return 'Flying';
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

  const unreadTotal = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <div className="page">
      <PageHeader
        title="📬 Inbox"
        right={
          unreadTotal > 0 ? (
            <span
              style={{
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                minWidth: 22,
                textAlign: 'center',
              }}
            >
              {unreadTotal}
            </span>
          ) : null
        }
      />

      <div className="card" style={{ marginBottom: 12, padding: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, username, PID…"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {query.trim() ? 'No matches.' : 'No messages yet. Send a pigeon!'}
          </p>
          {!query.trim() && (
            <Link to="/send" className="btn btn-primary" style={{ marginTop: 16 }}>
              Send
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((t) => {
          const del = t.lastDelivery;
          const preview = previewLine(t.lastMessage, del, user!.id);
          const tag = statusTag(del, t.unread > 0);
          const href = `/inbox/${t.otherId}`;
          const isNew = t.unread > 0;

          return (
            <div
              key={t.otherId}
              className="card"
              style={{
                borderLeft: isNew ? '4px solid var(--accent)' : '4px solid transparent',
                background: isNew ? '#f0f7ff' : undefined,
                padding: 12,
              }}
            >
              <Link to={href} style={{ display: 'flex', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                <PigeonAvatar
                  spriteId={t.otherSprite}
                  size={48}
                  name={t.other?.display_name}
                  animate={false}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: isNew ? 700 : 600,
                      }}
                    >
                      {t.other?.display_name || 'Unknown'}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {formatDistanceToNow(new Date(t.lastMessage.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {tag && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 6,
                          background:
                            tag === 'Flying'
                              ? '#fff4e5'
                              : tag === 'New'
                                ? 'var(--accent)'
                                : '#f2f2f7',
                          color: tag === 'New' ? '#fff' : '#333',
                          flexShrink: 0,
                        }}
                      >
                        {tag}
                      </span>
                    )}
                    {preview ? (
                      <span
                        style={{
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preview}
                      </span>
                    ) : null}
                  </div>
                  {t.unread > 1 && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                      {t.unread} unread
                    </div>
                  )}
                </div>
                {isNew && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                )}
              </Link>
              {t.other && (
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      id: t.other!.id,
                      username: t.other!.username,
                      messageId: t.lastMessage.id,
                    })
                  }
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: '#f2f2f7',
                    cursor: 'pointer',
                  }}
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
