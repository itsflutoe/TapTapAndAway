import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import type { Delivery, Message, Profile } from '../types';
import PigeonAvatar from '../components/PigeonAvatar';
import PageHeader from '../components/PageHeader';
import {
  haversineKm,
  calculateStampCost,
  fetchKmPerStamp,
  calculateFlightSeconds,
  applyTimeMultiplier,
  getWeatherForRoute,
  formatDuration,
} from '../lib/geo';
import {
  getEventEffects,
  sendPigeonMessage,
  markMessageRead,
  resolveOverdueDeliveriesForUser,
} from '../services/messaging';

interface ChatMessage {
  message: Message;
  delivery: Delivery | null;
  visible: boolean;
}

const RECEIVER_VISIBLE = new Set(['DELIVERED', 'READ']);

function messageIsVisible(message: Message, delivery: Delivery | null, userId: string) {
  if (message.sender_id === userId) return true;
  return !!delivery && RECEIVER_VISIBLE.has(delivery.status);
}

function estimatedProgressPercent(delivery: Delivery): number {
  const stored = Number(delivery.progress_percent) || 0;
  if (stored > 0) return Math.min(100, stored);
  if (!delivery.actual_departure || !delivery.estimated_duration_seconds) return 0;
  const start = new Date(delivery.actual_departure).getTime();
  const dur = Number(delivery.estimated_duration_seconds) * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return 0;
  const pct = ((Date.now() - start) / dur) * 100;
  return Math.max(0, Math.min(100, pct));
}

function messageStatus(message: Message, delivery: Delivery | null, userId: string) {
  if (message.sender_id !== userId) return '';
  if (!delivery) return 'Sending…';
  if (delivery.status === 'FAILED') return 'Failed · Stamps refunded';
  if (['DISPATCHED', 'PREPARING', 'FLYING', 'ARRIVED'].includes(delivery.status)) {
    const pct = estimatedProgressPercent(delivery);
    const remaining = Math.max(
      0,
      Math.round((1 - pct / 100) * (Number(delivery.estimated_duration_seconds) || 0))
    );
    return `En route · ~${formatDuration(remaining)}`;
  }
  if (delivery.status === 'READ') return 'Read';
  if (delivery.status === 'DELIVERED') return 'Delivered';
  return '';
}

