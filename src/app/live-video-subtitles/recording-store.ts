/**
 * Saves a live recording straight into a folder on the viewer's computer
 * while it records (Chrome / Edge: File System Access API), so an
 * interruption — a crash, a closed tab, a flat battery — keeps everything up
 * to the last few seconds.
 *
 * Each recording gets a folder of its own (`<base>/`), which ends up holding
 * the raw video, its .srt and the copy with subtitles in the picture. The
 * recorder's output is written as numbered pieces into a `<name>.parts/`
 * subfolder there (each piece a closed, complete file — a file still open
 * for writing isn't saved until it's closed). On stop the pieces are joined,
 * in order, into `<name>` (the pieces of a WebM recording simply
 * concatenate) and the subfolder is removed. Pieces left behind by an
 * interrupted recording are found and joined by {@link recover}.
 *
 * The chosen folder is remembered (IndexedDB holds the folder handle; the
 * browser may ask once per session to allow access again).
 */

const DB = 'lvs-recording-store';
const STORE = 'handles';
const KEY = 'folder';
const PARTS = '.parts';

type DirHandle = any; // FileSystemDirectoryHandle (lib.dom typings vary by TS version)

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

export class RecordingStore {
  private dir: DirHandle | null = null;
  /** This recording's own folder. */
  private recDir: DirHandle | null = null;
  private parts: DirHandle | null = null;
  private partNo = 0;
  private baseName = '';
  /** Writes run one after another, in order. */
  private queue: Promise<void> = Promise.resolve();
  /** Bytes saved so far in this recording. */
  savedBytes = 0;
  lastError = '';

  /** This browser can save straight into a folder. */
  static supported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /** Name of the chosen folder ('' before one is chosen). */
  get folderName(): string {
    return this.dir?.name ?? '';
  }

  /**
   * Make sure there's a folder we may write to: the remembered one (asking
   * the browser to allow it again if needed), or a newly picked one. Call
   * from a click. Returns false if the viewer cancels.
   */
  async ensureFolder(forcePick = false): Promise<boolean> {
    if (!forcePick) {
      const remembered = this.dir ?? (await idb<DirHandle>('readonly', (s) => s.get(KEY)).catch(() => null));
      if (remembered && (await this.allowed(remembered, true))) {
        this.dir = remembered;
        return true;
      }
    }
    try {
      const picked: DirHandle = await (window as any).showDirectoryPicker({ id: 'lvs-recordings', mode: 'readwrite' });
      this.dir = picked;
      await idb('readwrite', (s) => s.put(picked, KEY)).catch(() => undefined);
      return true;
    } catch {
      return false; // cancelled
    }
  }

  /** The remembered folder, if access is already allowed (no prompt). */
  async rememberedFolder(): Promise<string> {
    const h = this.dir ?? (await idb<DirHandle>('readonly', (s) => s.get(KEY)).catch(() => null));
    if (h && (await this.allowed(h, false))) {
      this.dir = h;
      return h.name;
    }
    return '';
  }

