// import { Component, OnInit, HostListener } from '@angular/core';
// import { ActivatedRoute } from '@angular/router';

// @Component({
//   selector: 'app-tv-auth',
//   standalone: true,
//   template: `
//     <div class="debug-wrapper">
//       <h2>📺 TV Auth Debug</h2>

//       <div class="meta">
//         <p><b>Session ID:</b> {{ sessionId || 'N/A' }}</p>
//         <p><b>Platform:</b> {{ platform }}</p>
//       </div>

//       <div class="logs">
//         @for (log of logs; track $index) {
//           <div class="log" [class.warn]="log.type === 'warn'">
//             <span class="time">[{{ log.time }}]</span>
//             <span>{{ log.message }}</span>
//           </div>
//         }
//       </div>
//     </div>
//   `,
//   styles: [`
//     .debug-wrapper {
//       padding: 16px;
//       font-family: monospace;
//       background: #0f172a;
//       color: #e5e7eb;
//       height: 100vh;
//     }
//     h2 {
//       margin-bottom: 6px;
//     }
//     .meta p {
//       margin: 2px 0;
//       color: #93c5fd;
//       font-size: 14px;
//     }
//     .logs {
//       margin-top: 10px;
//       background: #020617;
//       border-radius: 6px;
//       padding: 10px;
//       max-height: 75vh;
//       overflow-y: auto;
//     }
//     .log {
//       font-size: 13px;
//       margin-bottom: 4px;
//     }
//     .warn {
//       color: #fca5a5;
//     }
//     .time {
//       color: #94a3b8;
//       margin-right: 6px;
//     }
//   `]
// })
// export class TvAuthComponent implements OnInit {

//   sessionId = '';
//   platform = 'UNKNOWN';

//   logs: { time: string; message: string; type: 'info' | 'warn' }[] = [];

//   private pageHidden = false;

//   private isAndroid = /Android/i.test(navigator.userAgent);
//   private isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);

//   constructor(private route: ActivatedRoute) {}


//   ngOnInit() {
//     this.log('Component initialized');
//     this.log(`UserAgent: ${navigator.userAgent}`);

//     this.sessionId = this.route.snapshot.queryParams['session_id'];
//     this.log(`Session ID detected: ${this.sessionId || 'NONE'}`);

//     if (this.isAndroid) this.platform = 'ANDROID';
//     else if (this.isIOS) this.platform = 'IOS';

//     this.log(`Platform resolved: ${this.platform}`);

//     if (!this.isAndroid && !this.isIOS) {
//       this.log('Desktop browser detected – deep linking not supported', 'warn');
//       this.log('Open this URL on your mobile phone', 'warn');
//       return;
//     }

//     this.handleRedirect();
//   }


//   @HostListener('document:visibilitychange')
//   onVisibilityChange() {
//     if (document.hidden) {
//       this.pageHidden = true;
//       this.log('Page hidden → app likely opened');
//     }
//   }

//   @HostListener('window:pagehide')
//   onPageHide() {
//     this.pageHidden = true;
//     this.log('Pagehide event fired → app likely opened');
//   }


//   private handleRedirect() {
//     const appLink = this.isAndroid
//       // ❗ NO package= → prevents auto Play Store redirect
//       ? `intent://tv-auth?session_id=${this.sessionId}#Intent;scheme=breakthroughs.app;end`
//       : `breakthroughs.app://tv-auth?session_id=${this.sessionId}`;

//     const storeUrl = this.isAndroid
//       ? 'https://play.google.com/store/apps/details?id=com.soe.launchyourlegacy'
//       : 'https://apps.apple.com/in/app/breakthroughs/id1450187620';

//     this.log(`Deep link created: ${appLink}`);
//     this.openApp(appLink, storeUrl);
//   }

//   private openApp(appUrl: string, storeUrl: string) {
//     const start = Date.now();
//     const delay = 3500;

//     this.log('Attempting to open app...');
//     window.location.href = appUrl;

//     setTimeout(() => {
//       const elapsed = Date.now() - start;
//       this.log(`Timer fired after ${elapsed}ms`);

//       if (!this.pageHidden) {
//         this.log('App NOT detected', 'warn');

//         const confirmRedirect = confirm(
//           'App not detected.\n\nDo you want to open the App Store?'
//         );

//         if (confirmRedirect) {
//           this.log('User confirmed store redirect');
//           window.location.href = storeUrl;
//         } else {
//           this.log('User cancelled store redirect');
//         }
//       } else {
//         this.log('App opened successfully');
//       }
//     }, delay);
//   }


//   private log(message: string, type: 'info' | 'warn' = 'info') {
//     this.logs.push({
//       time: new Date().toLocaleTimeString(),
//       message,
//       type
//     });
//   }
// }

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  template: ''
})
export class TvAuthComponent implements OnInit {
  private sessionId: string = '';
  private isAndroid = /Android/i.test(navigator.userAgent);
  private isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);

  constructor(
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.sessionId = this.route.snapshot.queryParams['session_id'];
    this.handleRedirect();
  }

  private handleRedirect() {
    // const appLink = `breakthroughs.app://tv-auth?session_id=${this.sessionId}`;
    const appLink = `https://breakthroughs.app/tv-auth?session_id=${this.sessionId}`;
    // const appLink = `breakthroughs.app://tv-auth/${this.sessionId}`;
    const playStore = 'https://play.google.com/store/apps/details?id=com.soe.launchyourlegacy';
    const appStore = 'https://apps.apple.com/in/app/breakthroughs/id1450187620';

    if (this.isAndroid) {
      this.openApp(appLink, playStore);
    } else if (this.isIOS) {
      this.openApp(appLink, appStore);
    } else {
      alert('Please open this link on your mobile device.');
    }
  }

  private openApp(appUrl: string, storeUrl: string) {
    const start = Date.now();
    const delay = 1500;
    window.location.href = appUrl;
    setTimeout(() => {
      const now = Date.now();
      if (now - start < delay + 500) {
        window.location.href = storeUrl;
      }
    }, delay);
  }
}