import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Mail, Send, Users, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const tabs = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/inbox', icon: Mail, label: 'Inbox', badgeKey: 'inbox' as const },
  { to: '/send', icon: Send, label: 'Send' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }

    const loadUnread = async () => {
      // Messages addressed to me that are unread
      const { data: msgs } = await supabase
        .from('messages')
        .select('id')
        .eq('receiver_id', user.id)
        .is('read_at', null)
        .limit(50);

      if (!msgs?.length) {
        setUnread(0);
        return;
      }

      // Only count those whose delivery is DELIVERED or READ (visible to receiver)
      const ids = msgs.map((m) => m.id);
      const { data: dels } = await supabase
        .from('deliveries')
        .select('message_id, status')
        .in('message_id', ids)
        .in('status', ['DELIVERED', 'READ']);

      setUnread(dels?.length ?? 0);
    };

    loadUnread();

    const channel = supabase
      .channel(`nav-unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => loadUnread()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries' },
        () => loadUnread()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, icon: Icon, label, badgeKey }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon strokeWidth={isActive ? 2.5 : 2} />
                {badgeKey === 'inbox' && unread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      background: '#ff3b30',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      lineHeight: 1,
                    }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
