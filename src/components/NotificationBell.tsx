import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40);
    const rows = (data as Notif[]) || [];
    setItems(rows);
    setUnread(rows.filter((n) => !n.read).length);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const markAllRead = async () => {
    await supabase.rpc('mark_notifications_read');
    void load();
  };

  const markOne = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    void load();
  };

  if (!user) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Bell size={22} color="var(--text-secondary, #666)" />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: '#FF3B30',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 80 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 8,
              width: 320,
              maxWidth: 'min(320px, 92vw)',
              maxHeight: 400,
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              border: '1px solid #e5e5ea',
              zIndex: 90,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom: '1px solid #eee',
                position: 'sticky',
                top: 0,
                background: '#fff',
              }}
            >
              <strong style={{ fontSize: 15 }}>Notifications</strong>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#007AFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 && (
              <p style={{ padding: 20, color: '#888', fontSize: 14, textAlign: 'center' }}>
                No notifications yet.
              </p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void markOne(n.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  border: 'none',
                  borderBottom: '1px solid #f0f0f0',
                  background: n.read ? '#fff' : '#f0f7ff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16 }}>
                    {n.type === 'event' ? '🎉' : n.type === 'admin_message' ? '📢' : '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!n.read && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: '#007AFF',
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
