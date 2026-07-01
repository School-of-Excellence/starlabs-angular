import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

const photoCache = new Map<string, string | null>();

@Component({
  selector: 'app-profile-picture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-picture.component.html',
  styleUrl: './profile-picture.component.css',
  // OnPush: a heavy host (e.g. the Customer Support dashboard with live Firestore
  // subscriptions) runs change detection on every mouse-move / snapshot. Without
  // OnPush this leaf re-renders on each pass, which makes the open click-to-enlarge
  // preview flicker. OnPush limits CD to this component's own state changes.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePictureComponent implements OnInit, OnDestroy {

  @Input() profileId!: string;
  @Input() name: string = '';
  @Input() size: number = 40;

  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);

  readonly defaultAvatar = 'https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/o/profile-image-png-14.png?alt=media&token=ce6361d2-690c-4742-bba7-dbb90e193080';

  photoUrl: string = this.defaultAvatar;

  // The enlarge preview is mounted on document.body (NOT in this component's view)
  // so it is fully decoupled from the host's render tree. On heavy hosts like the
  // Customer Support dashboard the avatar lives in a constantly re-rendering table;
  // rendering the overlay inside that table made it mis-position ("show at the bottom")
  // and flicker. A body-level fixed overlay is always centered and never disturbed.
  private previewEl: HTMLElement | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.profileId) return;

    if (photoCache.has(this.profileId)) {
      this.photoUrl = photoCache.get(this.profileId) ?? this.defaultAvatar;
      return;
    }

    await this.fetchPhoto();
  }

  private async fetchPhoto(): Promise<void> {
    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'profile_data'),
          where('profileid', '==', this.profileId)
        )
      );

      if (snap.empty) {
        photoCache.set(this.profileId, null);
        return;
      }

      const data = snap.docs[0].data();
      const profile = data['profile'] as string | null;
      const profileImg = data['profileimg'] as string | null;
      const resolved =
        profile && !profile.includes('profile-image-png-14')
          ? profile
          : profileImg ?? null;

      photoCache.set(this.profileId, resolved);
      this.photoUrl = resolved ?? this.defaultAvatar;
      this.cdr.detectChanges();

    } catch (err) {
      console.error('ProfilePicture fetch error:', err);
    }
  }

  onImgError(): void {
    this.photoUrl = this.defaultAvatar;
    this.cdr.markForCheck();
  }

  openPreview(event: MouseEvent): void {
    event.stopPropagation();
    this.closePreview(); // never stack two overlays

    const backdrop = document.createElement('div');
    backdrop.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const panel = document.createElement('div');
    panel.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;gap:16px;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText =
      'position:absolute;top:-16px;right:-16px;width:36px;height:36px;border:none;border-radius:50%;' +
      'background:rgba(255,255,255,0.15);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;';

    const im = document.createElement('img');
    im.crossOrigin = 'anonymous';
    im.src = this.photoUrl;
    im.alt = this.name;
    im.style.cssText = 'width:320px;height:320px;border-radius:16px;object-fit:cover;box-shadow:0 24px 60px rgba(0,0,0,0.5);';
    im.addEventListener('error', () => { im.src = this.defaultAvatar; });

    panel.appendChild(closeBtn);
    panel.appendChild(im);
    if (this.name) {
      const nameEl = document.createElement('div');
      nameEl.textContent = this.name;
      nameEl.style.cssText = 'color:#fff;font-size:18px;font-weight:600;';
      panel.appendChild(nameEl);
    }
    backdrop.appendChild(panel);

    const close = () => this.closePreview();
    backdrop.addEventListener('click', close);
    panel.addEventListener('click', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', close);

    document.body.appendChild(backdrop);
    this.previewEl = backdrop;
  }

  closePreview(): void {
    if (this.previewEl) {
      this.previewEl.remove();
      this.previewEl = null;
    }
  }

  ngOnDestroy(): void {
    this.closePreview();
  }
}