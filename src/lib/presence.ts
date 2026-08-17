/** Presence helpers — last_seen_at from profiles */

export function formatPresence(lastSeenAt: string | null | undefined): {
  online: boolean;
  label: string;
} {
  if (!lastSeenAt) return { online: false, label: 'Offline' };
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (Number.isNaN(diff) || diff < 0) return { online: false, label: 'Offline' };

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  // Active now: within ~5 minutes
  if (diff < 5 * minute) return { online: true, label: 'Active now' };
  if (diff < hour) {
    const m = Math.max(1, Math.floor(diff / minute));
    return { online: false, label: `Active ${m}m ago` };
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return { online: false, label: `Active ${h}h ago` };
  }
  const d = Math.floor(diff / day);
  if (d === 1) return { online: false, label: 'Active yesterday' };
  return { online: false, label: `Active ${d}d ago` };
}

/** Best-effort city from stored address (no full street on friend profile). */
export function cityFromAddress(address: string | null | undefined): string {
  if (!address || !address.trim()) return 'Unknown area';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] || parts[0];
  return parts[0];
}

export function friendsSinceLabel(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
