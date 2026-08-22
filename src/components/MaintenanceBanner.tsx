import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Shows when maintenance_mode is on, or an active banner event exists. */
export default function MaintenanceBanner() {
  const [maintenance, setMaintenance] = useState(false);
  const [message, setMessage] = useState('');
  const [eventBanner, setEventBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: maint } = await supabase.rpc('is_maintenance_mode');
      const { data: msg } = await supabase.rpc('get_maintenance_message');
      const { data: events } = await supabase.rpc('get_active_events');
      if (cancelled) return;
      setMaintenance(!!maint);
      setMessage(typeof msg === 'string' ? msg : 'Maintenance in progress.');
      const banners = ((events as { event_type: string; name: string; description: string | null; config: { message?: string } }[]) ||
        []).filter((e) => e.event_type === 'banner');
      if (banners[0]) {
        setEventBanner(
          banners[0].config?.message || banners[0].description || banners[0].name
        );
      } else {
        setEventBanner(null);
      }
    };
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (maintenance) {
    return (
      <div
        style={{
          background: '#7f1d1d',
          color: '#fecaca',
          textAlign: 'center',
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        ⚠️ {message || 'Maintenance mode — sending may be unavailable.'}
      </div>
    );
  }

  if (eventBanner) {
    return (
      <div
        style={{
          background: '#1e3a5f',
          color: '#bfdbfe',
          textAlign: 'center',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        🎉 {eventBanner}
      </div>
    );
  }

  return null;
}
