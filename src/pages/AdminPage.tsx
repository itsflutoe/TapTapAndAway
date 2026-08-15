import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function AdminPage() {
  const { profile, setIsAdminMode, signOut } = useAuth();
  const [stats, setStats] = useState({
    users: 0,
    messages: 0,
    flying: 0,
    delivered: 0,
    failed: 0,
    stamps: 0,
  });

  useEffect(() => {
    (async () => {
      const { count: users } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: messages } = await supabase.from('messages').select('*', { count: 'exact', head: true });
      const { count: flying } = await supabase
        .from('deliveries')
        .select('*', { count: 'exact', head: true })
        .in('status', ['DISPATCHED', 'FLYING']);
      const { count: delivered } = await supabase
        .from('deliveries')
        .select('*', { count: 'exact', head: true })
        .in('status', ['DELIVERED', 'READ']);
      const { count: failed } = await supabase
        .from('deliveries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'FAILED');
      const { data: balances } = await supabase.from('profiles').select('stamp_balance');
      const stamps = (balances || []).reduce((s, p) => s + (p.stamp_balance || 0), 0);

      setStats({
        users: users || 0,
        messages: messages || 0,
        flying: flying || 0,
        delivered: delivered || 0,
        failed: failed || 0,
        stamps,
      });
    })();
  }, []);

  if (!profile?.is_admin) {
    return <div className="page"><p>Access denied.</p></div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Admin Panel</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 14px' }}
            onClick={() => setIsAdminMode(false)}
          >
            Enter User Mode
          </button>
          <button
            className="btn"
            style={{ padding: '8px 14px', color: 'var(--danger)' }}
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Messages" value={stats.messages} />
        <StatCard label="Flying" value={stats.flying} />
        <StatCard label="Delivered" value={stats.delivered} />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard label="Stamps in circ." value={stats.stamps} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Phase 1 Admin</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
          Core stats are shown above. Full user management, force-deliver, currency adjustments,
          and system settings can be expanded here. Use the Supabase dashboard for advanced operations
          during development.
        </p>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          Logged in as <strong>{profile.display_name}</strong> ({profile.username})
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
