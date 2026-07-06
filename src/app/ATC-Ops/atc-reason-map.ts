/**
 * Maps backend HttpsError reason strings (arriving as `FirebaseError.message`)
 * to friendly, operator-facing messages. Reason strings are EXACT from source.
 * NEVER show the raw reason string to the user — always route through here.
 */

export type ReasonSeverity = 'transient' | 'blocked' | 'escalate' | 'dev';

export interface MappedReason {
  /** Friendly message safe to show the operator. */
  message: string;
  /** Extra hint (e.g. the own_unresolvable detail), optional. */
  detail?: string;
  severity: ReasonSeverity;
  /** Semantic action hint the UI can branch on. */
  action?:
    | 'log'
    | 'refresh-list'
    | 'wait'
    | 'requeue'
    | 'redirect-regenerate'
    | 'escalate'
    | 'signin';
}

// own_unresolvable:<detail> suffix hints (surface the human hint after the colon)
function ownUnresolvableDetail(detail: string): string {
  if (detail.startsWith('NO_ACTIONRESOURCE'))
    return "Stage isn't wired to a form resource — config issue.";
  if (detail.startsWith('NO_FORM_SUBMISSION'))
    return "Participant hasn't submitted the required form yet.";
  if (detail.startsWith('NO_STUDIO_SESSION'))
    return 'No studio session logged for this participant/stage.';
  if (detail.startsWith('NO_LIVEASSIGNMENT'))
    return 'Studio session has no live assignment yet.';
  if (detail.startsWith('LIVEASSIGNMENT_NOT_FOUND'))
    return 'Live assignment record is missing.';
  if (detail.startsWith('TRANSCRIPT_NOT_YET_CAPTURED'))
    return "Zoom transcript hasn't been captured yet — retry later.";
  if (detail.startsWith('NO_ZOOM_MEETING'))
    return 'No Zoom meeting associated with the session.';
  if (detail.startsWith('UNKNOWN_STAGE_TYPE'))
    return "Stage type isn't form/zoom — config issue, escalate.";
  return detail; // unknown detail — still show it (it's a backend-controlled hint, not raw user input)
}

const UNKNOWN: MappedReason = {
  message: 'Something went wrong. Try again.',
  severity: 'escalate',
};

/**
 * @param code  FirebaseError.code (e.g. 'functions/failed-precondition', 'functions/unauthenticated')
 * @param reason FirebaseError.message (raw reason string)
 * @param source which callable produced it (mapping tables differ slightly)
 */
export function mapAtcError(
  code: string | undefined,
  reason: string | undefined,
  source: 'regenerate' | 'rebuild',
): MappedReason {
  if (code === 'functions/unauthenticated') {
    return { message: 'Your session expired. Please sign in again.', severity: 'escalate', action: 'signin' };
  }

  const r = reason ?? '';

  // ---- prefix / dynamic reasons (shared) ----
  if (r.startsWith('own_unresolvable:')) {
    return {
      message: "Can't resolve the participant's own source data yet.",
      detail: ownUnresolvableDetail(r.slice('own_unresolvable:'.length)),
      severity: 'transient',
      action: 'wait',
    };
  }
  if (r.startsWith('queue_') && r.endsWith('_not_found')) {
    return { message: "The source queue for this doc wasn't found.", severity: 'escalate', action: 'escalate' };
  }
  if (r.startsWith('token_') && r.endsWith('_not_found')) {
    return { message: "The queue token for this doc wasn't found.", severity: 'escalate', action: 'escalate' };
  }

  // ---- exact reasons, per source ----
  if (source === 'regenerate') {
    switch (r) {
      case 'missing_docid':
        return { message: 'No document selected.', severity: 'dev', action: 'log' };
      case 'doc_not_found':
        return { message: 'This generation doc no longer exists.', severity: 'blocked', action: 'refresh-list' };
      case 'status_processing_not_regeneratable':
        return { message: "This job is already being processed by a pod — can't regenerate now.", severity: 'blocked', action: 'wait' };
      case 'status_completed_not_regeneratable':
        return { message: "This job already completed. Use 'Rebuild & requeue' if you need to re-run it.", severity: 'blocked', action: 'requeue' };
      case 'no_queueref':
        return { message: 'Doc is missing its queue reference — data problem, escalate.', severity: 'escalate', action: 'escalate' };
      case 'stage_not_in_config':
        return { message: 'This stage is no longer configured for ATC generation.', severity: 'escalate', action: 'escalate' };
      case 'generateatc_false':
        return { message: 'ATC generation is turned off for this stage.', severity: 'blocked', action: 'escalate' };
      case 'atcprompts_missing':
        return { message: 'The base ATC prompt config is missing — backend/config issue, escalate.', severity: 'escalate', action: 'escalate' };
    }
  } else {
    switch (r) {
      case 'missing_docid':
        return { message: 'No document selected.', severity: 'dev', action: 'log' };
      case 'doc_not_found':
        return { message: 'This generation doc no longer exists.', severity: 'blocked', action: 'refresh-list' };
      case 'dataincomplete_use_regenerate':
        return { message: "This doc is missing source data — use 'Generate / Retry' instead.", severity: 'blocked', action: 'redirect-regenerate' };
      case 'no_stagedata':
        return { message: 'This doc has no resolved sources to build a prompt from.', severity: 'escalate', action: 'escalate' };
      case 'status_processing_needs_requeue':
        return { message: 'This job is processing. To rebuild you must requeue (re-runs inference).', severity: 'blocked', action: 'requeue' };
      case 'status_completed_needs_requeue':
        return { message: 'This job already completed. To rebuild you must requeue (re-runs inference).', severity: 'blocked', action: 'requeue' };
      case 'status_error_needs_requeue':
        return { message: 'This job errored. To rebuild you must requeue (re-runs inference).', severity: 'blocked', action: 'requeue' };
      case 'atcprompts_missing':
        return { message: 'The base ATC prompt config is missing — escalate.', severity: 'escalate', action: 'escalate' };
      case 'no_resolved_stages':
        return { message: 'No resolved stages — nothing to build a prompt from.', severity: 'escalate', action: 'escalate' };
    }
  }

  return UNKNOWN;
}
