import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { completeDelivery, markMessageRead, updateDeliveryProgress } from '../services/messaging';
import { formatDuration } from '../lib/geo';
import JourneyMap from '../components/JourneyMap';
import type { Delivery, Message, Profile } from '../types';

export default function DeliveryPage() {
  const { deliveryId } = useParams();
  const { user, refreshProfile } = useAuth();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [receiver, setReceiver] = useState<Profile | null>(null);
  const [progress, setProgress] = useState(0);
  const [letterExpanded, setLetterExpanded] = useState(false);
  const completedRef = useRef(false);
  const lastCompletionAttemptRef = useRef(0);

  useEffect(() => {
    if (!deliveryId) return;
    (async () => {
      const { data: d } = await supabase.from('deliveries').select('*').eq('id', deliveryId).single();
      if (!d) return;
      setDelivery(d as Delivery);
      setProgress(Number(d.progress_percent) || 0);

      const { data: m } = await supabase.from('messages').select('*').eq('id', d.message_id).single();
      if (m) {
        setMessage(m as Message);
        const { data: r } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', m.receiver_id)
          .single();
        setReceiver(r as Profile);
      }
    })();
  }, [deliveryId]);

  /** Re-reads this delivery's row from the DB and applies it as the authoritative state. */
  const resyncDelivery = async () => {
    if (!deliveryId) return;
    const { data: d } = await supabase.from('deliveries').select('*').eq('id', deliveryId).single();
    if (d) setDelivery(d as Delivery);
  };

  // Realtime: any change to this delivery (this tab's own completion, another
  // tab, or an admin action) is re-read from the DB and becomes the new source
  // of truth. The local flight animation never decides status on its own.
  useEffect(() => {
    if (!deliveryId) return;
    const channel = supabase
      .channel(`delivery-${deliveryId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deliveries', filter: `id=eq.${deliveryId}` },
        () => void resyncDelivery()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deliveryId]);

  // Reconnect / refresh: catch up on anything missed while the tab was
  // backgrounded, offline, or the realtime socket briefly dropped.
  useEffect(() => {
    if (!deliveryId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resyncDelivery();
    };
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [deliveryId]);

  useEffect(() => {
    if (!user || !message || !delivery) return;
    const isReceiver = message.receiver_id === user.id;
    const canRead = delivery.status === 'DELIVERED' || delivery.status === 'READ';
    if (isReceiver && canRead && !message.read_at) {
      void markMessageRead(message.id).then(() => {
        setMessage((prev) => (prev ? { ...prev, read_at: new Date().toISOString() } : prev));
        setDelivery((prev) =>
          prev && prev.status === 'DELIVERED' ? { ...prev, status: 'READ' } : prev
        );
      });
    }
  }, [user, message?.id, message?.read_at, delivery?.status]);

  useEffect(() => {
    if (!delivery || !delivery.actual_departure) return;
    if (['DELIVERED', 'READ', 'FAILED', 'ARRIVED'].includes(delivery.status)) {
      setProgress(100);
      return;
    }

    const durationMs = delivery.estimated_duration_seconds * 1000;
    const start = new Date(delivery.actual_departure).getTime();

    let lastDbProgress = -1;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);

      // Throttle DB progress writes (~every 10%) so Conversation/Admin stay in sync
      const bucket = Math.floor(pct / 10) * 10;
      if (bucket !== lastDbProgress && bucket < 100) {
        lastDbProgress = bucket;
        void updateDeliveryProgress(delivery.id, bucket);
      }

      if (pct >= 100 && !completedRef.current) {
        const now = Date.now();
        // Simple backoff so a network hiccup doesn't hammer the RPC every 200ms.
        if (now - lastCompletionAttemptRef.current < 2000) return;
        lastCompletionAttemptRef.current = now;
        completedRef.current = true;
        void completeDelivery(delivery.id, delivery.message_id, message?.receiver_id || '')
          .then(async (res) => {
            // res.status comes from the actual DB write (or, if another tab/admin
            // resolved it first, a fresh read) — never a locally-guessed value.
            setDelivery((prev) =>
              prev ? { ...prev, status: res.status, progress_percent: 100 } : prev
            );
            await refreshProfile();
          })
          .catch((err) => {
            console.error('Failed to complete delivery:', err);
            // Don't leave the UI stuck at 100% forever — allow a retry.
            completedRef.current = false;
          });
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [delivery, message, refreshProfile]);

  if (!delivery || !message) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading delivery…</p>
      </div>
    );
  }

  const origin: [number, number] = [delivery.origin_latitude, delivery.origin_longitude];
  const dest: [number, number] = [delivery.destination_latitude, delivery.destination_longitude];
  const isDone = ['DELIVERED', 'READ', 'FAILED', 'ARRIVED'].includes(delivery.status);
  const isFailed = delivery.status === 'FAILED';
  const isSender = user?.id === message.sender_id;
  const isReceiver = user?.id === message.receiver_id;
  const deliveredOk = delivery.status === 'DELIVERED' || delivery.status === 'READ';
  const stepDeparture = progress > 0 || isDone;
  const stepArrival = progress >= 100 || isDone;
  const stepDelivered = isDone && !isFailed;

  const remainingSec = Math.max(
    0,
    Math.round((1 - Math.min(100, progress) / 100) * (delivery.estimated_duration_seconds || 0))
  );
  let statusText = `En route · ~${formatDuration(remainingSec)}`;
  if (isFailed) statusText = 'Pigeon returned home · Stamps refunded';
  else if (isDone) statusText = 'Message delivered!';

  return (
    <div className="journey-screen">
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <JourneyMap origin={origin} dest={dest} progress={progress} />

        <div className="journey-overlay">
          <Link
            to="/inbox"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text)',
              fontWeight: 600,
              fontSize: 18,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              textDecoration: 'none',
            }}
            aria-label="Back to inbox"
          >
            ←
          </Link>
          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 14,
              padding: '10px 14px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
              minWidth: 0,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
              {receiver?.display_name || 'Recipient'}
            </p>
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                margin: '2px 0 0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {receiver?.pigeon_id}
              {receiver?.address ? ` · ${receiver.address}` : ''}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {delivery.distance_km} km · {delivery.weather || 'clear'} · ~
              {formatDuration(delivery.estimated_duration_seconds)}
            </p>
          </div>
        </div>
      </div>

      <div className="journey-sheet" style={{ maxHeight: letterExpanded ? '55vh' : 'auto' }}>
        <div style={{ position: 'relative', padding: '0 4px 4px' }}>
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '16%',
              right: '16%',
              height: 3,
              background: '#e8e8ed',
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '16%',
              width: `calc((100% - 32%) * ${Math.min(100, progress) / 100})`,
              height: 3,
              background: isFailed ? 'var(--danger)' : 'var(--accent)',
              borderRadius: 2,
              transition: 'width 0.2s linear',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <ProgressNode label="Departure" done={stepDeparture} active={!stepArrival && stepDeparture} />
            <ProgressNode
              label="In flight"
              done={stepArrival}
              active={stepDeparture && !stepArrival}
              flying={!isDone && stepDeparture && !stepArrival}
            />
            <ProgressNode label="Delivered" done={stepDelivered} failed={isFailed} />
          </div>
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 6,
            marginBottom: 10,
            fontSize: 14,
            fontWeight: 600,
            color: isFailed ? 'var(--danger)' : isDone ? 'var(--success)' : 'var(--text)',
          }}
        >
          {statusText}
        </p>

        {isReceiver && !deliveredOk && !isFailed && (
          <div
            style={{
              textAlign: 'center',
              padding: 12,
              background: '#f5f5f7',
              borderRadius: 14,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>🐦</div>
            <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>Pigeon is on the way</p>
            <p style={{ fontSize: 12, marginTop: 2 }}>The letter opens when it arrives.</p>
          </div>
        )}

        {((isSender && !isFailed) || (isReceiver && deliveredOk)) && (
          <button
            type="button"
            onClick={() => setLetterExpanded((v) => !v)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px 14px',
              background: '#f5f5f7',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: letterExpanded ? 8 : 0,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  letterSpacing: 0.4,
                }}
              >
                LETTER {letterExpanded ? '▾' : '▸'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {letterExpanded ? 'Tap to collapse' : 'Tap to expand'}
              </span>
            </div>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.45,
                margin: 0,
                overflow: letterExpanded ? 'auto' : 'hidden',
                display: letterExpanded ? 'block' : '-webkit-box',
                WebkitLineClamp: letterExpanded ? undefined : 2,
                WebkitBoxOrient: letterExpanded ? undefined : ('vertical' as const),
                maxHeight: letterExpanded ? '35vh' : undefined,
              }}
            >
              {message.content}
            </p>
          </button>
        )}

        {isFailed && isSender && (
          <div
            style={{
              textAlign: 'center',
              padding: 14,
              background: '#fff5f5',
              borderRadius: 14,
              color: 'var(--danger)',
              fontSize: 14,
              marginTop: 10,
            }}
          >
            Delivery failed. Your Stamps were refunded.
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressNode({
  label,
  done,
  active,
  flying,
  failed,
}: {
  label: string;
  done: boolean;
  active?: boolean;
  flying?: boolean;
  failed?: boolean;
}) {
  let bg = '#e8e8ed';
  let color = '#8e8e93';
  let content = '';

  if (failed) {
    bg = '#ff3b30';
    color = '#fff';
    content = '✕';
  } else if (done) {
    bg = '#34c759';
    color = '#fff';
    content = '✓';
  } else if (flying || active) {
    bg = '#0071e3';
    color = '#fff';
    content = flying ? '🐦' : '●';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 72 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: bg,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: flying ? 14 : 13,
          fontWeight: 700,
          boxShadow: active || flying ? '0 0 0 4px rgba(0,113,227,0.2)' : undefined,
        }}
      >
        {content}
      </div>
      <span
        style={{
          marginTop: 8,
          fontSize: 11,
          fontWeight: 600,
          color: done || active || flying ? 'var(--text)' : 'var(--text-secondary)',
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}
