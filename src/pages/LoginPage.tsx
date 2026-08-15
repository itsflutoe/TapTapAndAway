import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(username, password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🐦</div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Tap Tap and Away</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Every message takes a journey.</p>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            placeholder="Your username"
          />
        </div>
        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="Your password"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Signing in…' : 'LOGIN'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-secondary)' }}>
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  );
}
