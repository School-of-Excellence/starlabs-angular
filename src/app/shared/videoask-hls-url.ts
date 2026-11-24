/**
 * Signed-URL migration — VideoAsk (M-5).
 *
 * participantvideoask.fileurl is becoming a Storage path, so screens no longer play it.
 * They play only the Publitio 480p version that videoAskHLS creates (hls.id), the same
 * file the Flutter app plays. Returns null when the record has not been converted yet.
 */
export const VIDEOASK_HLS_BASE = 'https://media.publit.io/file/h_480/';

/** participantvideoask.hlsstatus values written by the videoAskHLS Cloud Function (+ 'retry' by admins). */
export type VideoAskHlsStatus = 'inprogress' | 'success' | 'failed' | 'retry';

export interface VideoAskConversionState {
  /** The stored status, or null for records written before the status field existed. */
  status: VideoAskHlsStatus | null;
  label: string;
  /** False for a converted record: the screen shows only the video, no status text. */
  showStatus: boolean;
  /** Retry is offered for a failed record, or an old record with no status that never converted. */
  showRetry: boolean;
  /** A retry is already queued or running. */
  busy: boolean;
}

const STATUS_LABEL: Record<VideoAskHlsStatus, string> = {
  inprogress: 'Converting…',
  success: 'Converted',
  failed: 'Conversion failed',
  retry: 'Retry requested',
};

export function videoAskConversionState(record: any): VideoAskConversionState {
  const raw = record?.hlsstatus;
  const status: VideoAskHlsStatus | null = raw && raw in STATUS_LABEL ? raw : null;
  const converted = record?.convertedtohls === true;
  const label = status ? STATUS_LABEL[status] : converted ? 'Converted' : 'Not converted';
  return {
    status,
    label,
    showStatus: !(status === 'success' || (status === null && converted)),
    showRetry: status === 'failed' || (status === null && !converted),
    busy: status === 'inprogress' || status === 'retry',
  };
}

export function videoAskHlsUrl(record: any): string | null {
  const id = record?.hls?.id;
  if (id === undefined || id === null || String(id).trim() === '') return null;
  return `${VIDEOASK_HLS_BASE}${encodeURIComponent(String(id).trim())}.mp4`;
}
