/**
 * Signed-URL migration — VideoAsk (M-5).
 *
 * participantvideoask.fileurl is becoming a Storage path, so screens no longer play it.
 * They play only the Publitio 480p version that videoAskHLS creates (hls.id), the same
 * file the Flutter app plays. Returns null when the record has not been converted yet.
 */
export const VIDEOASK_HLS_BASE = 'https://media.publit.io/file/h_480/';

export function videoAskHlsUrl(record: any): string | null {
  const id = record?.hls?.id;
  if (id === undefined || id === null || String(id).trim() === '') return null;
  return `${VIDEOASK_HLS_BASE}${encodeURIComponent(String(id).trim())}.mp4`;
}
