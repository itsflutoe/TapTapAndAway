import { Link } from 'react-router-dom';

export default function StorePage() {
  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>🛍️ Store</h1>
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🐦</div>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Coming Soon</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
          Future items may include new pigeons, upgrades, cosmetics, accessories,
          special delivery items, and Stamp packs.
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <Link to="/" className="btn btn-secondary" style={{ width: '100%' }}>Back home</Link>
      </div>
    </div>
  );
}
