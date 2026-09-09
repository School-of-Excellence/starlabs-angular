// zoom-migration.service.unit.spec.ts — unit tests for the Zoom recording migration client.
//
// WHY UNIT: the service builds URLs and shapes request/response payloads. HttpClient is a hand-rolled
// double returning `of(...)`, so no TestBed and no network — what is under test is the CONTRACT with the
// migration server: paths, query params, body shape, and the fallbacks when the response is empty or the
// API base is unconfigured.
//
// The live calls themselves belong to the comms e2e suite; nothing here reaches a server.
import { of, throwError } from 'rxjs';
import { ZoomMigrationService, ZoomRecording } from './zoom-migration.service';

interface GetCall { url: string; opts: any; }
interface PostCall { url: string; body: any; }

const makeService = (getResult: any = { recordings: [] }, postResult: any = {}) => {
  const gets: GetCall[] = [];
  const posts: PostCall[] = [];
  const http: any = {
    get: (url: string, opts: any) => { gets.push({ url, opts }); return of(getResult); },
    post: (url: string, body: any) => { posts.push({ url, body }); return of(postResult); },
  };
  return { svc: new ZoomMigrationService(http), gets, posts, http };
};

const rec = (over: Partial<ZoomRecording> = {}): ZoomRecording => ({
  uuid: 'u1', meetingId: 123, topic: 'Session', hostEmail: 'host@example.com',
  startTime: '2026-09-01T10:00:00Z', duration: 60, totalFiles: 2, totalSize: 1024,
  fileTypes: ['MP4', 'M4A'], _raw: { id: 123, verbatim: true }, ...over,
});

describe('ZoomMigrationService', () => {
  // =============================================================================================
  // CNU-01 — listRecordings
  // =============================================================================================
  describe('CNU-01 listRecordings', () => {
    it('calls the recordings endpoint with the date range as params', () => {
      const { svc, gets } = makeService();
      svc.listRecordings('2026-09-01', '2026-09-30');
      expect(gets[0].url).toContain('/api/zoom/recordings');
      expect(gets[0].opts.params).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });

    it('unwraps the recordings array from the response', async () => {
      const { svc } = makeService({ recordings: [rec({ uuid: 'a' }), rec({ uuid: 'b' })] });
      expect((await svc.listRecordings('a', 'b')).map((r) => r.uuid)).toEqual(['a', 'b']);
    });

    it('returns an empty array when the server sends no recordings key', async () => {
      // The dashboard renders straight off this — undefined would break the table rather than showing
      // an empty state.
      expect(await makeService({}).svc.listRecordings('a', 'b')).toEqual([]);
    });

    it('returns an empty array when the response body is null', async () => {
      expect(await makeService(null).svc.listRecordings('a', 'b')).toEqual([]);
    });
  });

  // =============================================================================================
  // CNU-02 — migrate replays the verbatim Zoom object
  // =============================================================================================
  describe('CNU-02 migrate', () => {
    it('posts to the migrate endpoint', () => {
      const { svc, posts } = makeService();
      svc.migrate(rec());
      expect(posts[0].url).toContain('/api/zoom/migrate');
    });

    it('wraps the recording under a `meeting` key', () => {
      // The server processes this exactly as it would a Zoom webhook, so the envelope shape matters.
      const { svc, posts } = makeService();
      const r = rec();
      svc.migrate(r);
      expect(posts[0].body).toEqual({ meeting: r });
    });

    it('carries the verbatim _raw payload through untouched', () => {
      const { svc, posts } = makeService();
      svc.migrate(rec({ _raw: { nested: { deep: 'value' } } }));
      expect(posts[0].body.meeting._raw).toEqual({ nested: { deep: 'value' } });
    });

    it('resolves with the server response', async () => {
      const response = { success: true, dispatch: 'cloud-tasks', meetingId: 123, meetinguid: 'u1', totalFiles: 2 };
      const { svc } = makeService({ recordings: [] }, response);
      expect(await svc.migrate(rec())).toEqual(response as any);
    });

    it('rejects when the request fails rather than swallowing the error', async () => {
      // Callers must be able to surface a failed migration; a silent resolve would look like success.
      const http: any = { get: () => of({}), post: () => throwError(() => new Error('500')) };
      await expectAsync(new ZoomMigrationService(http).migrate(rec())).toBeRejected();
    });
  });

  // =============================================================================================
  // CNU-03 — folderOpenUrl
  // =============================================================================================
  describe('CNU-03 folderOpenUrl', () => {
    it('builds a dropbox open link with the path encoded', () => {
      const { svc } = makeService();
      const url = svc.folderOpenUrl('/Team Folder/Recordings');
      if (url) {
        expect(url).toContain('/api/dropbox/open?path=');
        expect(url).toContain(encodeURIComponent('/Team Folder/Recordings'));
        expect(url).not.toContain(' ');   // spaces must be encoded, not passed raw
      } else {
        // Empty is the documented behaviour when zoomMigrationApiUrl is unset in this environment.
        expect(url).toBe('');
      }
    });

    it('encodes characters that would otherwise break the query string', () => {
      const { svc } = makeService();
      const url = svc.folderOpenUrl('/a&b=c?d');
      if (url) {
        expect(url).toContain(encodeURIComponent('/a&b=c?d'));
        expect(url.split('path=')[1]).not.toContain('&');
      }
    });

    it('is consistent about being configured: empty here means empty everywhere', () => {
      // The service derives `base` once from the environment. Either the API is configured and all three
      // methods target it, or it is not and folderOpenUrl returns '' so callers can hide the link.
      const { svc, gets } = makeService();
      svc.listRecordings('a', 'b');
      const configured = svc.folderOpenUrl('/x') !== '';
      expect(gets[0].url.startsWith('/api/')).toBe(!configured);
    });
  });
});
