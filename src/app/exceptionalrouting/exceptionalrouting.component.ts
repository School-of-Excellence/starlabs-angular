import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-exceptionalrouting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exceptionalrouting.component.html',
  styleUrls: ['./exceptionalrouting.component.css']
})
export class ExceptionalroutingComponent implements OnInit {

  constructor(private router: Router) {}

  messageTitle = '';
  messageSubtitle = '';
  deeplinkPath: string = '';
  mode: 'app' | 'invalid' = 'invalid';

  mobileRoutes: string[] = [
    '/generalcontent/',
    '/eiflix/',
    '/tv-auth',
    '/home',
    '/content/',
    '/calendar',
    '/recommended/'
  ];

  ngOnInit(): void {
    const path = window.location.pathname;

    console.log('Incoming URL:', path);

    if (this.isMobileDeepLink(path)) {
      this.mode = 'app';
      this.deeplinkPath = path;
      return;
    }

    this.mode = 'invalid';
    this.messageTitle = 'Invalid URL';
    this.messageSubtitle = 'Redirecting to homepage...';

    setTimeout(() => {
      this.router.navigateByUrl('/EISDashboard', { replaceUrl: true });
    }, 1500);
  }

  isMobileDeepLink(path: string): boolean {
    return this.mobileRoutes.some(route => path.startsWith(route));
  }

  openApp(): void {
    const appUrl = `breakthroughs://${this.deeplinkPath}`;
    window.location.href = appUrl;
  }

  goToAndroid(): void {
    window.location.href =
      'https://play.google.com/store/apps/details?id=com.soe.launchyourlegacy';
  }

  goToIOS(): void {
    window.location.href =
      'https://apps.apple.com/in/app/breakthroughs/id1450187620';
  }
}
