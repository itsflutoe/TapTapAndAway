/** PWA helpers: service worker registration + install prompt (no forced install). */

const SW_URL = '/sw.js';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).catch((err) => {
      console.warn('[PWA] Service worker registration failed:', err);
    });
  });
}

/** Chrome/Edge beforeinstallprompt event (typed loosely). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(canInstall: boolean) => void>();

function notify() {
  const can = !!deferredPrompt && !isStandalone();
  listeners.forEach((fn) => fn(can));
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || ios;
}

export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstallAvailability(fn: (canInstall: boolean) => void): () => void {
  listeners.add(fn);
  fn(!!deferredPrompt && !isStandalone());
  return () => listeners.delete(fn);
}

/** User-triggered install. Returns false if browser has no deferred prompt. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    return outcome;
  } catch {
    return 'unavailable';
  }
}
