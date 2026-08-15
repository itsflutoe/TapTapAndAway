import { NavLink } from 'react-router-dom';
import { Home, Mail, Send, Users, User } from 'lucide-react';

const tabs = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/inbox', icon: Mail, label: 'Inbox' },
  { to: '/send', icon: Send, label: 'Send' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <Icon strokeWidth={isActive ? 2.5 : 2} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
