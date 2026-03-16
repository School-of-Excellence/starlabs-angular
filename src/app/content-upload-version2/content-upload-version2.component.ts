import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, query, orderBy, limit } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';

interface ScreenUpdate {
  key: string;
  title: string;
  route: string;
  lastUpdated?: Date;
  lastItemTitle?: string;
}

@Component({
  selector: 'app-content-upload-version2',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './content-upload-version2.component.html',
  styleUrl: './content-upload-version2.component.css'
})
export class ContentUploadVersion2Component {

  private fs = inject(Firestore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  solarExpanded = false;
  eiflixExpanded = false;
  screens: ScreenUpdate[] = [
    { key: 'solar',    title: 'Solar Voice',           route: 'audiodashboard' },
    { key: 'episodes', title: 'EiFlix',                route: 'videodashboard' },
    { key: 'ads',      title: 'Ads',                   route: 'ads' },
    { key: 'health',   title: 'Medical Breakthroughs', route: 'healthstories' },
    { key: 'home',     title: 'Home Content',          route: 'contentupload' }
  ];

  private iconMap: Record<string, string> = {
    solar: '♬',
    episodes: '▶',
    ads: '◎',
    health: '✚',
    home: '⬡'
  };

  ngOnInit() {
    this.solarExpanded = this.isAnyChildActive([
      'audiodashboard',
      'playlistdashboard'
    ]);

    this.eiflixExpanded = this.isAnyChildActive([
      'videodashboard',
      'assigncategory',
      'seriesdashboard'
    ]);

    this.loadAll();
  }

  get isHome(): boolean {
    return this.router.url === '/content-upload-v2';
  }

  getIcon(key: string): string {
    return this.iconMap[key] ?? '◈';
  }

  async loadAll() {
    await Promise.all([
      this.loadLast('solar', 'solar voice audios', 'date'),
      this.loadLast('episodes', 'episodes', 'date'),
      this.loadLast('ads', 'ads', 'startdate'),
      this.loadLast('health', 'health stories', 'date'),
      this.loadLast('home', 'content_urls', 'added')
    ]);
  }

  private async loadLast(
    key: string,
    collectionName: string,
    field: string
  ) {
    const ref = collection(this.fs, collectionName);
    const q = query(ref, orderBy(field, 'desc'), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const doc = snap.docs[0];
      const val = doc.get(field);
      const screen = this.screens.find(s => s.key === key);

      if (screen) {
        screen.lastUpdated = this.toDate(val);
        screen.lastItemTitle =
          doc.get('title') ??
          doc.get('name') ??
          doc.get('subject') ??
          undefined;
      }
    }
  }
  isAnyChildActive(routes: string[]): boolean {
    return routes.some(r =>
      this.router.isActive(
        this.router.createUrlTree(
          ['/content-upload-v2', r]
        ),
        {
          paths: 'subset',
          queryParams: 'ignored',
          fragment: 'ignored',
          matrixParams: 'ignored'
        }
      )
    );
  }

  private toDate(v: any): Date | undefined {
    if (!v) return undefined;
    if (typeof v.toDate === 'function') {
      return v.toDate();
    }
    return new Date(v);
  }

  openScreen(s: ScreenUpdate) {
    this.router.navigate([s.route]);
    // this.router.navigate([s.route], { relativeTo: this.route });
  }

  toggleSolar(e: Event) {
    e.preventDefault();
    this.solarExpanded = !this.solarExpanded;
  }

  toggleEiflix(e: Event) {
    e.preventDefault();
    this.eiflixExpanded = !this.eiflixExpanded;
  }
  daysAgoInfo(d?: Date): { value: string; label: string } | null {
    if (!d) return null;

    const now = Date.now();
    const then = new Date(d).getTime();
    const diff = Math.floor((now - then) / (1000 * 60 * 60 * 24));

    if (diff <= 0) {
      return { value: 'Today', label: '' };
    }
    if (diff === 1) {
      return { value: '1', label: 'day ago' };
    }
    return { value: String(diff), label: 'days ago' };
  }
}