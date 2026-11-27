import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { CallTabBlockedDialogComponent } from './call-tab-blocked-dialog.component';

/**
 * Opens the call page in a NEW TAB without Safari's pop-up blocker stopping it
 * (plan 2026-11-27-join-ready-check, Phase 1).
 *
 * Browsers only allow a new tab inside the click itself. The Join handlers do Firestore work
 * (create / reactivate the room) before they know the room is ready, so:
 *   1. open()  — call FIRST, synchronously in the click, before any await: opens a blank tab.
 *   2. go()    — after the room work: points that tab at /joinroom/<id>. If the browser still
 *                blocked the tab, shows a dialog with an "Open meeting" button (a fresh click).
 *   3. abort() — room work failed: closes the blank tab.
 */
@Injectable({ providedIn: 'root' })
export class CallTabService {
  constructor(private dialog: MatDialog, private router: Router) {}

  open(): Window | null {
    let win: Window | null = null;
    try { win = window.open('', '_blank'); } catch { win = null; }
    if (win) {
      try {
        win.document.title = 'Preparing your meeting…';
        win.document.body.innerHTML =
          '<p style="font:600 18px system-ui,sans-serif;text-align:center;margin-top:30vh;color:#374151">Preparing your meeting…</p>';
      } catch { /* cross-origin or closed — the redirect in go() still works */ }
    }
    return win;
  }

  go(win: Window | null, roomId: string): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/joinroom', roomId]));
    if (win && !win.closed) {
      win.location.href = url;
      try { win.focus(); } catch { /* ignore */ }
      return;
    }
    this.dialog.open(CallTabBlockedDialogComponent, { data: { url }, maxWidth: '92vw' });
  }

  abort(win: Window | null): void {
    try { win?.close(); } catch { /* ignore */ }
  }
}
