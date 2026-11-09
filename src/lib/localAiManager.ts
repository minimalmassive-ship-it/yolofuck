/**
 * localAiManager.ts — yolofuck
 * Lightweight environment detection for standalone web/desktop/mobile journal.
 */

export function isPublicWebHttpsEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const isElectron = Boolean(
    (window as any).electron || 
    (window.navigator?.userAgent && window.navigator.userAgent.toLowerCase().includes('electron'))
  );
  const isNativeCapacitor = Boolean(
    (window as any).Capacitor &&
    typeof (window as any).Capacitor.isNativePlatform === 'function' &&
    (window as any).Capacitor.isNativePlatform()
  );
  return window.location.protocol === 'https:' && !isElectron && !isNativeCapacitor;
}
