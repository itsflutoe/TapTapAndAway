import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { completeDelivery, markMessageRead } from '../services/messaging';
import { formatDuration } from '../lib/geo';
import type { Delivery, Message, Profile } from '../types';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function makePigeonIcon(spriteId?: string | null) {
  // Static PNG on map marker if sprite known; emoji fallback
  if (spriteId && spriteId.startsWith('basic-')) {
    const url = `/pigeons/basic/${spriteId}.png`;
    return L.divIcon({
      className: '',
      html: `<img src="${url}" width="32" height="32" style="image-rendering:pixelated;object-fit:contain" alt="" />`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  return L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1">🐦</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(positions, { padding: [48, 48] });
    }
  }, [map, positions]);
  return null;
}

export default function DeliveryPage() {
  const { deliveryId } = useParams();
  const { user, refreshProfile } = useAuth();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [receiver, setReceiver] = useState<Profile | null>(null);
  const [senderSprite, setSenderSprite] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pigeonPos, setPigeonPos] = useState<[number, number] | null>(null);
  const [letterExpanded, setLetterExpanded] = useState(false);
  const completedRef = useRef(false);

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
        const { data: pig } = await supabase
          .from('pigeons')
          .select('sprite_id')
          .eq('owner_id', m.sender_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        setSenderSprite((pig as { sprite_id?: string } | null)?.sprite_id ?? null);
      }
    })();
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
      setPigeonPos([delivery.destination_latitude, delivery.destination_longitude]);
      return;
    }

    const durationMs = delivery.estimated_duration_seconds * 1000;
    const start = new Date(delivery.actual_departure).getTime();

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);

      const t = pct / 100;
      const lat =
        delivery.origin_latitude +
        (delivery.destination_latitude - delivery.origin_latitude) * t;
      const lng =
        delivery.origin_longitude +
        (delivery.destination_longitude - delivery.origin_longitude) * t;
      setPigeonPos([lat, lng]);

      if (pct >= 100 && !completedRef.current) {
        completedRef.current = true;
        void completeDelivery(delivery.id, delivery.message_id, message?.receiver_id || '').then(
          async (res) => {
            setDelivery((prev) =>
              prev ? { ...prev, status: res.status, progress_percent: 100 } : prev
            );
            await refreshProfile();
          }
        );
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
  const isDone = ['DELIVERED', 'READ', 'FAILED'].includes(delivery.status);
  const isFailed = delivery.status === 'FAILED';
  const isSender = user?.id === message.sender_id;
  const isReceiver = user?.id === message.receiver_id;
  const deliveredOk = delivery.status === 'DELIVERED' || delivery.status === 'READ';
  const stepDeparture = progress > 0 || isDone;
  const stepArrival = progress >= 100 || isDone;
  const stepDelivered = isDone && !isFailed;

  let statusText = `Flying… ${Math.round(progress)}%`;
  if (isFailed) statusText = 'Pigeon returned home · Stamps refunded';
  else if (isDone) statusText = 'Message delivered!';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        maxWidth: 480,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: '#0b1220',
        zIndex: 200,
      }}
    >
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapContainer
          center={origin}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          zoomControl={false}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={origin} />
          <Marker position={dest} />
          <Polyline positions={[origin, dest]} color="#0071e3" weight={3} dashArray="6 8" />
          {pigeonPos && (
            <Marker
              position={pigeonPos}
              icon={makePigeonIcon(senderSprite)}
            />
          )}
          <FitBounds positions={[origin, dest]} />
        </MapContainer>

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '12px 14px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            background: 'linear-gradient(to bottom, rgba(11,18,32,0.85), transparent)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
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

      <div
        style={{
          background: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 28px rgba(0,0,0,0.12)',
          zIndex: 500,
          maxHeight: letterExpanded ? '55vh' : 'auto',
        }}
      >
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
