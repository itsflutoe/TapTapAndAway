import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function StorePage() {
  return (
    <div className="page">
      <PageHeader title="🛍️ Store" />
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
