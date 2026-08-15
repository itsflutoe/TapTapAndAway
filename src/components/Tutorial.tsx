import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const STEPS = [
  {
    title: 'Welcome to Tap Tap and Away',
    body: 'Every message takes a journey — carried by your pigeon across the real world.',
  },
  {
    title: 'Messages travel by pigeon',
    body: 'Nothing appears instantly. Your pigeon flies from your address to your friend’s address.',
  },
  {
    title: 'Your address is the destination',
    body: 'Pigeons use the address you registered. Update it anytime in your profile.',
  },
  {
    title: 'Longer trips cost more Stamps',
    body: 'Cost scales with distance (about +1 Stamp per 70 km). Check your balance before you send.',
  },
  {
    title: 'Weather affects the flight',
    body: 'Rain and storms slow your pigeon. Clear skies are the fastest.',
  },
  {
    title: 'Daily free Stamp',
    body: 'You get 1 free Stamp every day when you open the app. Come back tomorrow!',
  },
  {
    title: 'Your pigeon is ready',
    body: 'Add a friend, write a letter, and send your first pigeon. Safe travels!',
  },
];

export default function Tutorial() {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!profile || profile.tutorial_completed) return null;

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.rpc('complete_tutorial', { p_user_id: user.id });
    await refreshProfile();
    setSaving(false);
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          marginBottom: 24,
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 12 }}>🐦</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
          {s.title}
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
          {s.body}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '16px 0' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? 'var(--accent)' : '#ddd',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => void finish()}
            disabled={saving}
          >
            Skip
          </button>
          {!last ? (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep((x) => x + 1)}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => void finish()}
              disabled={saving}
            >
              {saving ? '…' : 'Let’s go'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
