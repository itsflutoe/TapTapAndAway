import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  haversineKm,
  calculateStampCost,
  calculateFlightSeconds,
  getWeatherForRoute,
  formatDuration,
} from '../lib/geo';
import { sendPigeonMessage } from '../services/messaging';
import type { Profile, Friendship } from '../types';
import PageHeader from '../components/PageHeader';

export default function SendPage() {
  const { user, profile, pigeon, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<(Profile & { friendshipId: string })[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<{
    distanceKm: number;
    cost: number;
    weather: string;
    weatherDesc: string;
    speed: number;
    durationSec: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: fs } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
      if (!fs) return;
      const list: (Profile & { friendshipId: string })[] = [];
      for (const f of fs as Friendship[]) {
        const otherId = f.requester_id === user.id ? f.receiver_id : f.requester_id;
        const { data: p } = await supabase.from('profiles').select('*').eq('id', otherId).single();
        if (p) list.push({ ...(p as Profile), friendshipId: f.id });
      }
      setFriends(list);
    })();
  }, [user]);

  const selectFriend = async (p: Profile) => {
    setSelected(p);
    setError('');
    if (
      profile?.latitude == null ||
      profile?.longitude == null ||
      p.latitude == null ||
      p.longitude == null
    ) {
      setError('Both users need valid addresses.');
      return;
    }
    const distanceKm = haversineKm(
      profile.latitude,
      profile.longitude,
      p.latitude,
      p.longitude
    );
    const cost = calculateStampCost(distanceKm);
    const weather = await getWeatherForRoute(
      profile.latitude,
      profile.longitude,
      p.latitude,
      p.longitude
    );
    const speed = 100 * weather.multiplier;
    // Use high multiplier for testing so durations are short (seconds)
    const realSec = calculateFlightSeconds(distanceKm, speed);
    const durationSec = Math.max(5, Math.round(realSec / 3600)); // ~1 real sec ≈ 1 simulated hour
    setPreview({
      distanceKm: Math.round(distanceKm * 10) / 10,
      cost,
      weather: weather.condition,
      weatherDesc: weather.description,
      speed: Math.round(speed * 10) / 10,
      durationSec,
    });
    setStep(2);
  };

  const handleSend = async () => {
    if (!selected || !profile || !pigeon || !user || !preview) return;
    if (profile.stamp_balance < preview.cost) {
      setError('Not enough Stamps.');
      return;
    }
    if (!content.trim()) {
      setError('Write a message first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { delivery } = await sendPigeonMessage({
        senderId: user.id,
        receiverId: selected.id,
        content,
        senderProfile: profile,
        receiverProfile: selected,
        pigeonId: pigeon.id,
        timeMultiplier: 3600,
      });
      await refreshProfile();
      navigate(`/delivery/${delivery.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to send.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="🐦 Send a Letter" />

      {step === 1 && (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Select a friend</p>
          {friends.length === 0 && (
            <div className="card">
              <p>No friends yet. Go to Friends to add someone.</p>
            </div>
          )}
          {friends.map((f) => (
            <button
              key={f.id}
              className="card"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer' }}
              onClick={() => selectFriend(f)}
            >
              <strong>{f.display_name}</strong>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                @{f.username} · {f.pigeon_id}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.address}</div>
            </button>
          ))}
        </>
      )}

      {step === 2 && selected && preview && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <p><strong>To:</strong> {selected.display_name}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selected.pigeon_id}</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>{selected.address}</p>
          </div>
          <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
            <p>Distance: <strong>{preview.distanceKm} km</strong></p>
            <p>Weather: <strong>{preview.weatherDesc}</strong></p>
            <p>Pigeon speed: <strong>{preview.speed} mph</strong></p>
            <p>Estimated delivery: <strong>{formatDuration(preview.durationSec)}</strong></p>
            <p style={{ marginTop: 8 }}>Cost: <strong>🪙 {preview.cost} Stamps</strong></p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              You have {profile?.stamp_balance} Stamps
            </p>
          </div>
          <div className="input-group">
            <label>Your message</label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hello! 🐦"
              maxLength={2000}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" onClick={handleSend} disabled={loading}>
            {loading ? 'Sending…' : '🐦 SEND PIGEON'}
          </button>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep(1)}>
            Back
          </button>
        </>
      )}
    </div>
  );
}