export default function ConversationPage() {
  const { userId: peerId } = useParams();
  const navigate = useNavigate();
  const { user, profile, pigeon, refreshProfile } = useAuth();
  const [peer, setPeer] = useState<Profile | null>(null);
  const [peerSprite, setPeerSprite] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    distanceKm: number;
    cost: number;
    speed: number;
    durationSec: number;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadPeerAndMessages = async () => {
    if (!user || !peerId) return;
    setLoading(true);

    // Finish overdue flights even if peer is offline and Delivery map was never opened
    try {
      await resolveOverdueDeliveriesForUser(user.id);
    } catch {
      /* non-fatal */
    }

    const [{ data: peerData }, { data: peerPigeon }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', peerId).maybeSingle(),
      supabase
        .from('pigeons')
        .select('sprite_id')
        .eq('owner_id', peerId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!peerData) {
      setPeer(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    const other = peerData as Profile;
    setPeer(other);
    setPeerSprite((peerPigeon as { sprite_id?: string } | null)?.sprite_id ?? null);

    const { data: messageRows } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(200);

    const rows = (messageRows || []) as Message[];
    const ids = rows.map((m) => m.id);
    let deliveries: Delivery[] = [];

    if (ids.length) {
      const { data: deliveryRows } = await supabase
        .from('deliveries')
        .select('*')
        .in('message_id', ids);
      deliveries = (deliveryRows || []) as Delivery[];
    }

    const deliveryMap = new Map(deliveries.map((d) => [d.message_id, d]));

    const chatRows: ChatMessage[] = rows.map((m) => {
      const delivery = deliveryMap.get(m.id) ?? null;
      return {
        message: m,
        delivery,
        visible: messageIsVisible(m, delivery, user.id),
      };
    });

    setMessages(chatRows);
    setLoading(false);

    const unread = chatRows.filter(
      (row) =>
        row.message.receiver_id === user.id &&
        row.visible &&
        !row.message.read_at &&
        row.delivery &&
        RECEIVER_VISIBLE.has(row.delivery.status)
    );

    if (unread.length) {
      await Promise.all(unread.map((row) => markMessageRead(row.message.id)));
      setMessages((current) =>
        current.map((row) =>
          unread.some((u) => u.message.id === row.message.id)
            ? {
                ...row,
                message: { ...row.message, read_at: new Date().toISOString() },
                delivery:
                  row.delivery && row.delivery.status === 'DELIVERED'
                    ? { ...row.delivery, status: 'READ' }
                    : row.delivery,
              }
            : row
        )
      );
    }
  };

  useEffect(() => {
    void loadPeerAndMessages();
    if (!user || !peerId) return;

    const channel = supabase
      .channel(`conversation-${user.id}-${peerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadPeerAndMessages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        void loadPeerAndMessages();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, peerId]);

  useEffect(() => {
    if (!profile || !peer) {
      setPreview(null);
      return;
    }

    // Pull the nullable fields into local consts right here, where the null
    // check happens. TypeScript's narrowing of `profile.latitude` etc. does
    // not survive into the nested async closure below, so we capture fixed
    // `number` values now instead of re-reading the properties inside it.
    const myLat = profile.latitude;
    const myLng = profile.longitude;
    const peerLat = peer.latitude;
    const peerLng = peer.longitude;

    if (myLat == null || myLng == null || peerLat == null || peerLng == null) {
      setPreview(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const distanceKm = haversineKm(myLat, myLng, peerLat, peerLng);
      const kmPerStamp = await fetchKmPerStamp(async (key) => {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        if (data?.value == null) return null;
        return typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
      });

      const effects = await getEventEffects();
      let cost = calculateStampCost(distanceKm, kmPerStamp);
      if (effects.free_sends) cost = 0;
      else if (effects.stamp_multiplier > 1) {
        cost = Math.max(1, Math.ceil(cost / effects.stamp_multiplier));
      }

      const weather = await getWeatherForRoute(myLat, myLng, peerLat, peerLng);
      const speed = 100 * weather.multiplier * (effects.speed_multiplier || 1);
      const realSec = calculateFlightSeconds(distanceKm, speed);

      let multiplier = 1;
      const { data: multData } = await supabase.rpc('get_time_multiplier');
      if (multData != null && Number(multData) > 0) multiplier = Number(multData);

      const durationSec = applyTimeMultiplier(realSec, multiplier);

      if (!cancelled) {
        setPreview({
          distanceKm: Math.round(distanceKm * 10) / 10,
          cost,
          speed: Math.round(speed * 10) / 10,
          durationSec,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, peer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const canSend = useMemo(
    () =>
      !!user &&
      !!profile &&
      !!pigeon &&
      !!peer &&
      !!content.trim() &&
      !sending &&
      !!preview,
    [user, profile, pigeon, peer, content, sending, preview]
  );

  const handleSend = async () => {
    if (!user || !profile || !pigeon || !peer || !preview || !content.trim()) return;

    if (preview.cost > 0 && profile.stamp_balance < preview.cost) {
      setError('Not enough Stamps.');
      return;
    }

    setSending(true);
    setError('');

    try {
      await sendPigeonMessage({
        senderId: user.id,
        receiverId: peer.id,
        content,
        senderProfile: profile,
        receiverProfile: peer,
        pigeonId: pigeon.id,
      });

      setContent('');
      await refreshProfile();
      await loadPeerAndMessages();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!peerId) {
    return <NavigateFallback />;
  }

  if (!peer && !loading) {
    return (
      <div className="page">
        <PageHeader title="💬 Conversation" />
        <div className="card">
          <p style={{ color: 'var(--text-secondary)' }}>User not found.</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/inbox')}>
            Back to messages
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100dvh - 24px)',
        paddingBottom: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 10,
          borderBottom: '1px solid var(--border)',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/inbox')}
          aria-label="Back to messages"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: '1px solid var(--border)',
            background: '#fff',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <PigeonAvatar
          spriteId={peerSprite}
          size={42}
          name={peer?.display_name}
          animate={false}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {peer?.display_name || 'Conversation'}
          </strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {peer?.pigeon_id || ''}
          </span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 2px 12px',
          minHeight: 0,
        }}
      >
        {loading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Loading…</p>}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <PigeonAvatar spriteId={peerSprite} size={64} name={peer?.display_name} animate={false} />
            <p style={{ marginTop: 10 }}>No messages yet.</p>
            <p style={{ fontSize: 12 }}>Send the first pigeon below.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages
            // Only render messages that are actually visible to this user.
            // For incoming messages that haven't been delivered yet, this
            // skips rendering ANY bubble at all — no placeholder, no hint
            // that a message is on its way.
            .filter(({ visible }) => visible)
            .map(({ message, delivery }) => {
              const mine = message.sender_id === user?.id;
              const status = messageStatus(message, delivery, user?.id || '');

              return (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '9px 12px',
                      borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: mine ? 'var(--accent)' : '#f2f2f7',
                      color: mine ? '#fff' : 'var(--text)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {message.content}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 6,
                        marginTop: 4,
                        fontSize: 10,
                        opacity: 0.72,
                      }}
                    >
                      <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                      {mine && status && <span>· {status}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        <div ref={bottomRef} />
      </div>

      {preview && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            padding: '5px 4px',
            textAlign: 'center',
          }}
        >
          🐦 {preview.distanceKm} km · {preview.speed} mph · ~{formatDuration(preview.durationSec)} ·{' '}
          {preview.cost === 0 ? 'Free' : `🪙 ${preview.cost} Stamp${preview.cost === 1 ? '' : 's'}`}
        </div>
      )}

      {error && (
        <p className="error-text" style={{ margin: '4px 0 6px' }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: '8px 0 calc(8px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          maxLength={2000}
          disabled={sending}
          placeholder="Write a message…"
          style={{
            flex: 1,
            resize: 'none',
            minHeight: 42,
            maxHeight: 110,
            padding: '10px 12px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: '#fff',
            fontFamily: 'inherit',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSend}
          onClick={() => void handleSend()}
          style={{
            width: 46,
            height: 42,
            minWidth: 46,
            borderRadius: 21,
            padding: 0,
            fontSize: 18,
          }}
          aria-label="Send message"
        >
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}

function NavigateFallback() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/inbox', { replace: true });
  }, [navigate]);
  return null;
}