  private async allowed(h: DirHandle, ask: boolean): Promise<boolean> {
    try {
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
      return ask && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Start saving a recording called `name` (e.g. live-recording-….webm) in
   * a new folder `folder` inside the chosen one. Returns that folder, for
   * the files saved next to the recording.
   */
  async begin(name: string, folder: string): Promise<DirHandle> {
    if (!this.dir) throw new Error('no folder chosen');
    this.baseName = name;
    this.partNo = 0;
    this.savedBytes = 0;
    this.lastError = '';
    this.recDir = await this.dir.getDirectoryHandle(folder, { create: true });
    this.parts = await this.recDir.getDirectoryHandle(name + PARTS, { create: true });
    return this.recDir;
  }

  /** Save the next piece of the recording (closed at once, so it's kept). */
  addPart(data: Blob): void {
    const parts = this.parts;
    if (!parts || !data.size) return;
    const no = ++this.partNo;
    this.queue = this.queue.then(async () => {
      try {
        const f = await parts.getFileHandle(`part-${String(no).padStart(6, '0')}`, { create: true });
        const w = await f.createWritable();
        await w.write(data);
        await w.close();
        this.savedBytes += data.size;
      } catch (e: any) {
        this.lastError = String(e?.message ?? e);
      }
    });
  }

  /** Save a small text file (e.g. subtitles) in a recording's folder. */
  async writeText(dir: DirHandle, name: string, text: string): Promise<void> {
    this.queue = this.queue.then(async () => {
      try {
        const f = await dir.getFileHandle(name, { create: true });
        const w = await f.createWritable();
        await w.write(text);
        await w.close();
      } catch (e: any) {
        this.lastError = String(e?.message ?? e);
      }
    });
    return this.queue;
  }

  /**
   * A file in a recording's folder opened for writing (a stream that also
   * takes `{type:'write', position, data}`, for writers that seek). Nothing
   * is saved until it's closed.
   */
  async writable(dir: DirHandle, name: string): Promise<WritableStream & { abort(): Promise<void> }> {
    const f = await dir.getFileHandle(name, { create: true });
    return f.createWritable();
  }

  /** A file in a recording's folder, read from disk. */
  async file(dir: DirHandle, name: string): Promise<File> {
    return (await dir.getFileHandle(name)).getFile();
  }

  /** Remove a file from a recording's folder (e.g. a half-written one). */
  async remove(dir: DirHandle, name: string): Promise<void> {
    await dir.removeEntry(name).catch(() => undefined);
  }

  /**
   * Join the pieces into the final file, remove the pieces, and return the
   * finished recording (read back from disk, not held in memory).
   */
  async finish(): Promise<File> {
    // Taken now: a next recording may begin while this one is joined.
    const name = this.baseName;
    const dir = this.recDir;
    this.parts = null;
    await this.queue;
    if (!dir) throw new Error('no folder chosen');
    return joinParts(dir, name);
  }

  /**
   * Recordings left unfinished by an interruption (a `.parts` folder still
   * there): join each into its playable file. Returns their names.
   */
  async recover(): Promise<string[]> {
    const done: string[] = [];
    for (const { dir, name } of await this.findUnfinished()) {
      try {
        await joinParts(dir, name);
        done.push(name);
      } catch (e: any) {
        this.lastError = String(e?.message ?? e);
      }
    }
    return done;
  }

  /** Names of unfinished recordings waiting to be recovered. */
  async unfinished(): Promise<string[]> {
    return (await this.findUnfinished()).map((u) => u.name);
  }

  /**
   * `.parts` folders, in a recording's own folder or (recordings saved
   * before each had a folder) in the chosen folder itself.
   */
  private async findUnfinished(): Promise<{ dir: DirHandle; name: string }[]> {
    if (!this.dir) return [];
    const found: { dir: DirHandle; name: string }[] = [];
    const scan = async (dir: DirHandle, deeper: boolean) => {
      for await (const [entry, handle] of dir.entries()) {
        if (handle.kind !== 'directory') continue;
        if (entry.endsWith(PARTS)) found.push({ dir, name: entry.slice(0, -PARTS.length) });
        else if (deeper) await scan(handle, false);
      }
    };
    await scan(this.dir, true);
    return found;
  }
}

/** Join `<name>.parts/part-*` in order into `<name>`, then remove the parts. */
async function joinParts(dir: DirHandle, name: string): Promise<File> {
  const parts: DirHandle = await dir.getDirectoryHandle(name + PARTS);
  const files: { name: string; handle: any }[] = [];
  for await (const [entry, handle] of parts.entries()) {
    if (handle.kind === 'file' && entry.startsWith('part-')) files.push({ name: entry, handle });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const out = await dir.getFileHandle(name, { create: true });
  const w = await out.createWritable();
  for (const f of files) await w.write(await f.handle.getFile());
  await w.close();
  await dir.removeEntry(name + PARTS, { recursive: true });
  return out.getFile();
}
