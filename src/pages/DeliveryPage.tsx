import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { completeDelivery } from '../services/messaging';
import { formatDuration } from '../lib/geo';
import type { Delivery, Message, Profile } from '../types';

// Fix default marker icons in Leaflet + Vite

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const pigeonIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1">🐦</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(positions, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

export default function DeliveryPage() {
  const { deliveryId } = useParams();
  const { refreshProfile } = useAuth();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [receiver, setReceiver] = useState<Profile | null>(null);
  const [progress, setProgress] = useState(0);
  const [pigeonPos, setPigeonPos] = useState<[number, number] | null>(null);
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
        const { data: r } = await supabase.from('profiles').select('*').eq('id', m.receiver_id).single();
        setReceiver(r as Profile);
      }
    })();
  }, [deliveryId]);

  // Simulate flight progress
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
        completeDelivery(delivery.id, delivery.message_id, message?.receiver_id || '').then(
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
  }, [delivery, message]);

  if (!delivery || !message) {
    return (
      <div className="page">
        <p>Loading delivery…</p>
      </div>
    );
  }

  const origin: [number, number] = [delivery.origin_latitude, delivery.origin_longitude];
  const dest: [number, number] = [delivery.destination_latitude, delivery.destination_longitude];
  const isDone = ['DELIVERED', 'READ', 'FAILED'].includes(delivery.status);

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <Link to="/inbox" style={{ fontSize: 14, marginBottom: 12, display: 'inline-block' }}>
        ← Inbox
      </Link>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600 }}>{receiver?.display_name || 'Recipient'}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{receiver?.pigeon_id}</p>
        <p style={{ fontSize: 13, marginTop: 6 }}>
          {delivery.distance_km} km · {delivery.weather || 'clear'} · ~{formatDuration(delivery.estimated_duration_seconds)}
        </p>
      </div>

      <div style={{ height: 260, marginBottom: 12, borderRadius: 12, overflow: 'hidden' }}>
        <MapContainer
          center={origin}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={origin} />
          <Marker position={dest} />
          <Polyline positions={[origin, dest]} color="#0071e3" weight={3} dashArray="6 8" />
          {pigeonPos && <Marker position={pigeonPos} icon={pigeonIcon} />}
          <FitBounds positions={[origin, dest]} />
        </MapContainer>
      </div>

      {/* Progress steps */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <Step label="DEPARTURE" done={progress > 0 || isDone} active={progress > 0 && progress < 50} />
          <Step label="ARRIVAL" done={progress >= 100 || isDone} active={progress >= 50 && progress < 100} icon={progress >= 50 && progress < 100 ? '🐦' : undefined} />
          <Step label="DELIVERED" done={isDone && delivery.status !== 'FAILED'} active={false} failed={delivery.status === 'FAILED'} />
        </div>
        <div style={{ height: 6, background: '#e5e5ea', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: delivery.status === 'FAILED' ? 'var(--danger)' : 'var(--accent)',
              transition: 'width 0.2s linear',
            }}
          />
        </div>
        <p style={{ textAlign: 'center', marginTop: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
          {delivery.status === 'FAILED'
            ? 'Pigeon returned home. Stamps refunded.'
            : isDone
            ? 'Message delivered!'
            : `Flying… ${Math.round(progress)}%`}
        </p>
      </div>

      {isDone && delivery.status !== 'FAILED' && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Message</p>
          <p>{message.content}</p>
        </div>
      )}
    </div>
  );
}

function Step({
  label,
  done,
  active,
  icon,
  failed,
}: {
  label: string;
  done: boolean;
  active?: boolean;
  icon?: string;
  failed?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 18, marginBottom: 2 }}>
        {failed ? '❌' : done ? '✓' : active && icon ? icon : '○'}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: done || active ? 'var(--text)' : 'var(--text-secondary)' }}>
        {label}
      </div>
    </div>
  );
}
