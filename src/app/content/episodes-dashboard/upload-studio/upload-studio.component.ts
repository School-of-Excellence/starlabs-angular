import { Component, ElementRef, HostListener, NgZone, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { collection, collectionSnapshots, doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { deleteObject, getDownloadURL, ref, Storage, UploadTask, uploadBytesResumable } from '@angular/fire/storage';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';

type JobState = 'ready' | 'queued' | 'uploading' | 'paused' | 'finalizing' | 'complete' | 'failed';
type FileKind = 'video' | 'image' | 'screenshot' | 'srt';

const MAX_PARALLEL_JOBS = 3;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024 * 1024;
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

interface JobFile {
  kind: FileKind;
  file: File;
  task: UploadTask | null;
  bytesDone: number;
  url: string | null;
}

export class UploadJob {
  id: string;
  // metadata — maps 1:1 onto the existing episodes document fields, nothing new
  title = '';
  reftitle = '';
  description = '';
  duration: string | null = null;
  tags: string[] = [];

  files: JobFile[] = [];
  state: JobState = 'ready';
  errorMsg = '';

  // edit mode: sourceDoc holds the loaded episode document; unreplaced values
  // are carried over from it on save
  editMode = false;
  sourceDoc: any = null;
  srtRemoved = false;
  date: Date | null = null;

  videoPreviewUrl = '';
  videoPreviewSafe: SafeUrl | null = null;
  imagePreviewUrl: string | ArrayBuffer | null = null;
  screenshotPreviewUrl: string | ArrayBuffer | null = null;

  // telemetry
  bytesTotal = 0;
  bytesDone = 0;
  speedEma = 0;
  etaSec: number | null = null;
  private lastBytesDone = 0;

  tagSearch = '';
  showTags = false;

  constructor(id: string) { this.id = id; }

  fileOf(kind: FileKind): JobFile | undefined { return this.files.find(f => f.kind === kind); }
  get videoFile(): JobFile | undefined { return this.fileOf('video'); }
  hasMedia(kind: FileKind): boolean {
    if (this.fileOf(kind)) return true;
    if (kind === 'srt' && this.srtRemoved) return false;
    const key = kind === 'video' ? 'videoUrl' : kind === 'image' ? 'imageUrl' : kind;
    return !!this.sourceDoc?.[key];
  }
  get isMetadataOnlyEdit(): boolean { return this.editMode && this.files.length === 0; }
  get pct(): number {
    if (this.state === 'complete') return 100;
    return this.bytesTotal ? Math.min(100, this.bytesDone / this.bytesTotal * 100) : 0;
  }
  get active(): boolean { return this.state === 'uploading' || this.state === 'finalizing'; }
  get pending(): boolean { return ['queued', 'uploading', 'paused', 'finalizing'].includes(this.state); }

  sampleSpeed(dtSec: number): void {
    this.bytesDone = this.files.reduce((s, f) => s + (f.url ? f.file.size : f.bytesDone), 0);
    const inst = Math.max(0, this.bytesDone - this.lastBytesDone) / dtSec;
    this.lastBytesDone = this.bytesDone;
    if (this.state === 'uploading') {
      this.speedEma = this.speedEma ? this.speedEma * 0.7 + inst * 0.3 : inst;
      this.etaSec = this.speedEma > 1 ? (this.bytesTotal - this.bytesDone) / this.speedEma : null;
    } else {
      this.speedEma = 0;
      this.etaSec = null;
    }
  }
}

@Component({
  selector: 'app-upload-studio',
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './upload-studio.component.html',
  styleUrls: ['./upload-studio.component.css']
})
export class UploadStudioComponent {
  @ViewChild('spark') sparkRef: ElementRef<HTMLCanvasElement> | undefined;
  @ViewChild('videoPicker') videoPicker: ElementRef<HTMLInputElement>;

  jobs: UploadJob[] = [];
  started = false;
  pausedAll = false;
  dragOver = false;

  taxonomyList: any[] = [];
  mapTaxonomy: { [key: string]: string } = {};

  // aggregate telemetry
  aggSpeed = 0;
  aggEtaSec: number | null = null;
  aggPct = 0;
  aggDone = 0;
  aggTotal = 0;
  private sparkData: number[] = [];
  private tickHandle: any = null;
  private destroyed$ = new Subject<void>();

  readonly ringCircumference = 2 * Math.PI * 29;

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private router: Router,
    private route: ActivatedRoute,
    private zone: NgZone,
    private snackbar: MatSnackBar,
    private sanitizer: DomSanitizer,
  ) {
    const taxonomyRef = collection(this.firestore, 'atc taxonomy');
    collectionSnapshots(taxonomyRef).pipe(takeUntil(this.destroyed$)).subscribe(snapshot => {
      this.taxonomyList = snapshot.map(d => ({ id: d.id, ...d.data() }));
      this.taxonomyList.forEach(t => this.mapTaxonomy[t.id] = t['name']);
    });
    this.tickHandle = setInterval(() => this.zone.run(() => this.tick()), 500);

    const editId = this.route.snapshot.queryParamMap.get('edit');
    if (editId) this.loadForEdit(editId);
  }

  private async loadForEdit(id: string): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, `episodes/${id}`));
      if (!snap.exists()) {
        this.zone.run(() => this.snackbar.open('Episode not found — it may have been deleted.', 'Close', { duration: 4000 }));
        return;
      }
      const data: any = snap.data();
      this.zone.run(() => {
        const job = new UploadJob(id);
        job.editMode = true;
        job.sourceDoc = data;
        job.title = data.title ?? '';
        job.reftitle = data.reftitle ?? '';
        job.description = data.description ?? '';
        job.duration = data.duration ?? null;
        job.tags = Array.isArray(data.tags) ? [...data.tags] : [];
        job.date = data.date?.toDate ? data.date.toDate() : (data.date ?? null);
        this.jobs.push(job);
      });
    } catch (err) {
      console.error('Error loading episode for edit', err);
      this.zone.run(() => this.snackbar.open('Could not load the episode for editing.', 'Close', { duration: 4000 }));
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.tickHandle);
    this.destroyed$.next();
    this.destroyed$.complete();
    this.jobs.forEach(j => j.files.forEach(f => f.task?.cancel()));
  }

  /* ---------------- intake ---------------- */

  hasActiveUploads(): boolean {
    return this.jobs.some(j => j.pending);
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasActiveUploads()) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  @HostListener('window:dragover', ['$event'])
  onWindowDragOver(event: DragEvent): void { event.preventDefault(); }

  @HostListener('window:drop', ['$event'])
  onWindowDrop(event: DragEvent): void { event.preventDefault(); }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    if (event.dataTransfer?.files?.length) this.addVideos(event.dataTransfer.files);
  }

  onVideoPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.addVideos(input.files);
    input.value = '';
  }

  addVideos(list: FileList): void {
    Array.from(list).forEach(file => {
      if (!file.type.startsWith('video/') && !/\.(mp4|mov|mkv|avi|webm)$/i.test(file.name)) {
        this.snackbar.open(`"${file.name}" skipped — not a video file.`, 'Close', { duration: 4000 });
        return;
      }
      if (file.size >= MAX_VIDEO_BYTES) {
        this.snackbar.open(`"${file.name}" skipped — over the 15 GB limit.`, 'Close', { duration: 5000 });
        return;
      }
      const job = new UploadJob(doc(collection(this.firestore, 'episodes')).id);
      job.files.push({ kind: 'video', file, task: null, bytesDone: 0, url: null });
      job.title = this.titleFromFilename(file.name);
      job.videoPreviewUrl = URL.createObjectURL(file);
      // blob: URLs fail Angular's URL sanitizer on <video [src]> — trust it once here
      job.videoPreviewSafe = this.sanitizer.bypassSecurityTrustUrl(job.videoPreviewUrl);
      this.detectDuration(job);
      this.jobs.push(job);
      // arriving while a batch is running: join the queue automatically
      if (this.started) { job.state = 'queued'; this.fillSlots(); }
    });
  }

  private titleFromFilename(name: string): string {
    return name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private detectDuration(job: UploadJob): void {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = job.videoPreviewUrl;
    video.onloadedmetadata = () => this.zone.run(() => {
      const total = video.duration;
      if (isFinite(total)) {
        const m = Math.floor(total / 60);
        const s = Math.floor(total % 60);
        job.duration = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
    });
  }

  addSidecar(job: UploadJob, kind: Exclude<FileKind, 'video'>, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (job.state === 'finalizing' || job.state === 'complete') return;
    const existing = job.fileOf(kind);
    if (existing?.task) return; // already uploading — locked
    if (existing) job.files = job.files.filter(f => f !== existing);
    job.files.push({ kind, file, task: null, bytesDone: 0, url: null });
    if (kind === 'image' || kind === 'screenshot') {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = e => this.zone.run(() => {
        if (kind === 'image') job.imagePreviewUrl = e.target?.result ?? null;
        else job.screenshotPreviewUrl = e.target?.result ?? null;
      });
    }
    // late-added sidecar while its job already uploads: start it immediately
    if (job.state === 'uploading') this.startFile(job, job.fileOf(kind)!);
  }

  removeSidecar(job: UploadJob, kind: Exclude<FileKind, 'video'>): void {
    const f = job.fileOf(kind);
    if (f?.task) return;
    if (f) {
      job.files = job.files.filter(x => x !== f);
      if (kind === 'image') job.imagePreviewUrl = null;
      if (kind === 'screenshot') job.screenshotPreviewUrl = null;
    } else if (kind === 'srt' && job.editMode && job.sourceDoc?.srt) {
      // no staged file: removing the episode's existing subtitle
      job.srtRemoved = true;
    }
  }

  replaceVideo(job: UploadJob, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || job.state === 'finalizing' || job.state === 'complete') return;
    if (file.size >= MAX_VIDEO_BYTES) {
      this.snackbar.open(`"${file.name}" skipped — over the 15 GB limit.`, 'Close', { duration: 5000 });
      return;
    }
    const existing = job.fileOf('video');
    if (existing?.task) return;
    if (existing) job.files = job.files.filter(f => f !== existing);
    job.files.push({ kind: 'video', file, task: null, bytesDone: 0, url: null });
    if (job.videoPreviewUrl) URL.revokeObjectURL(job.videoPreviewUrl);
    job.videoPreviewUrl = URL.createObjectURL(file);
    job.videoPreviewSafe = this.sanitizer.bypassSecurityTrustUrl(job.videoPreviewUrl);
    this.detectDuration(job);
    if (job.state === 'uploading') this.startFile(job, job.fileOf('video')!);
  }

  removeJob(job: UploadJob): void {
    if (job.pending && !confirm(`Cancel the upload of "${job.title || 'this episode'}"?`)) return;
    job.files.forEach(f => f.task?.cancel());
    if (job.videoPreviewUrl) URL.revokeObjectURL(job.videoPreviewUrl);
    this.jobs = this.jobs.filter(j => j !== job);
    this.fillSlots();
  }

  /* ---------------- tags ---------------- */

  filteredTaxonomy(job: UploadJob): any[] {
    const q = job.tagSearch.trim().toLowerCase();
    return this.taxonomyList
      .filter(t => !job.tags.includes(t.id))
      .filter(t => !q || (t['name'] ?? '').toLowerCase().indexOf(q) === 0)
      .slice(0, 12);
  }

  addTag(job: UploadJob, tagId: string): void {
    if (!job.tags.includes(tagId)) job.tags = [...job.tags, tagId];
    job.tagSearch = '';
  }

  removeTag(job: UploadJob, index: number): void {
    if (job.state === 'complete') return;
    job.tags = job.tags.filter((_, i) => i !== index);
  }

  /* ---------------- engine ---------------- */

  get startableJobs(): UploadJob[] {
    return this.jobs.filter(j => j.state === 'ready');
  }

  get invalidJobs(): UploadJob[] {
    return this.startableJobs.filter(j => !j.title.trim());
  }

  startAll(): void {
    if (this.invalidJobs.length) {
      this.snackbar.open(`${this.invalidJobs.length} episode(s) need a title before uploading.`, 'Close', { duration: 4000 });
      return;
    }
    if (!this.startableJobs.length) return;
    this.started = true;
    this.pausedAll = false;
    this.startableJobs.forEach(j => j.state = 'queued');
    this.fillSlots();
  }

  private activeJobCount(): number {
    return this.jobs.filter(j => j.active).length;
  }

  private fillSlots(): void {
    if (this.pausedAll) return;
    for (const job of this.jobs) {
      if (this.activeJobCount() >= MAX_PARALLEL_JOBS) break;
      if (job.state === 'queued') this.startJob(job);
    }
  }

  private startJob(job: UploadJob): void {
    job.state = 'uploading';
    job.errorMsg = '';
    job.bytesTotal = job.files.reduce((s, f) => s + f.file.size, 0);
    const pending = job.files.filter(f => !f.url);
    if (!pending.length) {
      // metadata-only edit — nothing to upload, save straight away
      job.state = 'finalizing';
      this.saveEpisode(job);
      return;
    }
    pending.forEach(f => this.startFile(job, f));
  }

  private storagePath(kind: FileKind, file: File): string {
    const folder = kind === 'video' ? 'eiflix_episodes' : kind === 'srt' ? 'eiflix_srt' : 'eiflix_images';
    return `${folder}/${Date.now()}_${file.name}`;
  }

  private startFile(job: UploadJob, jobFile: JobFile): void {
    job.bytesTotal = job.files.reduce((s, f) => s + f.file.size, 0);
    const reference = ref(this.storage, this.storagePath(jobFile.kind, jobFile.file));
    const task = uploadBytesResumable(reference, jobFile.file);
    jobFile.task = task;
    jobFile.bytesDone = 0;
    task.on('state_changed',
      snap => this.zone.run(() => { jobFile.bytesDone = snap.bytesTransferred; }),
      error => this.zone.run(() => {
        jobFile.task = null;
        if ((error as any)?.code === 'storage/canceled') return;
        job.state = 'failed';
        job.errorMsg = `"${jobFile.file.name}" failed (${(error as any)?.code ?? 'network error'}). Other uploads keep running.`;
        // release remaining tasks of this job so a retry restarts cleanly
        job.files.forEach(f => { if (!f.url) { f.task?.cancel(); f.task = null; } });
        this.fillSlots();
      }),
      () => this.zone.run(async () => {
        try {
          jobFile.url = await getDownloadURL(task.snapshot.ref);
          jobFile.bytesDone = jobFile.file.size;
          this.checkJobUploaded(job);
        } catch (err) {
          job.state = 'failed';
          job.errorMsg = `Could not finalize "${jobFile.file.name}".`;
        }
      })
    );
  }

  private checkJobUploaded(job: UploadJob): void {
    if (job.state !== 'uploading') return;
    if (job.files.some(f => !f.url)) return;
    job.state = 'finalizing';
    this.saveEpisode(job);
  }

  private async saveEpisode(job: UploadJob): Promise<void> {
    const src = job.sourceDoc ?? {};
    const video = job.fileOf('video');
    const image = job.fileOf('image');
    // exact same document shape as the legacy upload dialog — no new fields;
    // in edit mode, unreplaced values carry over from the loaded document
    const episodeData = {
      id: job.id,
      title: job.title.trim() || null,
      reftitle: job.reftitle.trim() || null,
      videoUrl: video?.url ?? src.videoUrl ?? null,
      imageUrl: image?.url ?? src.imageUrl ?? null,
      imagesize: image ? image.file.size : (src.imagesize ?? null),
      videoSizeBytes: video ? video.file.size : (src.videoSizeBytes ?? null),
      videoSize: video ? `${(video.file.size / MB).toFixed(2)} MB` : (src.videoSize ?? null),
      srt: job.fileOf('srt')?.url ?? (job.srtRemoved ? null : (src.srt ?? null)),
      screenshot: job.fileOf('screenshot')?.url ?? src.screenshot ?? null,
      description: job.description.trim() || null,
      date: job.date ?? new Date(),
      tags: job.tags,
      duration: job.duration || null,
    };
    try {
      await setDoc(doc(this.firestore, `episodes/${job.id}`), episodeData, { merge: true });
      await this.cleanupReplaced(job);
      this.zone.run(() => {
        job.state = 'complete';
        this.snackbar.open(job.editMode
          ? `"${job.title}" updated.`
          : `"${job.title}" uploaded and saved to the library.`, 'Close', { duration: 3500 });
        this.fillSlots();
      });
    } catch (err) {
      console.error('Error saving episode', err);
      this.zone.run(() => {
        job.state = 'failed';
        job.errorMsg = 'Files uploaded but saving the episode failed. Retry to save again.';
      });
    }
  }

  // after a successful edit save, drop the Storage objects that were replaced or removed
  private async cleanupReplaced(job: UploadJob): Promise<void> {
    const src = job.sourceDoc;
    if (!src) return;
    const olds: string[] = [];
    if (job.fileOf('video')?.url && src.videoUrl) olds.push(src.videoUrl);
    if (job.fileOf('image')?.url && src.imageUrl) olds.push(src.imageUrl);
    if (job.fileOf('screenshot')?.url && src.screenshot) olds.push(src.screenshot);
    if ((job.fileOf('srt')?.url || job.srtRemoved) && src.srt) olds.push(src.srt);
    for (const url of olds) {
      try {
        await deleteObject(ref(this.storage, url));
      } catch (err) {
        console.warn('Could not delete replaced file:', url, err);
      }
    }
  }

  retryJob(job: UploadJob): void {
    if (job.state !== 'failed') return;
    if (job.files.every(f => f.url)) {
      // uploads finished, only the Firestore save failed
      job.state = 'finalizing';
      this.saveEpisode(job);
      return;
    }
    job.state = this.activeJobCount() < MAX_PARALLEL_JOBS && !this.pausedAll ? 'uploading' : 'queued';
    if (job.state === 'uploading') this.startJob(job);
  }

  togglePauseJob(job: UploadJob): void {
    if (job.state === 'uploading') {
      job.files.forEach(f => f.task?.pause());
      job.state = 'paused';
      this.fillSlots();
    } else if (job.state === 'paused') {
      job.files.forEach(f => f.task?.resume());
      job.state = 'uploading';
    }
  }

  togglePauseAll(): void {
    this.pausedAll = !this.pausedAll;
    this.jobs.forEach(job => {
      if (this.pausedAll && job.state === 'uploading') {
        job.files.forEach(f => f.task?.pause());
        job.state = 'paused';
      } else if (!this.pausedAll && job.state === 'paused') {
        job.files.forEach(f => f.task?.resume());
        job.state = 'uploading';
      }
    });
    if (!this.pausedAll) this.fillSlots();
  }

  abortAll(): void {
    this.jobs.forEach(job => {
      if (job.pending) {
        job.files.forEach(f => f.task?.cancel());
        job.state = 'failed';
        job.errorMsg = 'Aborted.';
      }
    });
  }

  /* ---------------- telemetry ---------------- */

  private tick(): void {
    const dt = 0.5;
    this.jobs.forEach(j => j.sampleSpeed(dt));

    const batch = this.jobs.filter(j => j.pending || j.state === 'complete' || j.state === 'failed');
    this.aggTotal = batch.reduce((s, j) => s + (j.bytesTotal || j.files.reduce((x, f) => x + f.file.size, 0)), 0);
    this.aggDone = batch.reduce((s, j) => s + j.bytesDone, 0);
    this.aggPct = this.aggTotal ? Math.min(100, this.aggDone / this.aggTotal * 100) : 0;
    if (this.allDone) this.aggPct = 100;
    this.aggSpeed = this.jobs.filter(j => j.state === 'uploading').reduce((s, j) => s + j.speedEma, 0);
    const remaining = this.jobs.filter(j => j.pending).reduce((s, j) => s + (j.bytesTotal - j.bytesDone), 0);
    this.aggEtaSec = this.aggSpeed > 1 && remaining > 0 ? remaining / this.aggSpeed : null;

    if (this.hasActiveUploads() || this.sparkData.length) {
      this.sparkData.push(this.aggSpeed);
      if (this.sparkData.length > 72) this.sparkData.shift();
      this.drawSpark();
    }
  }

  private drawSpark(): void {
    const canvas = this.sparkRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.sparkData.length < 2) return;
    const max = Math.max(...this.sparkData) * 1.25 || 1;
    ctx.beginPath();
    this.sparkData.forEach((v, i) => {
      const x = i / 71 * W;
      const y = H - (v / max) * (H * 0.9) - 2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = '#5a6acf';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(90,106,207,.25)');
    grad.addColorStop(1, 'rgba(90,106,207,0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  /* ---------------- view helpers ---------------- */

  get isEditSession(): boolean { return this.jobs.length > 0 && this.jobs.every(j => j.editMode); }

  get startLabel(): string {
    const n = this.startableJobs.length;
    const allMeta = this.startableJobs.every(j => j.isMetadataOnlyEdit);
    return allMeta ? `Save change${n > 1 ? 's' : ''} (${n})` : `Start upload${n > 1 ? 's' : ''} (${n})`;
  }

  get uploadingCount(): number { return this.jobs.filter(j => j.state === 'uploading').length; }
  get queuedCount(): number { return this.jobs.filter(j => j.state === 'queued').length; }
  get completeCount(): number { return this.jobs.filter(j => j.state === 'complete').length; }
  get failedCount(): number { return this.jobs.filter(j => j.state === 'failed').length; }
  get allDone(): boolean { return this.started && this.jobs.length > 0 && this.jobs.every(j => j.state === 'complete'); }
  get ringOffset(): number { return this.ringCircumference * (1 - this.aggPct / 100); }

  stateLabel(job: UploadJob): string {
    switch (job.state) {
      case 'ready': return 'Ready';
      case 'queued': return 'Queued';
      case 'uploading': return 'Uploading';
      case 'paused': return 'Paused';
      case 'finalizing': return 'Finalizing';
      case 'complete': return 'Complete';
      case 'failed': return 'Failed';
    }
  }

  fmtBytes(bytes: number | null | undefined): string {
    if (!bytes) return bytes === 0 ? '0 MB' : '—';
    if (bytes >= GB) return (bytes / GB).toFixed(2) + ' GB';
    if (bytes >= MB) return (bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  fmtSpeed(bps: number): string {
    return bps >= 1 ? (bps / MB).toFixed(1) : '0.0';
  }

  fmtEta(sec: number | null): string {
    if (sec === null || !isFinite(sec)) return '—';
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
    return `${Math.max(1, Math.round(sec))}s`;
  }

  trackJob = (_: number, job: UploadJob) => job.id;

  goBack(): void {
    const base = this.router.url.startsWith('/content-upload-v2') ? '/content-upload-v2/videodashboard' : '/videodashboard';
    this.router.navigate([base]);
  }
}
