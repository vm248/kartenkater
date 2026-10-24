import { registerSW } from 'virtual:pwa-register';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and actively checks for new versions.
 * Installed iOS PWAs are often only resumed, never reloaded, so without this
 * players can stay on an old version for days.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { registration.update().catch(() => { /* offline */ }); };
      setInterval(check, UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
