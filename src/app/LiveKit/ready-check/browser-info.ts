// Browser / OS detection for the join "Ready check" (plan 2026-11-27-join-ready-check).
// Used only to pick the right help text — never to block a browser that might work.

export type BrowserName = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';
export type OsName = 'mac' | 'windows' | 'ios' | 'android' | 'other';
export type InAppName = 'whatsapp' | 'instagram' | 'facebook' | 'linkedin' | null;

export interface BrowserInfo {
  browser: BrowserName;
  os: OsName;
  inApp: InAppName;
  mobile: boolean;
}

export function detectBrowser(ua: string = (typeof navigator !== 'undefined' ? navigator.userAgent : '')): BrowserInfo {
  const isIpadOs = typeof navigator !== 'undefined' && /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const os: OsName =
    /iPhone|iPad|iPod/.test(ua) || isIpadOs ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'mac'
    : 'other';

  const browser: BrowserName =
    /Edg\//.test(ua) ? 'edge'
    : /Firefox\/|FxiOS/.test(ua) ? 'firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'chrome'
    : /Safari\//.test(ua) ? 'safari'
    : 'other';

  const inApp: InAppName =
    /WhatsApp/i.test(ua) ? 'whatsapp'
    : /Instagram/i.test(ua) ? 'instagram'
    : /FBAN|FBAV|FB_IAB/.test(ua) ? 'facebook'
    : /LinkedInApp/i.test(ua) ? 'linkedin'
    : null;

  return { browser, os, inApp, mobile: os === 'ios' || os === 'android' };
}

/** "Always allow pop-ups" steps for the detected browser. */
export function popupHelp(b: BrowserName): string {
  switch (b) {
    case 'safari':  return 'Safari menu → Settings → Websites → Pop-up Windows → set this site to "Allow".';
    case 'chrome':  return 'Click the pop-up icon at the right end of the address bar → "Always allow pop-ups" → Done.';
    case 'edge':    return 'Click the pop-up icon at the right end of the address bar → "Always allow pop-ups" → Done.';
    case 'firefox': return 'Click "Options" in the bar under the address bar → "Allow pop-ups for this site".';
    default:        return 'Allow pop-ups for this site in your browser settings.';
  }
}
