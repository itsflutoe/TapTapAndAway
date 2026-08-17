import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/geo';
import type { Profile, Delivery, StampTransaction } from '../types';
import { BASIC_SPRITE_IDS } from '../lib/pigeonAppearance';
import PigeonAvatar from '../components/PigeonAvatar';

type Tab =
  | 'dashboard'
  | 'live'
  | 'users'
  | 'ledger'
  | 'deliveries'
  | 'messages'
  | 'moderation'
  | 'codes'
  | 'events'
  | 'growth'
  | 'health'
  | 'broadcast'
  | 'audit'
  | 'settings';

interface AppEvent {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  config: Record<string, unknown>;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

interface MsgSearchRow {
  id: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  sender?: string;
  receiver?: string;
}

interface RedeemCode {
  id: string;
  code: string;
  stamp_amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface ReportRow {
  id: string;
  reporter_id: string | null;
  reported_user_id: string | null;
  message_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  reporter?: string;
  reported?: string;
}

interface RedemptionRow {
  id: string;
  code_id: string;
  user_id: string;
  stamp_amount: number;
  created_at: string;
  username?: string;
  code?: string;
}

interface AuditRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface LiveDelivery extends Delivery {
  sender?: string;
  receiver?: string;
  overdue?: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'live', label: 'Live ops' },
  { id: 'users', label: 'Users' },
  { id: 'ledger', label: 'Stamp ledger' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'messages', label: 'Messages' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'codes', label: 'Codes' },
  { id: 'events', label: 'Events' },
  { id: 'growth', label: 'Growth' },
  { id: 'health', label: 'Health' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'audit', label: 'Audit log' },
  { id: 'settings', label: 'Settings' },
];

export default function AdminPage() {
  const { profile, setIsAdminMode, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [stats, setStats] = useState({
    users: 0,
    messages: 0,
    flying: 0,
    delivered: 0,
    failed: 0,
    stamps: 0,
    overdue: 0,
  });

  const [users, setUsers] = useState<Profile[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [drawerUser, setDrawerUser] = useState<Profile | null>(null);
  const [drawerTx, setDrawerTx] = useState<StampTransaction[]>([]);
  const [drawerDel, setDrawerDel] = useState<LiveDelivery[]>([]);
  const [drawerSprite, setDrawerSprite] = useState<string | null>(null);
  const [drawerPigeonName, setDrawerPigeonName] = useState<string | null>(null);
  const [drawerPigeonGender, setDrawerPigeonGender] = useState<string | null>(null);
  const [stampInput, setStampInput] = useState('10');
  const [stampMode, setStampMode] = useState<'add' | 'set'>('add');
  const [spriteInput, setSpriteInput] = useState('');

  const [ledger, setLedger] = useState<(StampTransaction & { username?: string })[]>([]);
  const [ledgerUser, setLedgerUser] = useState('');

  const [live, setLive] = useState<LiveDelivery[]>([]);
  const [deliveries, setDeliveries] = useState<LiveDelivery[]>([]);
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [newCode, setNewCode] = useState({ code: '', amount: 10, maxUses: '', expires: '' });
  const [codeAnalytics, setCodeAnalytics] = useState<RedemptionRow[]>([]);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportFilter, setReportFilter] = useState<'open' | 'all'>('open');
  const [growth, setGrowth] = useState({
    signups7d: 0,
    messages7d: 0,
    delivers7d: 0,
    tutorialDone: 0,
    banned: 0,
  });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [broadcast, setBroadcast] = useState({ title: '', message: '', userId: '' });
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [newEvent, setNewEvent] = useState({
    name: '',
    description: '',
    event_type: 'banner',
    multiplier: '2',
    starts: '',
    ends: '',
  });
  const [msgQuery, setMsgQuery] = useState('');
  const [msgResults, setMsgResults] = useState<MsgSearchRow[]>([]);
  const [msgExpanded, setMsgExpanded] = useState<string | null>(null);
  const [health, setHealth] = useState({
    maintenance: false,
    sendingPaused: false,
    timeMultiplier: '1',
    openReports: 0,
    overdue: 0,
    flying: 0,
    failed24h: 0,
    delivered24h: 0,
  });

  const flash = (m: string, isErr = false) => {
    setMsg(isErr ? '' : m);
    setErr(isErr ? m : '');
    setTimeout(() => {
      setMsg('');
      setErr('');
    }, 4000);
  };

  const log = async (action: string, targetType?: string, targetId?: string, details?: object) => {
    await supabase.rpc('admin_log', {
      p_action: action,
      p_target_type: targetType ?? null,
      p_target_id: targetId ?? null,
      p_details: details ?? {},
    });
  };

  const enrichDeliveries = async (rows: Delivery[]): Promise<LiveDelivery[]> => {
    const out: LiveDelivery[] = [];
    const now = Date.now();
    for (const d of rows) {
      const { data: m } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .eq('id', d.message_id)
        .maybeSingle();
      let sender = '';
      let receiver = '';
      if (m) {
        const { data: s } = await supabase.from('profiles').select('username').eq('id', m.sender_id).maybeSingle();
        const { data: r } = await supabase.from('profiles').select('username').eq('id', m.receiver_id).maybeSingle();
        sender = s?.username || '';
        receiver = r?.username || '';
      }
      const depart = d.actual_departure ? new Date(d.actual_departure).getTime() : 0;
      const eta = depart + (d.estimated_duration_seconds || 0) * 1000;
      const overdue =
        ['DISPATCHED', 'FLYING', 'PREPARING'].includes(d.status) && depart > 0 && now > eta + 5000;
      out.push({ ...d, sender, receiver, overdue });
    }
    return out;
  };

  const loadStats = useCallback(async () => {
    const { count: users } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: messages } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: flying } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DISPATCHED', 'FLYING', 'PREPARING']);
    const { count: delivered } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DELIVERED', 'READ']);
    const { count: failed } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'FAILED');
    const { data: balances } = await supabase.from('profiles').select('stamp_balance');
    const stamps = (balances || []).reduce((s, row) => s + (row.stamp_balance || 0), 0);

    const { data: active } = await supabase
      .from('deliveries')
      .select('*')
      .in('status', ['DISPATCHED', 'FLYING', 'PREPARING'])
      .limit(100);
    const enriched = await enrichDeliveries((active as Delivery[]) || []);
    const overdue = enriched.filter((d) => d.overdue).length;

    setStats({
      users: users || 0,
      messages: messages || 0,
      flying: flying || 0,
      delivered: delivered || 0,
      failed: failed || 0,
      stamps,
      overdue,
    });
  }, []);

  const loadUsers = useCallback(async () => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
    if (userQuery.trim()) {
      const t = userQuery.trim();
      q = supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${t}%,display_name.ilike.%${t}%,pigeon_id.ilike.%${t}%`)
        .limit(50);
    }
    const { data } = await q;
    setUsers((data as Profile[]) || []);
  }, [userQuery]);

  const openDrawer = async (u: Profile) => {
    setDrawerUser(u);
    setStampInput('10');
    setStampMode('add');
    setDrawerSprite(null);
    setDrawerPigeonName(null);
    setDrawerPigeonGender(null);
    {
      const { data: pig } = await supabase
        .from('pigeons')
        .select('name, gender, sprite_id')
        .eq('owner_id', u.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (pig) {
        const sid = (pig as { sprite_id?: string | null }).sprite_id ?? null;
        setDrawerSprite(sid);
        setSpriteInput(sid || 'basic-01');
        setDrawerPigeonName((pig as { name?: string }).name ?? null);
        setDrawerPigeonGender((pig as { gender?: string }).gender ?? null);
      }
    }
    const { data: tx } = await supabase
      .from('stamp_transactions')
      .select('*')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setDrawerTx((tx as StampTransaction[]) || []);

    const { data: msgs } = await supabase
      .from('messages')
      .select('id')
      .eq('sender_id', u.id)
      .limit(30);
    const ids = (msgs || []).map((m) => m.id);
    if (ids.length) {
      const { data: dels } = await supabase
        .from('deliveries')
        .select('*')
        .in('message_id', ids)
        .order('created_at', { ascending: false })
        .limit(15);
      setDrawerDel(await enrichDeliveries((dels as Delivery[]) || []));
    } else {
      setDrawerDel([]);
    }
  };

  const loadLedger = useCallback(async () => {
    const { data } = await supabase
      .from('stamp_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80);
    const rows: (StampTransaction & { username?: string })[] = [];
    for (const tx of (data as StampTransaction[]) || []) {
      const { data: p } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', tx.user_id)
        .maybeSingle();
      if (ledgerUser && p?.username && !p.username.includes(ledgerUser.toLowerCase()) && p.username !== ledgerUser) {
        if (!p.username.toLowerCase().includes(ledgerUser.toLowerCase())) continue;
      }
      rows.push({ ...tx, username: p?.username });
    }
    setLedger(rows);
  }, [ledgerUser]);

  const loadLive = useCallback(async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .in('status', ['DISPATCHED', 'FLYING', 'PREPARING'])
      .order('created_at', { ascending: false })
      .limit(40);
    setLive(await enrichDeliveries((data as Delivery[]) || []));
  }, []);

  const loadDeliveries = useCallback(async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    setDeliveries(await enrichDeliveries((data as Delivery[]) || []));
  }, []);

  const loadCodes = useCallback(async () => {
    const { data } = await supabase
      .from('redeem_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setCodes((data as RedeemCode[]) || []);
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('key, value');
    const map: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: unknown }) => {
      map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    });
    setSettings(map);
  }, []);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setAudit((data as AuditRow[]) || []);
  }, []);

  const loadReports = useCallback(async () => {
    let q = supabase.from('user_reports').select('*').order('created_at', { ascending: false }).limit(50);
    if (reportFilter === 'open') {
      q = supabase
        .from('user_reports')
        .select('*')
        .in('status', ['open', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(50);
    }
    const { data } = await q;
    const rows: ReportRow[] = [];
    for (const r of (data as ReportRow[]) || []) {
      let reporter = '';
      let reported = '';
      if (r.reporter_id) {
        const { data: p } = await supabase.from('profiles').select('username').eq('id', r.reporter_id).maybeSingle();
        reporter = p?.username || '';
      }
      if (r.reported_user_id) {
        const { data: p } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', r.reported_user_id)
          .maybeSingle();
        reported = p?.username || '';
      }
      rows.push({ ...r, reporter, reported });
    }
    setReports(rows);
  }, [reportFilter]);

  const loadGrowth = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: signups7d } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
    const { count: messages7d } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
    const { count: delivers7d } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DELIVERED', 'READ'])
      .gte('created_at', since);
    const { count: tutorialDone } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tutorial_completed', true);
    const { count: banned } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_banned', true);
    setGrowth({
      signups7d: signups7d || 0,
      messages7d: messages7d || 0,
      delivers7d: delivers7d || 0,
      tutorialDone: tutorialDone || 0,
      banned: banned || 0,
    });
  }, []);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('app_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    setEvents((data as AppEvent[]) || []);
  }, []);

  const loadHealth = useCallback(async () => {
    const { data: settingsRows } = await supabase.from('system_settings').select('key, value');
    const map: Record<string, string> = {};
    (settingsRows || []).forEach((row: { key: string; value: unknown }) => {
      map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    });
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: openReports } = await supabase
      .from('user_reports')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'reviewing']);
    const { count: flying } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DISPATCHED', 'FLYING', 'PREPARING']);
    const { count: failed24h } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'FAILED')
      .gte('created_at', since24);
    const { count: delivered24h } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DELIVERED', 'READ'])
      .gte('created_at', since24);

    const { data: active } = await supabase
      .from('deliveries')
      .select('*')
      .in('status', ['DISPATCHED', 'FLYING', 'PREPARING'])
      .limit(100);
    const enriched = await enrichDeliveries((active as Delivery[]) || []);

    const parseBool = (v?: string) => {
      const s = (v || '').replace(/"/g, '').toLowerCase();
      return s === 'true' || s === '1' || s === 'yes';
    };

    setHealth({
      maintenance: parseBool(map.maintenance_mode),
      sendingPaused: parseBool(map.sending_paused),
      timeMultiplier: (map.time_multiplier || '1').replace(/"/g, ''),
      openReports: openReports || 0,
      overdue: enriched.filter((d) => d.overdue).length,
      flying: flying || 0,
      failed24h: failed24h || 0,
      delivered24h: delivered24h || 0,
    });
  }, []);

  const searchMessages = async () => {
    const q = msgQuery.trim();
    if (!q) {
      flash('Enter username, PID, or text', true);
      return;
    }
    // Resolve users by username/PID first
    const { data: people } = await supabase
      .from('profiles')
      .select('id, username')
      .or(`username.ilike.%${q}%,pigeon_id.ilike.%${q}%`)
      .limit(20);
    const ids = (people || []).map((p) => p.id);

    let query = supabase
      .from('messages')
      .select('id, content, sender_id, receiver_id, created_at')
      .order('created_at', { ascending: false })
      .limit(40);

    if (ids.length > 0) {
      query = query.or(
        `sender_id.in.(${ids.join(',')}),receiver_id.in.(${ids.join(',')}),content.ilike.%${q}%`
      );
    } else {
      query = query.ilike('content', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      flash(error.message, true);
      return;
    }

    const rows: MsgSearchRow[] = [];
    for (const m of data || []) {
      const { data: s } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', m.sender_id)
        .maybeSingle();
      const { data: r } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', m.receiver_id)
        .maybeSingle();
      rows.push({
        ...(m as MsgSearchRow),
        sender: s?.username,
        receiver: r?.username,
      });
    }
    setMsgResults(rows);
  };

  const loadCodeAnalytics = async (codeId: string) => {
    setSelectedCodeId(codeId);
    const { data } = await supabase
      .from('redeem_code_redemptions')
      .select('*')
      .eq('code_id', codeId)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows: RedemptionRow[] = [];
    for (const r of (data as RedemptionRow[]) || []) {
      const { data: p } = await supabase.from('profiles').select('username').eq('id', r.user_id).maybeSingle();
      rows.push({ ...r, username: p?.username });
    }
    setCodeAnalytics(rows);
  };

  useEffect(() => {
    if (tab === 'dashboard') void loadStats();
    if (tab === 'users') void loadUsers();
    if (tab === 'ledger') void loadLedger();
    if (tab === 'live') void loadLive();
    if (tab === 'deliveries') void loadDeliveries();
    if (tab === 'codes') void loadCodes();
    if (tab === 'settings') void loadSettings();
    if (tab === 'audit') void loadAudit();
    if (tab === 'moderation') void loadReports();
    if (tab === 'growth') void loadGrowth();
    if (tab === 'events') void loadEvents();
    if (tab === 'health') void loadHealth();
  }, [
    tab,
    loadStats,
    loadUsers,
    loadLedger,
    loadLive,
    loadDeliveries,
    loadCodes,
    loadSettings,
    loadAudit,
    loadReports,
    loadGrowth,
    loadEvents,
    loadHealth,
  ]);

  if (!profile?.is_admin) {
    return (
      <div style={{ padding: 24 }}>
        <p>Access denied.</p>
      </div>
    );
  }

  const setPigeonSprite = async (userId: string) => {
    const sid = spriteInput.trim().toLowerCase();
    if (!sid) {
      flash('Enter a sprite id', true);
      return;
    }
    const { error } = await supabase.rpc('admin_set_pigeon_sprite', {
      p_user_id: userId,
      p_sprite_id: sid,
    });
    if (error) flash(error.message, true);
    else {
      flash(`Sprite set to ${sid}`);
      setDrawerSprite(sid);
      if (drawerUser?.id === userId) {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (data) void openDrawer(data as Profile);
      }
    }
  };

    const applyStamps = async (userId: string) => {
    const n = Number(stampInput);
    if (!Number.isFinite(n) || n === 0) {
      flash('Enter a non-zero number', true);
      return;
    }
    if (stampMode === 'set') {
      if (n < 0) {
        flash('Balance cannot be negative', true);
        return;
      }
      const { error } = await supabase.rpc('admin_set_stamps', {
        p_user_id: userId,
        p_amount: Math.round(n),
        p_description: 'Admin set balance',
      });
      if (error) flash(error.message, true);
      else {
        flash(`Balance set to ${Math.round(n)}`);
        void loadUsers();
        if (drawerUser?.id === userId) {
          const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
          if (data) void openDrawer(data as Profile);
        }
      }
    } else {
      const { error } = await supabase.rpc('admin_adjust_stamps', {
        p_user_id: userId,
        p_delta: Math.round(n),
        p_description: `Admin adjustment ${n > 0 ? '+' : ''}${Math.round(n)}`,
      });
      if (error) flash(error.message, true);
      else {
        flash(`Adjusted by ${Math.round(n) > 0 ? '+' : ''}${Math.round(n)}`);
        void loadUsers();
        if (drawerUser?.id === userId) {
          const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
          if (data) void openDrawer(data as Profile);
        }
      }
    }
  };

  const ban = async (id: string, banned: boolean) => {
    const { error } = await supabase.rpc('admin_set_banned', { p_user_id: id, p_banned: banned });
    if (error) flash(error.message, true);
    else {
      await log(banned ? 'ban' : 'unban', 'user', id);
      flash(banned ? 'User banned' : 'User unbanned');
      void loadUsers();
      if (drawerUser?.id === id) setDrawerUser((u) => (u ? { ...u, is_banned: banned } : u));
    }
  };

  const setAdminRole = async (id: string, makeAdmin: boolean) => {
    if (!makeAdmin && !window.confirm('Revoke admin access for this user?')) return;
    if (makeAdmin && !window.confirm('Grant admin access? They will see the full admin panel.')) return;
    const { error } = await supabase.rpc('admin_set_admin', {
      p_user_id: id,
      p_is_admin: makeAdmin,
    });
    if (error) flash(error.message, true);
    else {
      flash(makeAdmin ? 'Admin granted' : 'Admin revoked');
      void loadUsers();
      if (drawerUser?.id === id) setDrawerUser((u) => (u ? { ...u, is_admin: makeAdmin } : u));
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.starts || !newEvent.ends) {
      flash('Start and end required', true);
      return;
    }
    const config: Record<string, unknown> = {};
    if (['stamp_multiplier', 'speed_multiplier'].includes(newEvent.event_type)) {
      config.multiplier = Number(newEvent.multiplier) || 2;
    }
    if (newEvent.event_type === 'banner') {
      config.message = newEvent.description || newEvent.name;
    }
    const { error } = await supabase.rpc('admin_create_event', {
      p_name: newEvent.name.trim(),
      p_description: newEvent.description.trim() || null,
      p_event_type: newEvent.event_type,
      p_config: config,
      p_starts_at: new Date(newEvent.starts).toISOString(),
      p_ends_at: new Date(newEvent.ends).toISOString(),
    });
    if (error) flash(error.message, true);
    else {
      flash('Event created');
      setNewEvent({
        name: '',
        description: '',
        event_type: 'banner',
        multiplier: '2',
        starts: '',
        ends: '',
      });
      void loadEvents();
    }
  };

  const toggleEvent = async (ev: AppEvent) => {
    const { error } = await supabase.rpc('admin_set_event_active', {
      p_event_id: ev.id,
      p_active: !ev.is_active,
    });
    if (error) flash(error.message, true);
    else {
      flash(ev.is_active ? 'Event disabled' : 'Event enabled');
      void loadEvents();
    }
  };

  const changeAddress = async (id: string, current: string) => {
    const next = window.prompt('New address:', current);
    if (next == null || !next.trim()) return;
    const geo = await geocodeAddress(next.trim());
    if (!geo) {
      flash('Could not geocode that address.', true);
      return;
    }
    const { error } = await supabase.rpc('admin_set_address', {
      p_user_id: id,
      p_address: next.trim(),
      p_latitude: geo.lat,
      p_longitude: geo.lon,
    });
    if (error) flash(error.message, true);
    else {
      await log('set_address', 'user', id, { address: next.trim() });
      flash('Address updated');
      void loadUsers();
    }
  };

  const forceDeliver = async (id: string) => {
    const { error } = await supabase.rpc('admin_force_deliver', { p_delivery_id: id });
    if (error) flash(error.message, true);
    else {
      await log('force_deliver', 'delivery', id);
      flash('Delivery forced');
      void loadLive();
      void loadDeliveries();
      void loadStats();
    }
  };

  const cancelDelivery = async (id: string) => {
    const { error } = await supabase.rpc('admin_cancel_delivery', {
      p_delivery_id: id,
      p_refund: true,
    });
    if (error) flash(error.message, true);
    else {
      await log('cancel_delivery', 'delivery', id);
      flash('Cancelled + refunded');
      void loadLive();
      void loadDeliveries();
      void loadStats();
    }
  };

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('admin_create_redeem_code', {
      p_code: newCode.code.trim(),
      p_stamp_amount: Number(newCode.amount),
      p_max_uses: newCode.maxUses ? Number(newCode.maxUses) : null,
      p_expires_at: newCode.expires ? new Date(newCode.expires).toISOString() : null,
    });
    if (error) flash(error.message, true);
    else {
      await log('create_code', 'code', undefined, { code: newCode.code });
      flash('Code created');
      setNewCode({ code: '', amount: 10, maxUses: '', expires: '' });
      void loadCodes();
    }
  };

  const deleteAllCodes = async () => {
    if (
      !window.confirm(
        'Hard delete ALL redeem codes and their redemption history?\n\nThis cannot be undone.'
      )
    ) {
      return;
    }

    // Delete redemptions first (FK safety)
    const { error: redErr } = await supabase
      .from('redeem_code_redemptions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (redErr) {
      flash(redErr.message, true);
      return;
    }

    const { error } = await supabase
      .from('redeem_codes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      flash(error.message, true);
    } else {
      await log('delete_all_codes', 'code');
      flash('All codes permanently deleted');
      setSelectedCodeId(null);
      setCodeAnalytics([]);
      void loadCodes();
    }
  };

  const toggleCode = async (c: RedeemCode) => {
    const { error } = await supabase.from('redeem_codes').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) flash(error.message, true);
    else {
      await log(c.is_active ? 'disable_code' : 'enable_code', 'code', c.id);
      flash(c.is_active ? 'Code disabled' : 'Code enabled');
      void loadCodes();
    }
  };

  const resolveReport = async (id: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    const note =
      status === 'resolved' || status === 'dismissed'
        ? window.prompt('Admin note (optional):') ?? undefined
        : undefined;
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: id,
      p_status: status,
      p_admin_note: note || null,
    });
    if (error) flash(error.message, true);
    else {
      flash(`Report ${status}`);
      void loadReports();
    }
  };

  const bulkForceOverdue = async () => {
    if (!window.confirm('Force-complete all overdue flying deliveries?')) return;
    const { data, error } = await supabase.rpc('admin_bulk_force_overdue');
    if (error) flash(error.message, true);
    else {
      flash(`Forced ${data} deliveries`);
      void loadLive();
      void loadDeliveries();
      void loadStats();
    }
  };

  const bulkCancelOverdue = async () => {
    if (!window.confirm('Cancel + refund all overdue flying deliveries?')) return;
    const { data, error } = await supabase.rpc('admin_bulk_cancel_overdue');
    if (error) flash(error.message, true);
    else {
      flash(`Cancelled ${data} deliveries`);
      void loadLive();
      void loadDeliveries();
      void loadStats();
    }
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportUsersCsv = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('username,display_name,pigeon_id,stamp_balance,address,is_banned,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    const header = ['username', 'display_name', 'pigeon_id', 'stamps', 'address', 'banned', 'created_at'];
    const rows = (data || []).map((p) => [
      p.username,
      p.display_name,
      p.pigeon_id,
      String(p.stamp_balance),
      p.address,
      String(p.is_banned),
      p.created_at,
    ]);
    downloadCsv('users.csv', [header, ...rows]);
    flash('Users CSV downloaded');
  };

  const exportLedgerCsv = async () => {
    const { data } = await supabase
      .from('stamp_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    const header = ['id', 'user_id', 'amount', 'type', 'description', 'created_at'];
    const rows = ((data as StampTransaction[]) || []).map((t) => [
      t.id,
      t.user_id,
      String(t.amount),
      t.transaction_type,
      t.description || '',
      t.created_at,
    ]);
    downloadCsv('stamp_ledger.csv', [header, ...rows]);
    flash('Ledger CSV downloaded');
  };

  const saveSetting = async (key: string) => {
    let value: unknown = settings[key];
    try {
      value = JSON.parse(settings[key]);
    } catch {
      value = settings[key];
    }
    const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value });
    if (error) flash(error.message, true);
    else {
      await log('set_setting', 'setting', undefined, { key, value });
      flash(`Saved ${key}`);
    }
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcast.title.trim() || !broadcast.message.trim()) {
      flash('Title and message required', true);
      return;
    }
    const { data, error } = await supabase.rpc('admin_broadcast', {
      p_title: broadcast.title.trim(),
      p_message: broadcast.message.trim(),
      p_user_id: broadcast.userId.trim() || null,
    });
    if (error) flash(error.message, true);
    else {
      flash(`Sent to ${data} user(s)`);
      setBroadcast({ title: '', message: '', userId: '' });
      void loadAudit();
    }
  };

  const shell: React.CSSProperties = {
    display: 'flex',
    minHeight: '100vh',
    background: '#0f1115',
    color: '#e8eaed',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const sidebar: React.CSSProperties = {
    width: 220,
    flexShrink: 0,
    background: '#161a22',
    borderRight: '1px solid #2a2f3a',
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };

  const main: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '16px 16px 40px',
    maxWidth: 1100,
  };

  const card: React.CSSProperties = {
    background: '#1a1f29',
    border: '1px solid #2a2f3a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  };

  const btn: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    background: '#2a3242',
    color: '#e8eaed',
  };

  const btnPrimary: React.CSSProperties = { ...btn, background: '#3b82f6', color: '#fff' };
  const btnDanger: React.CSSProperties = { ...btn, background: '#7f1d1d', color: '#fecaca' };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #2a2f3a',
    background: '#0f1115',
    color: '#e8eaed',
    fontSize: 14,
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={shell}>
      {/* Mobile top bar */}
      <div
        style={{
          display: isMobile ? 'flex' : 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#161a22',
          padding: '12px 16px',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #2a2f3a',
        }}
      >
        <strong>Admin</strong>
        <button type="button" style={btn} onClick={() => setNavOpen((v) => !v)}>
          Menu
        </button>
      </div>

      {/* Sidebar */}
      <aside
        style={{
          ...sidebar,
          display: isMobile ? (navOpen ? 'flex' : 'none') : 'flex',
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
          height: '100vh',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, padding: '8px 10px 16px' }}>🐦 Admin</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setNavOpen(false);
            }}
            style={{
              ...btn,
              textAlign: 'left',
              background: tab === t.id ? '#3b82f6' : 'transparent',
              color: tab === t.id ? '#fff' : '#a0a8b8',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => setIsAdminMode(false)}>
          User mode
        </button>
        <button type="button" style={{ ...btnDanger, marginTop: 6 }} onClick={() => signOut()}>
          Sign out
        </button>
      </aside>

      <main style={{ ...main, paddingTop: isMobile ? 64 : 16 }}>
        {(msg || err) && (
          <div
            style={{
              ...card,
              background: err ? '#3f1a1a' : '#14301f',
              borderColor: err ? '#7f1d1d' : '#1a5c34',
              color: err ? '#fecaca' : '#86efac',
            }}
          >
            {err || msg}
          </div>
        )}

        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>Dashboard</h1>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn} onClick={() => void exportUsersCsv()}>
                  Export users
                </button>
                <button type="button" style={btn} onClick={() => void exportLedgerCsv()}>
                  Export ledger
                </button>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 10,
              }}
            >
              <Stat label="Users" value={stats.users} />
              <Stat label="Messages" value={stats.messages} />
              <Stat label="Flying" value={stats.flying} />
              <Stat label="Overdue" value={stats.overdue} alert={stats.overdue > 0} />
              <Stat label="Delivered" value={stats.delivered} />
              <Stat label="Failed" value={stats.failed} />
              <Stat label="Stamps" value={stats.stamps} />
            </div>
            {stats.overdue > 0 && (
              <div style={{ ...card, marginTop: 16 }}>
                <strong>{stats.overdue} overdue flight(s)</strong>
                <p style={{ fontSize: 13, color: '#a0a8b8', marginTop: 6 }}>
                  Open Live ops to force-deliver or cancel.
                </p>
                <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={() => setTab('live')}>
                  Open Live ops
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'live' && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h1 style={{ fontSize: 22, margin: 0 }}>Live ops</h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => void loadLive()}>
                  Refresh
                </button>
                <button type="button" style={btnPrimary} onClick={() => void bulkForceOverdue()}>
                  Force all overdue
                </button>
                <button type="button" style={btnDanger} onClick={() => void bulkCancelOverdue()}>
                  Cancel all overdue
                </button>
              </div>
            </div>
            {live.length === 0 && <p style={{ color: '#a0a8b8' }}>No active flights.</p>}
            {live.map((d) => (
              <div key={d.id} style={{ ...card, borderColor: d.overdue ? '#7f1d1d' : '#2a2f3a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong>
                      @{d.sender} → @{d.receiver}
                    </strong>
                    {d.overdue && (
                      <span style={{ marginLeft: 8, color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>
                        OVERDUE
                      </span>
                    )}
                    <div style={{ fontSize: 13, color: '#a0a8b8', marginTop: 4 }}>
                      {d.distance_km} km · {d.weather} · {d.status} · {d.estimated_duration_seconds}s ETA
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" style={btnPrimary} onClick={() => void forceDeliver(d.id)}>
                      Force
                    </button>
                    <button type="button" style={btnDanger} onClick={() => void cancelDelivery(d.id)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'users' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Users</h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                style={inputStyle}
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search username, name, PID"
              />
              <button type="button" style={btnPrimary} onClick={() => void loadUsers()}>
                Search
              </button>
            </div>
            {users.map((u) => (
              <div key={u.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void openDrawer(u)}
                    style={{ background: 'none', border: 'none', color: '#e8eaed', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  >
                    <strong>{u.display_name}</strong> @{u.username}
                    <div style={{ fontSize: 12, color: '#a0a8b8' }}>
                      {u.pigeon_id} · 🪙 {u.stamp_balance}
                      {u.is_banned ? ' · BANNED' : ''}
                      {u.is_admin ? ' · ADMIN' : ''}
                    </div>
                  </button>
                  <button type="button" style={btn} onClick={() => void openDrawer(u)}>
                    Details
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'ledger' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Stamp ledger</h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                style={inputStyle}
                value={ledgerUser}
                onChange={(e) => setLedgerUser(e.target.value)}
                placeholder="Filter by username (optional)"
              />
              <button type="button" style={btnPrimary} onClick={() => void loadLedger()}>
                Refresh
              </button>
            </div>
            {ledger.map((tx) => (
              <div key={tx.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>@{tx.username || '—'}</strong>
                  <span style={{ color: tx.amount >= 0 ? '#86efac' : '#fca5a5', fontWeight: 700 }}>
                    {tx.amount >= 0 ? '+' : ''}
                    {tx.amount}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#a0a8b8', marginTop: 4 }}>
                  {tx.transaction_type} · {tx.description || '—'} ·{' '}
                  {new Date(tx.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'deliveries' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>Deliveries</h1>
              <button type="button" style={btn} onClick={() => void loadDeliveries()}>
                Refresh
              </button>
            </div>
            {deliveries.map((d) => (
              <div key={d.id} style={card}>
                <strong>
                  @{d.sender} → @{d.receiver}
                </strong>
                <div style={{ fontSize: 13, color: '#a0a8b8', marginTop: 4 }}>
                  {d.status} · {d.distance_km} km · {d.weather}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {!['DELIVERED', 'READ', 'FAILED'].includes(d.status) && (
                    <button type="button" style={btnPrimary} onClick={() => void forceDeliver(d.id)}>
                      Force
                    </button>
                  )}
                  {d.status !== 'FAILED' && (
                    <button type="button" style={btnDanger} onClick={() => void cancelDelivery(d.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'codes' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Redeem codes</h1>

            <form onSubmit={(e) => void createCode(e)} style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Create code</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Code</label>
                <input
                  style={inputStyle}
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME10"
                  required
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Stamps</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={newCode.amount}
                  onChange={(e) => setNewCode({ ...newCode, amount: Number(e.target.value) })}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>
                  Max uses (empty = unlimited / multi-user)
                </label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={newCode.maxUses}
                  onChange={(e) => setNewCode({ ...newCode, maxUses: e.target.value })}
                  placeholder="1 = single use, empty = ∞"
                />
              </div>
              <button type="submit" style={btnPrimary}>
                Add code
              </button>
            </form>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '16px 0 8px',
              }}
            >
              <div style={{ fontSize: 13, color: '#a0a8b8' }}>
                {codes.length} code{codes.length === 1 ? '' : 's'}
              </div>
              {codes.length > 0 && (
                <button type="button" style={btnDanger} onClick={() => void deleteAllCodes()}>
                  Delete all codes
                </button>
              )}
            </div>

            {codes.map((c) => (
              <div key={c.id} style={card}>
                <strong style={{ fontFamily: 'monospace' }}>{c.code}</strong>
                <div style={{ fontSize: 13, color: '#a0a8b8' }}>
                  +{c.stamp_amount} · used {c.used_count}
                  {c.max_uses != null ? `/${c.max_uses}` : '/∞'}
                  {!c.is_active ? ' · OFF' : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={btn} onClick={() => void toggleCode(c)}>
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" style={btnPrimary} onClick={() => void loadCodeAnalytics(c.id)}>
                    Analytics
                  </button>
                </div>
                {selectedCodeId === c.id && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#a0a8b8' }}>
                    {codeAnalytics.length === 0 && <p>No redemptions yet.</p>}
                    {codeAnalytics.map((r) => (
                      <div key={r.id} style={{ padding: '4px 0', borderTop: '1px solid #2a2f3a' }}>
                        @{r.username || r.user_id.slice(0, 8)} · +{r.stamp_amount} ·{' '}
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'moderation' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>Moderation</h1>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  style={{ ...btn, background: reportFilter === 'open' ? '#3b82f6' : '#2a3242' }}
                  onClick={() => setReportFilter('open')}
                >
                  Open
                </button>
                <button
                  type="button"
                  style={{ ...btn, background: reportFilter === 'all' ? '#3b82f6' : '#2a3242' }}
                  onClick={() => setReportFilter('all')}
                >
                  All
                </button>
                <button type="button" style={btn} onClick={() => void loadReports()}>
                  Refresh
                </button>
              </div>
            </div>
            {reports.length === 0 && <p style={{ color: '#a0a8b8' }}>No reports.</p>}
            {reports.map((r) => (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{r.reason.replace(/_/g, ' ')}</strong>
                  <span style={{ fontSize: 12, color: '#a0a8b8' }}>{r.status}</span>
                </div>
                <div style={{ fontSize: 13, color: '#a0a8b8', marginTop: 4 }}>
                  @{r.reporter || '?'} → @{r.reported || '?'}
                </div>
                {r.details && (
                  <p style={{ fontSize: 13, marginTop: 6, color: '#c8cdd8' }}>{r.details}</p>
                )}
                {r.admin_note && (
                  <p style={{ fontSize: 12, marginTop: 4, color: '#86efac' }}>Note: {r.admin_note}</p>
                )}
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {new Date(r.created_at).toLocaleString()}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {r.status === 'open' && (
                    <button type="button" style={btn} onClick={() => void resolveReport(r.id, 'reviewing')}>
                      Reviewing
                    </button>
                  )}
                  {r.status !== 'resolved' && (
                    <button type="button" style={btnPrimary} onClick={() => void resolveReport(r.id, 'resolved')}>
                      Resolve
                    </button>
                  )}
                  {r.status !== 'dismissed' && (
                    <button type="button" style={btn} onClick={() => void resolveReport(r.id, 'dismissed')}>
                      Dismiss
                    </button>
                  )}
                  {r.reported_user_id && (
                    <button
                      type="button"
                      style={btnDanger}
                      onClick={() => void ban(r.reported_user_id!, true)}
                    >
                      Ban reported
                    </button>
                  )}
                  {r.reported_user_id && (
                    <button
                      type="button"
                      style={btn}
                      onClick={() => {
                        setBroadcast({
                          title: 'Message from admin',
                          message: '',
                          userId: r.reported_user_id!,
                        });
                        setTab('broadcast');
                      }}
                    >
                      Message user
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'messages' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Message search</h1>
            <div style={card}>
              <p style={{ fontSize: 12, color: '#a0a8b8', marginTop: 0 }}>
                Search by username, Pigeon ID, or message text. Bodies expand on click.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                  value={msgQuery}
                  onChange={(e) => setMsgQuery(e.target.value)}
                  placeholder="username / PID / text"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void searchMessages();
                  }}
                />
                <button type="button" style={btnPrimary} onClick={() => void searchMessages()}>
                  Search
                </button>
              </div>
            </div>
            {msgResults.map((m) => (
              <div key={m.id} style={card}>
                <div style={{ fontSize: 13, color: '#a0a8b8' }}>
                  @{m.sender} → @{m.receiver} · {new Date(m.created_at).toLocaleString()}
                </div>
                <button
                  type="button"
                  style={{
                    ...btn,
                    marginTop: 8,
                    width: '100%',
                    textAlign: 'left',
                    fontWeight: 400,
                    whiteSpace: msgExpanded === m.id ? 'pre-wrap' : 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  onClick={() => setMsgExpanded(msgExpanded === m.id ? null : m.id)}
                >
                  {m.content}
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'events' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Events</h1>
            <form onSubmit={(e) => void createEvent(e)} style={card}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Name</label>
                <input
                  style={inputStyle}
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Type</label>
                <select
                  style={inputStyle}
                  value={newEvent.event_type}
                  onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                >
                  <option value="banner">Banner</option>
                  <option value="stamp_multiplier">Stamp multiplier</option>
                  <option value="speed_multiplier">Speed multiplier</option>
                  <option value="double_daily">Double daily reward</option>
                  <option value="free_sends">Free sends (flag)</option>
                </select>
              </div>
              {['stamp_multiplier', 'speed_multiplier'].includes(newEvent.event_type) && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>Multiplier</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    step={0.5}
                    value={newEvent.multiplier}
                    onChange={(e) => setNewEvent({ ...newEvent, multiplier: e.target.value })}
                  />
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Description / banner text</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 60 }}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>Starts</label>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={newEvent.starts}
                    onChange={(e) => setNewEvent({ ...newEvent, starts: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>Ends</label>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={newEvent.ends}
                    onChange={(e) => setNewEvent({ ...newEvent, ends: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" style={btnPrimary}>
                Create event
              </button>
            </form>
            {events.map((ev) => {
              const now = Date.now();
              const live =
                ev.is_active &&
                new Date(ev.starts_at).getTime() <= now &&
                new Date(ev.ends_at).getTime() > now;
              return (
                <div key={ev.id} style={{ ...card, borderColor: live ? '#1a5c34' : '#2a2f3a' }}>
                  <strong>{ev.name}</strong>
                  {live && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#86efac', fontWeight: 700 }}>
                      LIVE
                    </span>
                  )}
                  <div style={{ fontSize: 13, color: '#a0a8b8', marginTop: 4 }}>
                    {ev.event_type} · {ev.is_active ? 'on' : 'off'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {new Date(ev.starts_at).toLocaleString()} → {new Date(ev.ends_at).toLocaleString()}
                  </div>
                  {ev.description && (
                    <p style={{ fontSize: 13, marginTop: 6, color: '#c8cdd8' }}>{ev.description}</p>
                  )}
                  <button type="button" style={{ ...btn, marginTop: 8 }} onClick={() => void toggleEvent(ev)}>
                    {ev.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}
          </>
        )}

        {tab === 'health' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>System health</h1>
              <button type="button" style={btn} onClick={() => void loadHealth()}>
                Refresh
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 10,
              }}
            >
              <Stat label="Maintenance" value={health.maintenance ? 1 : 0} alert={health.maintenance} />
              <Stat label="Sending paused" value={health.sendingPaused ? 1 : 0} alert={health.sendingPaused} />
              <Stat label="Open reports" value={health.openReports} alert={health.openReports > 0} />
              <Stat label="Flying" value={health.flying} />
              <Stat label="Overdue" value={health.overdue} alert={health.overdue > 0} />
              <Stat label="Failed 24h" value={health.failed24h} />
              <Stat label="Delivered 24h" value={health.delivered24h} />
            </div>
            <div style={{ ...card, marginTop: 12 }}>
              <div style={{ fontSize: 13 }}>
                <strong>time_multiplier</strong>: {health.timeMultiplier}
                {health.timeMultiplier === '1' || health.timeMultiplier === '1.0' ? (
                  <span style={{ color: '#86efac' }}> · real time</span>
                ) : (
                  <span style={{ color: '#fcd34d' }}> · accelerated</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#a0a8b8', marginBottom: 0 }}>
                Toggle maintenance / sending_paused under Settings. Overdue flights: Live ops → Force all
                overdue.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => setTab('settings')}>
                  Open settings
                </button>
                <button type="button" style={btn} onClick={() => setTab('live')}>
                  Live ops
                </button>
                <button type="button" style={btn} onClick={() => setTab('moderation')}>
                  Moderation
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'growth' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>Growth</h1>
              <button type="button" style={btn} onClick={() => void loadGrowth()}>
                Refresh
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 10,
              }}
            >
              <Stat label="Signups (7d)" value={growth.signups7d} />
              <Stat label="Messages (7d)" value={growth.messages7d} />
              <Stat label="Delivered (7d)" value={growth.delivers7d} />
              <Stat label="Tutorial done" value={growth.tutorialDone} />
              <Stat label="Banned" value={growth.banned} alert={growth.banned > 0} />
            </div>
            <div style={{ ...card, marginTop: 12 }}>
              <p style={{ fontSize: 13, color: '#a0a8b8', margin: 0 }}>
                Export full lists from Dashboard. Tutorial % ≈ tutorial done / total users on Dashboard.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => void exportUsersCsv()}>
                  CSV users
                </button>
                <button type="button" style={btn} onClick={() => void exportLedgerCsv()}>
                  CSV ledger
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'broadcast' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Broadcast</h1>
            <form onSubmit={(e) => void sendBroadcast(e)} style={card}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Title</label>
                <input
                  style={inputStyle}
                  value={broadcast.title}
                  onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>Message</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 100 }}
                  value={broadcast.message}
                  onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>
                  User ID (optional — leave empty for everyone)
                </label>
                <input
                  style={inputStyle}
                  value={broadcast.userId}
                  onChange={(e) => setBroadcast({ ...broadcast, userId: e.target.value })}
                  placeholder="uuid or empty"
                />
              </div>
              <button type="submit" style={btnPrimary}>
                Send notification
              </button>
            </form>
          </>
        )}

        {tab === 'audit' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>Audit log</h1>
              <button type="button" style={btn} onClick={() => void loadAudit()}>
                Refresh
              </button>
            </div>
            {audit.length === 0 && <p style={{ color: '#a0a8b8' }}>No audit entries yet.</p>}
            {audit.map((a) => (
              <div key={a.id} style={card}>
                <strong>{a.action}</strong>
                <div style={{ fontSize: 12, color: '#a0a8b8', marginTop: 4 }}>
                  {a.target_type || '—'} {a.target_id ? `· ${a.target_id.slice(0, 8)}…` : ''} ·{' '}
                  {new Date(a.created_at).toLocaleString()}
                </div>
                {a.details && Object.keys(a.details).length > 0 && (
                  <pre
                    style={{
                      fontSize: 11,
                      color: '#8b93a7',
                      marginTop: 6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {JSON.stringify(a.details)}
                  </pre>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'settings' && (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>Settings</h1>
            <div style={card}>
              {[
                'time_multiplier',
                'failure_probability',
                'daily_stamp_reward',
                'pigeon_base_speed_mph',
                'signup_stamp_bonus',
                'sending_paused',
                'maintenance_mode',
                'maintenance_message',
                'max_stamps_per_user',
                'max_sends_per_hour',
              ].map((key) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>{key}</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input
                      style={inputStyle}
                      value={settings[key] ?? ''}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    />
                    <button type="button" style={btnPrimary} onClick={() => void saveSetting(key)}>
                      Save
                    </button>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12, color: '#a0a8b8' }}>
                time_multiplier: 1 = real time · 3600 = fast test. sending_paused: true blocks new
                sends (enforce in next phase on client).
              </p>
            </div>
          </>
        )}
      </main>

      {/* User detail drawer */}
      {drawerUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 60,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setDrawerUser(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#161a22',
              height: '100%',
              overflowY: 'auto',
              padding: 20,
              borderLeft: '1px solid #2a2f3a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{drawerUser.display_name}</h2>
              <button type="button" style={btn} onClick={() => setDrawerUser(null)}>
                Close
              </button>
            </div>
            <p style={{ fontSize: 13, color: '#a0a8b8' }}>
              @{drawerUser.username} · {drawerUser.pigeon_id}
            </p>
            <p style={{ fontSize: 13, color: '#a0a8b8' }}>
              Pigeon: {drawerPigeonName || '—'}
              {drawerPigeonGender ? ` · ${drawerPigeonGender}` : ''}
              {drawerSprite ? ` · ${drawerSprite}` : ''}
            </p>
            <p style={{ fontSize: 13, color: '#a0a8b8' }}>{drawerUser.address}</p>

            <div style={{ ...card, marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Pigeon sprite</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <PigeonAvatar spriteId={spriteInput || drawerSprite} size={72} />
              </div>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>Dropdown (basic starters)</label>
              <select
                style={{ ...inputStyle, marginTop: 4, marginBottom: 8 }}
                value={(BASIC_SPRITE_IDS as readonly string[]).includes(spriteInput) ? spriteInput : ''}
                onChange={(e) => {
                  if (e.target.value) setSpriteInput(e.target.value);
                }}
              >
                <option value="">— pick basic —</option>
                {BASIC_SPRITE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>Or type sprite id (e.g. basic-10)</label>
              <input
                style={{ ...inputStyle, marginTop: 4 }}
                value={spriteInput}
                onChange={(e) => setSpriteInput(e.target.value.trim())}
                placeholder="basic-07"
              />
              <button
                type="button"
                style={{ ...btnPrimary, width: '100%', marginTop: 8 }}
                onClick={() => void setPigeonSprite(drawerUser.id)}
              >
                Set sprite
              </button>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
                Signup still randomizes basic-01…09. Use this only for customs / friends.
              </p>
            </div>
            <p style={{ marginTop: 8 }}>
              🪙 <strong>{drawerUser.stamp_balance}</strong>
              {drawerUser.is_banned ? ' · BANNED' : ''}
              {drawerUser.is_admin ? ' · ADMIN' : ''}
            </p>

            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Stamps</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  style={{ ...btn, background: stampMode === 'add' ? '#3b82f6' : '#2a3242' }}
                  onClick={() => setStampMode('add')}
                >
                  Add / subtract
                </button>
                <button
                  type="button"
                  style={{ ...btn, background: stampMode === 'set' ? '#3b82f6' : '#2a3242' }}
                  onClick={() => setStampMode('set')}
                >
                  Set balance
                </button>
              </div>
              <input
                style={inputStyle}
                type="number"
                value={stampInput}
                onChange={(e) => setStampInput(e.target.value)}
                placeholder={stampMode === 'add' ? 'e.g. 25 or -10' : 'e.g. 100'}
              />
              <button
                type="button"
                style={{ ...btnPrimary, width: '100%', marginTop: 8 }}
                onClick={() => void applyStamps(drawerUser.id)}
              >
                Apply
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btnDanger} onClick={() => void ban(drawerUser.id, !drawerUser.is_banned)}>
                {drawerUser.is_banned ? 'Unban' : 'Ban'}
              </button>
              <button type="button" style={btn} onClick={() => void changeAddress(drawerUser.id, drawerUser.address)}>
                Change address
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => void setAdminRole(drawerUser.id, !drawerUser.is_admin)}
              >
                {drawerUser.is_admin ? 'Revoke admin' : 'Grant admin'}
              </button>
            </div>

            <h3 style={{ fontSize: 14, marginTop: 20 }}>Recent stamp txs</h3>
            {drawerTx.map((tx) => (
              <div key={tx.id} style={{ fontSize: 12, color: '#a0a8b8', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                <span style={{ color: tx.amount >= 0 ? '#86efac' : '#fca5a5' }}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>{' '}
                {tx.transaction_type} · {tx.description || ''}
              </div>
            ))}

            <h3 style={{ fontSize: 14, marginTop: 20 }}>Recent deliveries</h3>
            {drawerDel.map((d) => (
              <div key={d.id} style={{ fontSize: 12, color: '#a0a8b8', padding: '6px 0', borderBottom: '1px solid #2a2f3a' }}>
                {d.status} · {d.distance_km} km · → @{d.receiver}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      style={{
        background: alert ? '#3f1a1a' : '#1a1f29',
        border: `1px solid ${alert ? '#7f1d1d' : '#2a2f3a'}`,
        borderRadius: 12,
        padding: 14,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#a0a8b8' }}>{label}</div>
    </div>
  );
}