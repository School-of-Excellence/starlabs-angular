// videoask-hls-url.unit.spec.ts — VideoAsk screens play only the Publitio 480p (HLS) file,
// never participantvideoask.fileurl (signed-URL migration M-5).
import { videoAskHlsUrl, VIDEOASK_HLS_BASE } from './videoask-hls-url';

describe('videoAskHlsUrl', () => {
  it('builds the Publitio 480p MP4 link from hls.id', () => {
    expect(videoAskHlsUrl({ hls: { id: 'AbC123xy' } })).toBe(`${VIDEOASK_HLS_BASE}AbC123xy.mp4`);
  });

  it('never falls back to fileurl (download URL or path)', () => {
    expect(videoAskHlsUrl({ fileurl: 'https://firebasestorage.googleapis.com/v0/b/x/o/a?token=t' })).toBeNull();
    expect(videoAskHlsUrl({ fileurl: 'videoask/videoask/a.mp4', hls: null })).toBeNull();
  });

  it('returns null for missing or empty ids', () => {
    expect(videoAskHlsUrl(null)).toBeNull();
    expect(videoAskHlsUrl({})).toBeNull();
    expect(videoAskHlsUrl({ hls: {} })).toBeNull();
    expect(videoAskHlsUrl({ hls: { id: '  ' } })).toBeNull();
  });

  it('encodes the id so it cannot change the link', () => {
    expect(videoAskHlsUrl({ hls: { id: 'a/../b' } })).toBe(`${VIDEOASK_HLS_BASE}a%2F..%2Fb.mp4`);
  });
});
