import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirm: '',
    displayName: '',
    gender: 'prefer_not_to_say',
    address: '',
    pigeonName: 'Mochi',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locHint, setLocHint] = useState('');
  const [locLoading, setLocLoading] = useState(false);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  /** One-shot GPS only (getCurrentPosition). Does not use watchPosition — GPS is not left open. */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocHint('Geolocation is not supported on this device.');
      return;
    }
    setLocLoading(true);
    setLocHint('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
          const res = await fetch(url, {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'TapTapAndAway/1.0' },
          });
          const data = await res.json();
          const label =
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            data?.address?.municipality ||
            '';
          const region = data?.address?.state || data?.address?.region || '';
          const country = data?.address?.country || '';
          const composed =
            [label, region, country].filter(Boolean).join(', ') ||
            data?.display_name ||
            `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          update('address', composed);
          setLocHint(`Found: ${composed}. GPS is off.`);
        } catch {
          setLocHint('Got GPS but could not resolve a place name. Type your address instead.');
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        setLocLoading(false);
        setLocHint(err.message || 'Could not get location. Enter address manually.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!form.address.trim()) {
      setError('Address is required and cannot be changed later.');
      return;
    }
    setLoading(true);
    const { error } = await signUp({
      username: form.username,
      password: form.password,
      displayName: form.displayName || form.username,
      gender: form.gender,
      address: form.address,
      pigeonName: form.pigeonName,
    });
    setLoading(false);
    if (error) setError(error);
    else navigate('/');
  };

  return (
    <div className="app-shell" style={{ padding: 24, overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40 }}>🐦</div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Join Tap Tap and Away</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Your pigeon is waiting.</p>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="input-group">
          <label>Username</label>
          <input value={form.username} onChange={(e) => update('username', e.target.value)} required placeholder="kai" />
        </div>
        <div className="input-group">
          <label>Display name</label>
          <input value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="Kai" />
        </div>
        <div className="input-group">
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Confirm password</label>
          <input type="password" value={form.confirm} onChange={(e) => update('confirm', e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Gender</label>
          <select value={form.gender} onChange={(e) => update('gender', e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
        <div className="input-group">
          <label>Address (set once at signup)</label>
          <input
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            required
            placeholder="Pandi, Bulacan, Philippines"
          />
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Locked after signup — only an admin can change it later. GPS is used once to fill the
            field, then turned off (no continuous tracking).
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 10, padding: '10px 14px' }}
            disabled={locLoading}
            onClick={useCurrentLocation}
          >
            {locLoading ? 'Locating…' : '📍 Use my current location'}
          </button>
          {locHint && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{locHint}</p>
          )}
        </div>
        <div className="input-group">
          <label>Name your pigeon</label>
          <input value={form.pigeonName} onChange={(e) => update('pigeonName', e.target.value)} placeholder="Mochi" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--text-secondary)' }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
