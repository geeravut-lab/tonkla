/**
 * How the "install the app" button should behave on this device.
 *  - installed: already running as an installed app (hide the button)
 *  - prompt:    the browser offered its own install dialog (Chrome / Edge / Samsung Internet on Android and computers)
 *  - ios:       iPhone / iPad: no install dialog exists, the person must use Share > Add to Home Screen
 *  - manual:    anything else: show where the browser keeps its install item
 */
export type InstallMode = "installed" | "prompt" | "ios" | "manual";

export type InstallEnv = { ua: string; touchPoints: number; standalone: boolean; hasPrompt: boolean };

export function isIos(ua: string, touchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac, but a Mac has no touch screen
  return /Macintosh/i.test(ua) && touchPoints > 1;
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  if (isIos(env.ua, env.touchPoints)) return "ios";
  return "manual";
}
