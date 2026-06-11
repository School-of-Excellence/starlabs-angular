import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

const photoCache = new Map<string, string | null>();

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


  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);

  readonly defaultAvatar = 'https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/o/profile-image-png-14.png?alt=media&token=ce6361d2-690c-4742-bba7-dbb90e193080';

  showPreview = false;
  photoUrl: string = this.defaultAvatar;

  async ngOnInit(): Promise<void> {
    if (!this.profileId) return;

    if (photoCache.has(this.profileId)) {
      this.photoUrl = photoCache.get(this.profileId) ?? this.defaultAvatar;
      return;
    }

    await this.fetchPhoto();
  }

  ngOnChanges(changes: SimpleChanges): void {
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
  }

  openPreview(event: MouseEvent): void {
    event.stopPropagation();
    this.showPreview = true;
  }

  closePreview(): void {
    this.showPreview = false;
  }
}