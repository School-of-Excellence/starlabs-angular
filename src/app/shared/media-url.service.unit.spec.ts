// media-url.service.unit.spec.ts — unit tests for the signed-URL resolver's REQUEST ECONOMY.
//
// WHY UNIT: the behaviour that matters here is not "does a URL come back" (that needs the deployed
// callable) but "how many network calls does a page of media cost". That is pure client logic —
// batching, in-flight dedupe, the cache, and the passthrough branch — so it is tested against a
// stubbed callable that COUNTS invocations. No Firebase, no network, no credentials.
//
// WHAT IT PROTECTS: a table of 20 media rows must cost ONE request, not 20. A re-render must cost
// zero. A legacy download URL must cost zero. Those three properties are the whole reason the
// service exists rather than each component calling the callable itself.
import { MediaUrlService } from './media-url.service';

/**
 * Build a service with its callable replaced by a counting stub. The real class reads
 * `inject(FirebaseApp)` in a field initialiser, so it is constructed through
 * Object.create to stay out of Angular's injection context — these tests never touch
 * Firebase.
 */
function makeService(opts: { fail?: boolean; omit?: string[] } = {}) {
  const svc: MediaUrlService = Object.create(MediaUrlService.prototype);

  // private state the constructor would normally set up
  (svc as any).cache = new Map();
  (svc as any).waiting = new Map();
  (svc as any).queue = new Set();
  (svc as any).flushTimer = null;
  (svc as any).stats = { passthrough: 0, signed: 0, cacheHits: 0, failed: 0, calls: 0 };

  const invocations: string[][] = [];
  (svc as any).call = async ({ refs }: { refs: string[] }) => {
    invocations.push([...refs]);
    if (opts.fail) throw new Error('stub failure');
    const expiresAt = Date.now() + 15 * 60_000;
    return {
      data: {
        expiresAt,
        results: refs
          .filter(r => !(opts.omit ?? []).includes(r))
          .map(r => ({ ref: r, url: `https://signed.test/${encodeURIComponent(r)}`, expiresAt })),
      },
    };
  };

  return { svc, invocations };
}

const paths = (n: number) =>
  Array.from({ length: n }, (_, i) => `signed-url-test/17623000000${i}_file${i}.jpg`);

describe('MediaUrlService — request economy', () => {

  it('resolves 20 media in ONE callable round-trip', async () => {
    const { svc, invocations } = makeService();
    const urls = await Promise.all(paths(20).map(p => svc.resolve(p)));

    expect(invocations.length).toBe(1);              // the headline property
    expect(invocations[0].length).toBe(20);          // all 20 travelled together
    expect(urls.every(u => !!u)).toBeTrue();
    expect(svc.stats.calls).toBe(1);
    expect(svc.stats.signed).toBe(20);
  });

  it('collapses duplicate refs in the same batch to one slot', async () => {
    const { svc, invocations } = makeService();
    const p = 'signed-url-test/1762300000000_same.jpg';
    const [a, b, c] = await Promise.all([svc.resolve(p), svc.resolve(p), svc.resolve(p)]);

    expect(invocations.length).toBe(1);
    expect(invocations[0]).toEqual([p]);             // sent once, not three times
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('costs nothing on a re-render — the cache answers', async () => {
    const { svc, invocations } = makeService();
    const list = paths(5);
    await Promise.all(list.map(p => svc.resolve(p)));
    expect(invocations.length).toBe(1);

    await Promise.all(list.map(p => svc.resolve(p)));   // simulate a second render pass
    await Promise.all(list.map(p => svc.resolve(p)));

    expect(invocations.length).toBe(1);              // still one, for the whole screen's life
    expect(svc.stats.cacheHits).toBe(10);
  });

  it('passes a download URL straight through without any request', async () => {
    const { svc, invocations } = makeService();
    const legacy = 'https://firebasestorage.googleapis.com/v0/b/b.appspot.com/o/x.jpg?alt=media&token=abc';
    const got = await svc.resolve(legacy);

    expect(got).toBe(legacy);                        // unchanged
    expect(invocations.length).toBe(0);              // no callable at all
    expect(svc.stats.passthrough).toBe(1);
  });

  it('splits a batch larger than the per-call cap across requests', async () => {
    const { svc, invocations } = makeService();
    const urls = await Promise.all(paths(250).map(p => svc.resolve(p)));

    expect(invocations.length).toBe(2);              // 200 + 50, never one oversized call
    expect(invocations[0].length).toBe(200);
    expect(invocations[1].length).toBe(50);
    expect(urls.filter(u => !!u).length).toBe(250);  // nothing dropped
  });

  it('invalidate() forces exactly one re-request for that ref', async () => {
    const { svc, invocations } = makeService();
    const p = paths(1)[0];
    await svc.resolve(p);
    svc.invalidate(p);
    await svc.resolve(p);
    expect(invocations.length).toBe(2);
  });

  it('clear() re-requests the whole screen in one batch', async () => {
    const { svc, invocations } = makeService();
    const list = paths(8);
    await Promise.all(list.map(p => svc.resolve(p)));
    svc.clear();
    await Promise.all(list.map(p => svc.resolve(p)));

    expect(invocations.length).toBe(2);
    expect(invocations[1].length).toBe(8);
  });

  it('releases every waiter when the whole call fails', async () => {
    const { svc } = makeService({ fail: true });
    const urls = await Promise.all(paths(4).map(p => svc.resolve(p)));
    expect(urls).toEqual([null, null, null, null]);  // resolved null, not left pending
    expect(svc.stats.failed).toBe(4);
  });

  it('releases a waiter whose ref the response omitted', async () => {
    const list = paths(3);
    const { svc } = makeService({ omit: [list[1]] });
    const urls = await Promise.all(list.map(p => svc.resolve(p)));
    expect(urls[0]).toBeTruthy();
    expect(urls[1]).toBeNull();                      // omitted → null, never a hung promise
    expect(urls[2]).toBeTruthy();
  });

  it('does not cache a failure, so the next attempt retries', async () => {
    const { svc, invocations } = makeService({ fail: true });
    const p = paths(1)[0];
    expect(await svc.resolve(p)).toBeNull();
    expect(await svc.resolve(p)).toBeNull();
    expect(invocations.length).toBe(2);              // retried rather than stuck
  });
});
