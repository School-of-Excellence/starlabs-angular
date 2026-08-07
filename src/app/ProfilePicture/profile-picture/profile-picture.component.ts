import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

const photoCache = new Map<string, string | null>();

// Module-level singleton: only ONE enlarge overlay may exist across ALL instances.
// Each instance used to remove only its OWN previewEl, so opening a second avatar's
// preview while another was still open (or auto-opened on a re-mount) left the first
// stacked on document.body. Tracking the active overlay globally guarantees a new
// openPreview() tears down whatever is currently showing first.
let activePreview: HTMLElement | null = null;

@Component({
  selector: 'app-profile-picture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-picture.component.html',
  styleUrl: './profile-picture.component.css',
})
export class ProfilePictureComponent implements OnInit ,OnChanges{

  @Input() profileId!: string;
  @Input() name: string = '';
  @Input() size: number = 40;
  @Input() skipProfileImg: boolean = false;
  // Host-supplied image URL. When set (even ''), the component uses it directly
  // and NEVER queries profile_data — for hosts whose data source already carries
  // the photo (e.g. live-event-dashboard-v3's participant metadata map).
  @Input() src: string | null = null;
  // Opt-in: open the enlarge preview overlay automatically as soon as the photo
  // has loaded. Lets a lazy-mounted avatar (mounted only on click) go straight to
  // the enlarged image without a second click. Default false = unchanged behavior.
  @Input() autoOpen: boolean = false;
  // Fires right after an autoOpen preview is shown, so the host can drop its
  // one-shot "open this one" flag and a later re-mount won't re-open by itself.
  @Output() opened = new EventEmitter<void>();


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
    if (this.src != null) {
      this.photoUrl = this.src || this.defaultAvatar;
      if (this.autoOpen) { queueMicrotask(() => { this.openPreview(); this.opened.emit(); }); }
      return;                                  // host owns the image — no Firestore read
    }
    if (!this.profileId) return;

    if (photoCache.has(this.profileId)) {
      this.photoUrl = photoCache.get(this.profileId) ?? this.defaultAvatar;
      // Defer: this branch runs synchronously inside the host's change-detection
      // pass, so emitting (opened) — which flips the host's autoOpen binding — must
      // wait a tick to avoid ExpressionChangedAfterItHasBeenChecked in dev.
      if (this.autoOpen) { queueMicrotask(() => { this.openPreview(); this.opened.emit(); }); }
      return;
    }

    await this.fetchPhoto();   // real async gap — safe to open/emit directly below
    if (this.autoOpen) { this.openPreview(); this.opened.emit(); }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.src != null) {
      // host-supplied mode: track the src binding, never fetch
      if (changes['src'] && !changes['src'].firstChange) {
        this.photoUrl = this.src || this.defaultAvatar;
        this.cdr.markForCheck();
      }
      return;
    }
    if (changes['profileId'] && !changes['profileId'].firstChange) {
      const newId = changes['profileId'].currentValue;
      if (newId) {
        photoCache.delete(newId);
        this.photoUrl = this.defaultAvatar;
        this.fetchPhoto();
      }
    }
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
    let resolved: string | null = null;
    if (profile && !profile.includes('profile-image-png-14')) {
      resolved = profile;
    } else if (!this.skipProfileImg && profileImg) {
      resolved = profileImg;
    }

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

  openPreview(event?: MouseEvent): void {
    event?.stopPropagation();
    // Tear down whatever overlay is currently showing — from ANY instance — so a
    // new preview never stacks on a lingering one.
    if (activePreview) { activePreview.remove(); activePreview = null; }
    if (this.previewEl) { this.previewEl = null; }

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
    activePreview = backdrop;
  }

  /** Whether this instance's enlarge overlay is currently showing — lets a host
   *  with its own ESC handling peel the overlay off before its own layers. */
  get previewOpen(): boolean { return !!this.previewEl; }

  closePreview(): void {
    // Only clear the global handle if THIS instance owns the overlay currently
    // showing — otherwise destroying an old row would yank a preview another row
    // just opened. Always remove our own element (harmless if already detached).
    if (this.previewEl && this.previewEl === activePreview) {
      activePreview = null;
    }
    if (this.previewEl) {
      this.previewEl.remove();
      this.previewEl = null;
    }
  }

  ngOnDestroy(): void {
    this.closePreview();
  }
}