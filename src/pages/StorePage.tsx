import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function StorePage() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!code.trim()) {
      setErr('Enter a code.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('redeem_stamp_code', {
      p_code: code.trim(),
    });
    setLoading(false);
    if (error) {
      setErr(error.message.replace(/^.*exception: /i, '') || error.message);
      return;
    }
    setMsg(`Success! New balance: ${data} Stamps`);
    setCode('');
    await refreshProfile();
  };

  return (
    <div className="page">
      <PageHeader title="🛍️ Store" />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Redeem code</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Enter a code from an event or admin to receive Stamps.
        </p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          Balance: <strong>🪙 {profile?.stamp_balance ?? 0}</strong>
        </p>
        <form onSubmit={redeem}>
          <div className="input-group">
            <label htmlFor="redeem-code">Code</label>
            <input
              id="redeem-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              autoCapitalize="characters"
            />
          </div>
          {err && <p className="error-text">{err}</p>}
          {msg && (
            <p style={{ color: 'var(--success)', fontSize: 14, marginBottom: 8 }}>{msg}</p>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Redeeming…' : 'Redeem'}
          </button>
        </form>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🐦</div>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Coming Soon</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
          Future items may include new pigeons, upgrades, cosmetics, accessories, special
          delivery items, and Stamp packs.
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to="/" className="btn btn-secondary" style={{ width: '100%' }}>
          Back home
        </Link>
      </div>
    </div>
  );
}
