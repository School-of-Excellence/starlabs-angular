/**
 * Shared types + contracts for the ATC generation ops screens.
 * All field/argument/reason names are taken verbatim from the deployed backend
 * (queue-aiatc-generation-pipeline). Do NOT invent names here.
 */

// ---------------------------------------------------------------------------
// queue_atc_generation document (firestore-atc / queue_atc_generation)
// ---------------------------------------------------------------------------
export type AtcStatus =
  | 'dataincomplete'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'error';

export type StageSourceType = 'form' | 'zoom';

export type StageCategory = 'own' | 'mandatory' | 'atleastonerequired';

export interface StageDataEntry {
  data: unknown | null;
  category: StageCategory;
  status: 'resolved' | 'missing';
  type: StageSourceType | null;
  queueid: string | null;
  queuetokenid: string | null;
  // sourceref may also be present; ignored in the UI.
}

export type StageData = Record<string /* stageName */, StageDataEntry>;

/** A queue_atc_generation document as read by the UI (only rendered fields typed). */
export interface AtcGenDoc {
  docid: string; // firestore doc id (injected client-side)
  status: AtcStatus;
  profileid?: string;
  stage?: string;
  type?: StageSourceType;
  createdAt?: any; // Firestore Timestamp
  startedAt?: any; // Firestore Timestamp
  finalizedAt?: any; // Firestore Timestamp
  completedAt?: any; // Firestore Timestamp
  lastupdatedat?: any; // Firestore Timestamp
  promptUpdatedAt?: any; // Firestore Timestamp
  attempts?: number;
  claimedBy?: string;
  queueref?: any; // DocumentReference → "queue generation/{id}" (built on atcDb handle)
  queue_token_id?: string;
  prompt?: string;
  systemprompt?: string;
  output?: string;
  raw_output?: string;
  stagedata?: StageData;
  failureCategory?: FailureCategory | null;
}

/**
 * Parsed structure of a completed doc's `output` (AI ATC generator schema).
 * `output` = Part-1 plain-text analysis + a literal `---JSON---` line + this JSON.
 */
export interface AtcOutputJson {
  participant_type?: string; // 'first_time' | 'returning'
  form_type?: string;
  adjustments?: Array<{
    adjustment?: string;
    outcome?: string;
    procedures?: string[];
    confidence?: 'high' | 'medium' | 'low' | string;
    source_layer?: 'experiential' | 'aspirational' | 'both' | string;
    tags?: string[];
    notes?: string;
  }>;
  ecological_review?: {
    system_coherence?: string;
    trajectory_present?: boolean;
    conflicts_identified?: string[];
    areas_not_addressed?: string[];
    ecological_risks?: string[];
  };
  areas_needing_more_data?: string[];
}

export interface ParsedAtcOutput {
  analysis: string; // Part-1 text before ---JSON---
  json: AtcOutputJson | null; // parsed JSON tail (null if unparseable)
  rawJsonText: string | null; // the JSON substring, for debugging/copy
}

/** Split an ATC `output` string into its Part-1 analysis + parsed JSON tail. */
export function parseAtcOutput(output?: string | null): ParsedAtcOutput {
  const empty: ParsedAtcOutput = { analysis: '', json: null, rawJsonText: null };
  if (!output || typeof output !== 'string') return empty;

  // 1) Prefer the explicit delimiter the prompt defines.
  const DELIM = '---JSON---';
  let analysis = output;
  let jsonSlice: string | null = null;
  const di = output.lastIndexOf(DELIM);
  if (di !== -1) {
    analysis = output.slice(0, di).trim();
    jsonSlice = output.slice(di + DELIM.length);
  }

  // 2) Extract the last brace-balanced object from the candidate slice (or whole output).
  const candidate = jsonSlice ?? output;
  const rawJsonText = extractBalancedJson(candidate);
  let json: AtcOutputJson | null = null;
  if (rawJsonText) {
    try {
      json = JSON.parse(rawJsonText) as AtcOutputJson;
    } catch {
      json = null;
    }
  }
  // If no explicit delimiter but we found JSON, treat everything before it as analysis.
  if (di === -1 && rawJsonText) {
    const idx = output.lastIndexOf(rawJsonText);
    if (idx > 0) analysis = output.slice(0, idx).trim();
  }
  return { analysis, json, rawJsonText };
}

/** Find the first brace-balanced JSON object substring (string-aware). */
function extractBalancedJson(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Callable request/response contracts (exact, from source)
// ---------------------------------------------------------------------------
export interface RegenerateReq {
  docid: string;
}
export type RegenerateOk =
  | {
      ok: true;
      status: 'dataincomplete';
      missing: Array<{ stage: string; category: 'mandatory' | 'atleastonerequired' }>;
    }
  | {
      ok: true;
      status: 'pending';
      resolvedStages: number;
      missing: Array<{ stage: string; category: string }>;
    };

export interface RebuildReq {
  docid: string;
  requeue?: boolean;
}
export interface RebuildOk {
  ok: true;
  status: 'pending';
  requeued: boolean;
  promptChars: number;
}

// ---------------------------------------------------------------------------
// Usage / monitoring rollup docs (default DB: scope_enhancement_atc_usage_*)
// ---------------------------------------------------------------------------

/** classify/pod_worker */
export interface PodWorker {
  enabled: boolean;
  state: 'IDLE' | 'LOADING' | 'READY' | 'TERMINATING' | 'HALTED';
  halted?: boolean;
  haltedReason?: string;
  podid?: string;
  gpu?: { gpu: string; count: number };
  apiUrl?: string;
  model?: string;
  CONFIG_ID?: string;
  workerRunning?: boolean;
  currentJobPath?: string;
  launchError?: string;
}

/** scope_enhancement_atc_usage_dropoffs/{YYYY-MM-DD} */
export interface DropoffsDoc {
  total?: number;
  byStage?: { S0?: number; S1?: number };
  byReason?: Record<string, number>;
  lastReason?: string;
  lastExtra?: { profileid?: string; queueTokenId?: string; stage?: string; docid?: string };
}

/** scope_enhancement_atc_usage_backlog/{YYYY-MM-DD | latest} */
export interface BacklogGauge {
  pendingCount?: number;
  processingCount?: number;
  stuckCount?: number;
  dataincompleteCount?: number;
  oldestPendingAgeMin?: number;
  podState?: string;
  sampledAt?: any; // Timestamp
  collectionName?: string;
}

export type FailureCategory =
  | 'infer_timeout'
  | 'infer_error'
  | 'empty_output'
  | 'bad_json'
  | 'pod_unavailable'
  | 'max_attempts'
  | 'unknown';

export const FAILURE_CATEGORIES: FailureCategory[] = [
  'infer_timeout',
  'infer_error',
  'empty_output',
  'bad_json',
  'pod_unavailable',
  'max_attempts',
  'unknown',
];

export interface RollupMetrics {
  total?: number;
  completed?: number;
  failed?: number;
  retried?: number;
  turnaroundMsSum?: number;
  turnaroundCount?: number;
  byType?: Record<string, RollupMetrics>;
  byFailure?: Partial<Record<FailureCategory, number>>;
}

/** scope_enhancement_atc_usage_daily/{YYYY-MM-DD}_{profileid|__ALL} */
export interface DailyRollup extends RollupMetrics {
  date?: string;
  profileid?: string;
}

/** scope_enhancement_atc_usage_lifetime/{profileid|__ALL} */
export interface LifetimeRollup extends RollupMetrics {
  firstSeen?: any; // Timestamp
  lastUpdated?: any; // Timestamp
}
