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
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locHint, setLocHint] = useState('');
  const [locLoading, setLocLoading] = useState(false);

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Manual address edit clears GPS coords so we re-geocode on submit
    if (key === 'address') setCoords(null);
  };

  /**
   * One-shot GPS (getCurrentPosition only — never watchPosition).
   * Reverse-geocode via BigDataCloud (browser CORS-friendly).
   * Falls back to coordinate label if reverse fails.
   */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocHint('Geolocation is not supported on this device/browser.');
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setLocHint('GPS needs HTTPS. Open the site over https:// or use a typed address.');
      return;
    }

    setLocLoading(true);
    setLocHint('Requesting location permission…');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });

        let label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        try {
          // BigDataCloud free client endpoint — works from browsers (CORS OK)
          const url =
            `https://api.bigdatacloud.net/data/reverse-geocode-client` +
            `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const parts = [
              data.city || data.locality || data.principalSubdivision,
              data.principalSubdivision,
              data.countryName,
            ].filter(Boolean);
            // dedupe
            const unique = [...new Set(parts as string[])];
            if (unique.length) label = unique.join(', ');
          }
        } catch {
          // keep coordinate label
        }

        setForm((f) => ({ ...f, address: label }));
        setLocHint(`Location set: ${label}. GPS is off.`);
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        const code = err?.code;
        if (code === 1) {
          setLocHint('Permission denied. Allow location in browser settings, or type your address.');
        } else if (code === 2) {
          setLocHint('Location unavailable. Try again outdoors or type your address.');
        } else if (code === 3) {
          setLocHint('Location timed out. Try again or type your address.');
        } else {
          setLocHint(err?.message || 'Could not get location. Type your address instead.');
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
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
      latitude: coords?.lat,
      longitude: coords?.lon,
    });
    setLoading(false);
    if (error) setError(error);
    else navigate('/');
  };

  return (
    <div className="app-shell" style={{ background: 'radial-gradient(circle at 50% 0%, #bfdbfe 0%, transparent 50%), var(--bg)' }} style={{ padding: 24, overflowY: 'auto' }}>
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
            Locked after signup. GPS is used once to fill this field, then turned off.
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
            <p style={{ fontSize: 12, color: coords ? 'var(--success)' : 'var(--text-secondary)', marginTop: 6 }}>
              {locHint}
            </p>
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
