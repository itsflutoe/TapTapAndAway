/**
 * Browser / OS notification helpers.
 * - Permission is never requested on page load — only via enableBrowserNotifications().
 * - Local alerts when the app is open (Realtime → Notification API).
 * - PushSubscription is collected client-side when VITE_VAPID_PUBLIC_KEY is set;
 *   true background push still needs a server holding the VAPID *private* key.
 */

const PREF_KEY = 'tta_browser_notifications';
const PUSH_KEY = 'tta_push_subscription';

export type NotificationPref = 'unset' | 'enabled' | 'denied' | 'unsupported';

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPref(): NotificationPref {
  if (!browserNotificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === 'enabled' && Notification.permission === 'granted') return 'enabled';
    if (v === 'denied') return 'denied';
  } catch {
    /* ignore */
  }
  if (Notification.permission === 'granted') {
    // Granted in browser but user may not have opted in via our UI
    try {
      if (localStorage.getItem(PREF_KEY) === 'enabled') return 'enabled';
    } catch {
      /* ignore */
    }
  }
  return 'unset';
}

export function isBrowserNotificationsEnabled(): boolean {
  return getNotificationPref() === 'enabled' && Notification.permission === 'granted';
}

/** Explicit user action only — never call on mount. */
export async function enableBrowserNotifications(): Promise<NotificationPref> {
  if (!browserNotificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') {
    try {
      localStorage.setItem(PREF_KEY, 'denied');
    } catch {
      /* ignore */
    }
    return 'denied';
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    try {
      localStorage.setItem(PREF_KEY, 'enabled');
    } catch {
      /* ignore */
    }
    void trySubscribePush();
    return 'enabled';
  }

  if (permission === 'denied') {
    try {
      localStorage.setItem(PREF_KEY, 'denied');
    } catch {
      /* ignore */
    }
    return 'denied';
  }

  return 'unset';
}

export function disableBrowserNotifications(): void {
  try {
    localStorage.setItem(PREF_KEY, 'unset');
  } catch {
    /* ignore */
  }
  // Cannot revoke browser permission from JS; user must change it in browser settings.
  void unsubscribePush();
}

/** Show a local OS notification if the user enabled them (app open / SW ready). */
export async function showLocalNotification(
  title: string,
  options?: { body?: string; url?: string; tag?: string }
): Promise<void> {
  if (!isBrowserNotificationsEnabled()) return;

  const opts: NotificationOptions = {
    body: options?.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: options?.tag || 'tta-notif',
    data: { url: options?.url || '/' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    new Notification(title, opts);
  } catch {
    /* ignore */
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribe for Web Push if a *public* VAPID key is configured.
 * Private key must never ship in the frontend.
 * Subscription JSON is stored in localStorage for a future backend to read/send.
 */
export async function trySubscribePush(): Promise<PushSubscriptionJSON | null> {
  if (!isBrowserNotificationsEnabled()) return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const vapid = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  if (!vapid) {
    // Infrastructure ready; no public key configured yet — skip without error.
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }
    const json = sub.toJSON();
    try {
      localStorage.setItem(PUSH_KEY, JSON.stringify(json));
    } catch {
      /* ignore */
    }
    return json;
  } catch (err) {
    console.warn('[PWA] Push subscribe failed (client infrastructure only):', err);
    return null;
  }
}

export async function unsubscribePush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PUSH_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredPushSubscription(): PushSubscriptionJSON | null {
  try {
    const raw = localStorage.getItem(PUSH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PushSubscriptionJSON;
  } catch {
    return null;
  }
}
