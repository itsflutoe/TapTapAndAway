import { useEffect, useState } from 'react';
import {
  isStandalone,
  promptInstall,
  subscribeInstallAvailability,
} from '../lib/pwa';

const DISMISS_KEY = 'tta_install_dismissed';

/**
 * Unobtrusive install affordance. Never auto-prompts.
 * Hidden when already installed, dismissed, or browser has no install event.
 */
export default function InstallAppBanner() {
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeInstallAvailability(setCanInstall), []);

  if (isStandalone() || dismissed || !canInstall) return null;

  return (
    <div
      style={{
        margin: '0 0 12px',
        padding: '10px 12px',
        borderRadius: 12,
        background: '#eef5ff',
        border: '1px solid #d0e3ff',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1, color: 'var(--text)', lineHeight: 1.35 }}>
        Install <strong>Tap Tap and Away</strong> for a full-screen app experience.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await promptInstall();
          setBusy(false);
          if (result === 'accepted' || result === 'unavailable') {
            setDismissed(true);
          }
        }}
        style={{
          flexShrink: 0,
          border: 'none',
          background: '#0071e3',
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          padding: '8px 12px',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: '#666',
          fontSize: 16,
          cursor: 'pointer',
          padding: '4px 6px',
        }}
      >
        ×
      </button>
    </div>
  );
}
