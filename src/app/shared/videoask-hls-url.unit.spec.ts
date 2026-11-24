// videoask-hls-url.unit.spec.ts — VideoAsk screens play only the Publitio 480p (HLS) file,
// never participantvideoask.fileurl (signed-URL migration M-5).
import { videoAskConversionState, videoAskHlsUrl, VIDEOASK_HLS_BASE } from './videoask-hls-url';

describe('videoAskConversionState (Retry button rules)', () => {
  const show = (r: any) => videoAskConversionState(r).showRetry;
  const busy = (r: any) => videoAskConversionState(r).busy;

  it('shows Retry for a failed record', () => {
    expect(show({ hlsstatus: 'failed', fileurl: 'videoask/videoask/a.mp4' })).toBeTrue();
  });
  it('shows Retry for an old record with no status that never converted', () => {
    expect(show({ fileurl: 'https://firebasestorage.googleapis.com/x' })).toBeTrue();
    expect(show({ fileurl: 'videoask/videoask/a.mp4', hlsstatus: null, convertedtohls: false })).toBeTrue();
  });
  it('hides Retry for an old record with no status that IS converted', () => {
    expect(show({ convertedtohls: true, hls: { id: 'x' } })).toBeFalse();
  });
  it('hides Retry while in progress / retry requested / after success, and marks busy', () => {
    for (const s of ['inprogress', 'retry']) {
      expect(show({ hlsstatus: s })).toBeFalse();
      expect(busy({ hlsstatus: s })).toBeTrue();
    }
    expect(show({ hlsstatus: 'success', convertedtohls: true })).toBeFalse();
    expect(busy({ hlsstatus: 'failed' })).toBeFalse();
  });
  it('converted records show only the video (no status text); every other state shows it', () => {
    const showStatus = (r: any) => videoAskConversionState(r).showStatus;
    expect(showStatus({ hlsstatus: 'success', convertedtohls: true })).toBeFalse();
    expect(showStatus({ convertedtohls: true, hls: { id: 'x' } })).toBeFalse();
    for (const s of ['inprogress', 'retry', 'failed']) expect(showStatus({ hlsstatus: s })).toBeTrue();
    expect(showStatus({ fileurl: 'videoask/videoask/a.mp4' })).toBeTrue();
  });

  it('maps each unconverted state to exactly one status text (+ Retry rule)', () => {
    const cases: Array<[any, string, boolean]> = [
      [{ hlsstatus: 'inprogress' }, 'Converting…', false],
      [{ hlsstatus: 'retry' }, 'Retry requested', false],
      [{ hlsstatus: 'failed', hlserror: 'x' }, 'Conversion failed', true],
      [{ fileurl: 'videoask/videoask/a.mp4' }, 'Not converted', true],
    ];
    for (const [row, label, retry] of cases) {
      const s = videoAskConversionState(row);
      expect(s.showStatus).withContext(label).toBeTrue();
      expect(s.label).toBe(label);
      expect(s.showRetry).withContext(label).toBe(retry);
    }
  });

  it('labels each status; unknown values count as no status', () => {
    expect(videoAskConversionState({ hlsstatus: 'inprogress' }).label).toBe('Converting…');
    expect(videoAskConversionState({ hlsstatus: 'failed' }).label).toBe('Conversion failed');
    expect(videoAskConversionState({ hlsstatus: 'weird' }).status).toBeNull();
    expect(videoAskConversionState({}).label).toBe('Not converted');
  });
});

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
