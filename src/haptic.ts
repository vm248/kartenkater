const PATTERNS = {
  light:   [30],
  success: [60],
  error:   [100, 50, 100],
} as const;

export function haptic(type: keyof typeof PATTERNS): void {
  if (localStorage.getItem('busfahren_haptic') === '0') return;
  if (!('vibrate' in navigator)) return;
  navigator.vibrate(PATTERNS[type]);
}
