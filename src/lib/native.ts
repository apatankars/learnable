import { Capacitor } from '@capacitor/core';

// Native-shell setup for the iOS app; no-op on the web.
export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');

  const [{ StatusBar, Style }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/keyboard'),
  ]);
  // Light parchment background → dark status bar text.
  await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  // Answers submit on Return; the prev/next/done bar is just clutter.
  await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  await SplashScreen.hide().catch(() => {});
}
