import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  haversineKm,
  calculateStampCost,
  fetchKmPerStamp,
  calculateFlightSeconds,
  applyTimeMultiplier,
  getWeatherForRoute,
  formatDuration,
} from '../lib/geo';
import { sendPigeonMessage, getEventEffects } from '../services/messaging';
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
    baseCost: number;
    freeSend: boolean;
    weather: string;
    weatherDesc: string;
    speed: number;
    durationSec: number;
    realSec: number;
    multiplier: number;
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

  if (profile?.is_banned) {
    return (
      <div className="page">
        <PageHeader title="🐦 Send a Letter" />
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Account restricted</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Your account has been banned. You cannot send pigeons.
          </p>
        </div>
      </div>
    );
  }

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
    const kmPerStamp = await fetchKmPerStamp(async (key) => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle();
      if (data?.value == null) return null;
      return typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    });
    const baseCost = calculateStampCost(distanceKm, kmPerStamp);
    const effects = await getEventEffects();
    let cost = baseCost;
    if (effects.free_sends) cost = 0;
    else if (effects.stamp_multiplier > 1) {
      cost = Math.max(1, Math.ceil(baseCost / effects.stamp_multiplier));
    }

    const weather = await getWeatherForRoute(
      profile.latitude,
      profile.longitude,
      p.latitude,
      p.longitude
    );
    const speed = 100 * weather.multiplier * (effects.speed_multiplier || 1);
    const realSec = calculateFlightSeconds(distanceKm, speed);

    let multiplier = 1;
    const { data: multData } = await supabase.rpc('get_time_multiplier');
    if (multData != null && Number(multData) > 0) multiplier = Number(multData);

    const durationSec = applyTimeMultiplier(realSec, multiplier);
    setPreview({
      distanceKm: Math.round(distanceKm * 10) / 10,
      cost,
      baseCost,
      freeSend: effects.free_sends,
      weather: weather.condition,
      weatherDesc: weather.description,
      speed: Math.round(speed * 10) / 10,
      durationSec,
      realSec,
      multiplier,
    });
    setStep(2);
  };

  const handleSend = async () => {
    if (!selected || !profile || !pigeon || !user || !preview) return;
    if (preview.cost > 0 && profile.stamp_balance < preview.cost) {
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
        timeMultiplier: preview.multiplier,
      });
      await refreshProfile();
      navigate(`/delivery/${delivery.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send.');
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
              type="button"
              className="card"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer' }}
              onClick={() => void selectFriend(f)}
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
            <p>
              <strong>To:</strong> {selected.display_name}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selected.pigeon_id}</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>{selected.address}</p>
          </div>
          <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
            <p>
              Distance: <strong>{preview.distanceKm} km</strong>
            </p>
            <p>
              Weather: <strong>{preview.weatherDesc}</strong>
            </p>
            <p>
              Pigeon speed: <strong>{preview.speed} mph</strong>
            </p>
            <p>
              Estimated delivery: <strong>{formatDuration(preview.durationSec)}</strong>
            </p>
            {preview.multiplier !== 1 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                (Real flight ~{formatDuration(preview.realSec)}; time multiplier ×{preview.multiplier})
              </p>
            )}
            <p style={{ marginTop: 8 }}>
              Cost:{' '}
              <strong>
                {preview.freeSend || preview.cost === 0
                  ? '🆓 FREE (event)'
                  : `🪙 ${preview.cost} Stamps`}
              </strong>
              {preview.freeSend && preview.baseCost > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>
                  (was {preview.baseCost})
                </span>
              )}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              You have {profile?.stamp_balance} Stamps
            </p>
          </div>
          <div className="input-group">
            <label htmlFor="msg">Your message</label>
            <textarea
              id="msg"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hello! 🐦"
              maxLength={2000}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!content.trim()) {
                setError('Write a message first.');
                return;
              }
              if ((preview?.cost ?? 0) > 0 && (profile?.stamp_balance ?? 0) < (preview?.cost ?? 1)) {
                setError('Not enough Stamps.');
                return;
              }
              setError('');
              setStep(3);
            }}
          >
            Continue
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => setStep(1)}
          >
            Back
          </button>
        </>
      )}

      {step === 3 && selected && preview && (
        <div className="card">
          <h2 style={{ fontSize: 18, marginBottom: 12, textAlign: 'center' }}>Confirm send?</h2>
          <p style={{ fontSize: 14, marginBottom: 8 }}>
            To <strong>{selected.display_name}</strong>
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginBottom: 12,
              padding: 10,
              background: '#f5f5f7',
              borderRadius: 10,
            }}
          >
            “{content.trim()}”
          </p>
          <p style={{ fontSize: 14 }}>
            {preview.freeSend || preview.cost === 0 ? (
              <>
                🆓 <strong>FREE</strong>
              </>
            ) : (
              <>
                🪙 <strong>{preview.cost}</strong> Stamps
              </>
            )}{' '}
            · {preview.distanceKm} km · {formatDuration(preview.durationSec)}
          </p>
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => void handleSend()}
            disabled={loading}
          >
            {loading ? 'Sending…' : '🐦 SEND PIGEON'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={loading}
            onClick={() => setStep(2)}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
