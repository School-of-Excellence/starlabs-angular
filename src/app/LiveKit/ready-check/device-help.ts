import { BrowserInfo } from './browser-info';

// Plain-language fixes for each camera / microphone failure, per browser and OS
// (plan 2026-11-27-join-ready-check, Phase 2). A web page cannot change browser or OS settings
// itself — it can only explain them and, for Mac / Windows, open the right settings page.

export type DeviceKind = 'camera' | 'mic';
export type DeviceProblem = 'dismissed' | 'site-blocked' | 'os-blocked' | 'busy' | 'missing' | 'error';

const NOUN: Record<DeviceKind, string> = { camera: 'camera', mic: 'microphone' };

export function browserLabel(info: BrowserInfo): string {
  return { chrome: 'Google Chrome', edge: 'Microsoft Edge', safari: 'Safari', firefox: 'Firefox', other: 'your browser' }[info.browser];
}

/** One-line status for the check row. */
export function problemMessage(kind: DeviceKind, p: DeviceProblem): string {
  const n = NOUN[kind];
  switch (p) {
    case 'dismissed':    return `Not allowed yet — please allow the ${n}`;
    case 'site-blocked': return `Blocked for this website`;
    case 'os-blocked':   return `Your computer is blocking the browser from the ${n}`;
    case 'busy':         return `In use by another app (Zoom, Teams…)`;
    case 'missing':      return kind === 'camera' ? 'No camera found — a camera is needed to join this call' : 'No microphone found';
    default:             return `Couldn't start the ${n}`;
  }
}

/** Step-by-step fix for the check row. */
export function problemHelp(kind: DeviceKind, p: DeviceProblem, info: BrowserInfo): string {
  const n = NOUN[kind];
  const Cap = kind === 'camera' ? 'Camera' : 'Microphone';
  switch (p) {
    case 'dismissed':
      return `Click "Try again" and choose "Allow" when ${browserLabel(info)} asks.`;
    case 'site-blocked':
      if (info.browser === 'safari') return `In the Safari menu choose "Settings for this Website…" → set Camera and Microphone to "Allow" → click "Try again".`;
      if (info.browser === 'firefox') return `Click the camera icon in the address bar → remove "Blocked" for Camera and Microphone → reload this page.`;
      return `Click the icon to the left of the web address → turn on Camera and Microphone → click "Try again" (reload the page if it still says blocked).`;
    case 'os-blocked':
      if (info.os === 'mac') return `Click "Open ${n} settings" → turn on ${browserLabel(info)} under ${Cap}. If the browser asks to quit and reopen, do that, then open this link again.`;
      if (info.os === 'windows') return `Click "Open ${n} settings" → turn on "${Cap} access" and "Let desktop apps access your ${n}" → click "Try again".`;
      return `Allow ${browserLabel(info)} to use the ${n} in your computer's privacy settings, then click "Try again".`;
    case 'busy':
      return `Close other apps that may be using it — Zoom, Teams, Skype, or a meeting in another browser tab — then click "Try again".`;
    case 'missing':
      return kind === 'camera'
        ? 'Connect a webcam (or switch on the built-in one), then click "Try again".'
        : 'Connect earphones with a microphone or a headset, then click "Try again".';
    default:
      return `Click "Try again". If it keeps failing, close and reopen ${browserLabel(info)}.`;
  }
}

/** Mac / Windows privacy settings page (the browser asks "Open Settings?" first). Null elsewhere. */
export function osSettingsUrl(kind: DeviceKind, info: BrowserInfo): string | null {
  if (info.os === 'windows') return kind === 'camera' ? 'ms-settings:privacy-webcam' : 'ms-settings:privacy-microphone';
  if (info.os === 'mac') return `x-apple.systempreferences:com.apple.preference.security?Privacy_${kind === 'camera' ? 'Camera' : 'Microphone'}`;
  return null;
}
