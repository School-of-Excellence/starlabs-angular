/* ══ Content Analytics v2 ═════════════════════════════════════════════════
 * One screen, one file: types, reference configuration, the pure derivations, the Firestore loader
 * and the component. It started as four files because the design was built against a mock dataset;
 * now that every tab reads live data there is no second implementation to keep them apart for.
 *
 * Every tab reads Firestore through ContentAnalyticsV2Live (below):
 *   Activity log / By content / By participant   `content analytics`
 *   Mode based                                   `participantsproduct` (per scope) + products / modes / shelf
 *   Recommendation based                         `recommended mix playlist`
 *   EiFLIX tier based                            `tier` + `series.tier` + `participant metadata.tier`
 *
 * What each tab can and cannot claim from that data is written up in
 * specs/journals/2026-09-22-content-analytics-v2-design.md — read it before changing a number.
 */
import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, Injectable, NgZone, PLATFORM_ID,
  computed, effect, inject, signal, untracked,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  DateRange, DefaultMatCalendarRangeStrategy, MAT_DATE_RANGE_SELECTION_STRATEGY, MatDateRangeSelectionStrategy, MatDatepickerModule,
} from '@angular/material/datepicker';
import { DateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  collection, count, doc, Firestore, getAggregateFromServer, getCountFromServer, getDoc, getDocs,
  getFirestore, limit, onSnapshot, orderBy, query, setDoc, sum, where,
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { SnackbarService } from '../../shared/snackbar.service';
import { environment } from '../../../environments/environment';

/* ══ Types ═══════════════════════════════════════════════════════════════ */

export type ViewKey = 'log' | 'video' | 'person' | 'mode' | 'rec' | 'tier';
export type StatusKey = 'completed' | 'progress' | 'live';
export type BandKey = 'all' | 'none' | 'low' | 'ok';
export type ScopeBy = 'event' | 'queue' | 'other';
export type ListKind = 'people' | 'content';
export type TierList = 'people' | 'series';
export type SortDir = 'asc' | 'desc';
export type PushFlag = 'complete' | 'ontrack' | 'behind' | 'missed' | 'notyet';
export type DrillKind = 'events' | 'people' | 'pcontent' | 'tierpeople' | 'pushes'
  | 'pushpeople' | 'items' | 'shelf' | 'movers';

interface LabelColor { label: string; color: string; }
interface SourceDef extends LabelColor { short: string; }
/** The playlist or series a play came out of, resolved from `playlistid` at load time. */
export interface Container { label: string; kind: 'playlist' | 'series'; color: string; }

/**
 * One `content analytics` document, mapped for the screen. Timestamps are epoch ms, durations seconds.
 * One document = one player-open, rewritten every 1–15s while playing, so `ts` is "last seen".
 */
export interface PlayEvent {
  ts: number;
  docid: string;
  pid: string;              // profileid — the grouping key for people (names are not unique)
  name: string;
  newUser: boolean;         // profileid absent from `participant metadata` (the legacy "(New User)")
  journeyName: string;      // `journey` doc name behind the participant's `activejourney`
  video: string;            // item title
  vid: string;              // videoid — the grouping key for items (titles change)
  src: string;              // SOURCES key — the content library
  rt: number;               // full runtime of the item
  pos: number;              // furthest point reached
  exit: number;             // where they were when they left
  spent: number;            // time actually spent (can exceed rt on a rewatch)
  rewatch: boolean;
  platform: string;         // PLATFORM key — set by almost nothing today
  plId?: string;            // playlistid, for matching against a configured shelf or a pushed playlist
  cont: Container | null;
  complete: boolean;        // stored status === 'complete' (within 20s of the end)
  live: boolean;            // heartbeat is recent — still playing
}

export interface Stats {
  evs: PlayEvent[]; views: number; viewers: number; rewatch: number; avgReach: number; watch: number;
  done: string[]; mid: string[]; doneN: number; midN: number;
}
export interface GroupStats extends Stats { kind: string; label: string; }
export interface VideoRollup extends Stats {
  key: string; video: string; src: string; rt: number; groups: GroupStats[]; share: number;
  band: Exclude<BandKey, 'all'>; plCount: number;
}
interface SourceBucket { vids: Set<string>; evs: PlayEvent[]; }
export interface PersonRollup {
  key: string; name: string; newUser: boolean; journeyName: string; views: number; vids: Set<string>;
  watch: number; last: number; evs: PlayEvent[]; bySrc: Record<string, SourceBucket>; unique: number;
  srcCounts: Record<string, number>;   // SOURCES key → distinct items watched there (sortable as `src_<key>`)
}
export interface PeopleRow {
  key: string; name: string; journeyName: string; views: number; watch: number; reach: number;
  done: number; last: number; avgReach: number;
}
export interface PContentRow {
  key: string; video: string; src: string; rt: number; plays: number; best: number; done: boolean;
  spent: number; evs: PlayEvent[];
}
export interface Filters { q: string; src: string; st: string; pl: string; min: number; }

/* ══ Reference configuration ═════════════════════════════════════════════ */

export const SOURCES: Record<string, SourceDef> = {
  eiflixcontent:  { label: 'EiFLIX Content',  short: 'EiFLIX',      color: '#0076C8' },
  eiflixworkshop: { label: 'EiFLIX Workshop', short: 'Workshop',    color: '#6D029A' },
  solarvoice:     { label: 'Solar Voice',     short: 'Solar Voice', color: '#16A34A' },
  generalcontent: { label: 'General Content', short: 'General',     color: '#6B7280' },
  adsplaylist:    { label: 'Ads Playlist',    short: 'Ads',         color: '#B45309' },
  other:          { label: 'Other',           short: 'Other',       color: '#9CA3AF' },   // unrecognised `from`
};
/**
 * The `type` on a `recommended mix playlist` document — the content bucket a push carried. These are the
 * authoring screen's own words (`eiflix` / `solarvoice` / `generalcontent`), not the `from` values that
 * `content analytics` writes, so they need their own map.
 */
export const REC_TYPE: Record<string, LabelColor> = {
  eiflix:         { label: 'EiFLIX',          color: '#0076C8' },
  solarvoice:     { label: 'Solar Voice',     color: '#16A34A' },
  generalcontent: { label: 'General Content', color: '#6B7280' },
};
export const PLATFORM: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android' };

export const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  completed: { label: 'Completed',    cls: 'ok'  },
  progress:  { label: 'In progress',  cls: 'mid' },
  live:      { label: 'Watching now', cls: 'liv' },
};
export const PUSH_FLAG: Record<PushFlag, [string, string]> = {
  complete: ['Completed', 'ok'], ontrack: ['On track', 'mid'], behind: ['Behind', 'rw'],
  missed: ['Missed', 'low'], notyet: ['Not started', 'rw'],
};
export const BANDS: Record<BandKey, string> = { all: 'All content', none: 'Not watched', low: 'Under-watched', ok: 'Well watched' };
export const SCOPE_BY: Record<ScopeBy, string> = { event: 'Event', queue: 'Queue', other: 'Others' };
export const KIND_NOUN: Record<DrillKind, string> = {
  events: 'views', people: 'participants', movers: 'participants', shelf: 'items', pcontent: 'items',
  tierpeople: 'participants', pushes: 'playlists', pushpeople: 'participants', items: 'items',
};

// Column glossary — surfaced on hover so the headings don't need a manual.
export const TIPS: Record<string, string> = {
  'When': 'Date and time the play was logged. A green dot means it is playing right now.',
  'Participant': 'Who watched. Their journey is shown underneath.',
  'Playlist / Series': 'What the play came out of. A square marker is a pushed playlist — it was served to them inside one. A round marker is the series the content belongs to, which they found themselves. A dash means the item stands alone.',
  'Source': 'The content library the video sits in.',
  'Dropped at': 'The point in the video they were at when they left — shown in green while they are still watching. Unlike watch time this never double-counts — rewatching two minutes four times still shows the single point they walked away from.',
  'Spend time': 'Time actually spent on the item. Can exceed its length if they rewatched or scrubbed back — shown as a ↻ badge.',
  'Overall Duration': 'Full runtime of the item.',
  'Watch time': 'Total time spent, summed across every play in scope.',
  'Platform': 'Device the video was played on.',
  'Outcome': 'How the viewing ended: Completed = the app marked it complete, or 90%+ of the way through (the app\u2019s flag is ignored on items under a minute, where it fires as soon as the item is opened) · a percentage = how far through they got before leaving · Watching now = still open.',
  'Total views': 'Every play of this item, including repeats by the same person.',
  'Unique viewers': 'Distinct people who played it, however many times each.',
  'Rewatches': 'Plays beyond each person’s first — total views minus unique viewers.',
  'Average consumption': 'Average share of the item reached across every play.',
  'Partly watched': 'People who opened it but whose best attempt did not finish it.',
  'Views': 'Total number of plays.',
  'Viewers': 'Distinct people who played it, however many times each.',
  'Total number of content': 'Distinct items this person played, across every library. The library columns to the left add up to this.',
  'EiFLIX': 'Distinct EiFLIX Content items this person played. Click for how each one performed for them.',
  'Workshop': 'Distinct EiFLIX Workshop items this person played. Click for how each one performed for them.',
  'Solar Voice': 'Distinct Solar Voice tracks this person played. Click for how each one performed for them.',
  'General': 'Distinct General Content items this person played. Click for how each one performed for them.',
  'Avg reach': 'Average share of the video reached across every play. The drop-off signal — low avg reach means people leave early.',
  'Completed': 'People whose best attempt reached 90% or more.',
  'Completion': 'Share of plays that reached 90% or more.',
  'Last active': 'Most recent play by this person in the selected period.',
  'Journey': 'The journey the participant is currently on — their `activejourney` in participant metadata.',

  /* Mode tab */
  'Current mode': 'The mode this participant is in today for the selected product, from participantsproduct.',
  'Moves in': 'Days until the mode engine moves them on, and which mode that is — read from nextmodedate, not forecast here.',
  'Content': 'A video configured for this mode. Highlighted rows are configured content nobody played in this period.',
  'Mode': 'The mode this content is configured for.',
  'Finished': 'Distinct people who reached 90% or more.',

  /* Recommendation tab */
  'Playlists': 'Recommended playlists pushed to this participant inside the selected period, counted per buffer group.',
  'Items done': 'Items finished, out of everything the pushed playlists contained. A pushed series or playlist counts as the episodes and audios inside it, and "finished" comes from the play log — the documents own completedcontent is filled on too few of them to report from.',
  'Progress': 'Share of pushed items finished.',
  'Closed unfinished': 'Playlists whose expiredate has passed with items still unfinished. Only 20% of pushes carry an expiredate — the rest never close, and are never counted here.',
  'Closing soon': 'Playlists with an expiredate that falls inside the days set on the panel above, still unfinished.',
  'Window': 'Pushed on (date) to closes on (expiredate). Most pushes carry no expiredate and simply stay open.',
  'Pushed to': 'How many participants had this item pushed to them inside a recommended playlist.',
  'Opened by': 'How many of them have a play logged against it.',
  'Finished by': 'How many of them finished it, by the same rule the rest of the screen uses.',
  'Open rate': 'Share of the people it was pushed to who opened it. This is the number that says whether the playlist is being acted on.',
  'Type': 'The content bucket the push carried — eiflix, solarvoice or generalcontent on the recommended mix playlist document.',
  'In playlist': 'The series or Solar Voice playlist this item was expanded from when the push was sent.',
  'Standing': 'Completed = 70%+ of pushed items finished · On track = 40%+ · Behind = something closing soon · otherwise Missed.',

  /* EiFLIX tier tab */
  'Series available': 'Series open to them — every series whose series.tier lists a tier they hold. There is no fixed number per tier.',
  'Series completed': 'Series where every video in the series was finished inside the selected period.',
  'Videos completed': 'Individual videos finished inside those series, out of every video they contain. A series only counts as completed when this reaches its full total.',
  'Videos': 'How many videos the series contains.',
  'Consumed': 'How far through the videos they actually got — the average across every video in scope. Watching all four videos of a series halfway reads 50% here while Videos completed still reads 0.',
  'Have access': 'Participants in scope whose tier is listed in series.tier for this series.',
  'Completed it': 'People who finished every video in the series inside the selected period.',
  'Open to': 'The tiers allowed to see this series — series.tier on the series document.',
  'All-time': 'Opens that participant\'s participant content analytics rollup: the series they have finished across all time, not just this period.',
  'Videos watched': 'Episodes finished in the selected period, out of every episode their tiers open.',
};

/* ══ Pure derivations ════════════════════════════════════════════════════
 * No Angular and no Firestore below this line — everything takes rows and returns rows.
 */

export const DAY = 864e5;

/* ── Formatting — one duration format everywhere, no raw seconds ────────── */
export function dur(s: number): string {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}
export function durLong(s: number): string {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  if (h) return m ? `${h.toLocaleString('en-US')}h ${m}m` : `${h.toLocaleString('en-US')}h`;
  // the prototype only ever had hours here, so sub-minute totals rendered as "0m"
  return m ? `${m}m` : `${s}s`;
}
export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const pct = (n: number) => Math.round(n * 100) + '%';
export const num = (n: number) => n.toLocaleString('en-US');
export const reachColor = (r: number) =>
  r >= 0.9 ? 'var(--ok)' : r >= 0.4 ? 'var(--blue)' : r >= 0.05 ? '#D4A62A' : 'var(--bad)';

export function iso(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStart(ms: number): number {
  const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
}
export function dayEnd(ms: number): number {
  const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
}
export const daySpan = (a: number, b: number) => Math.round((dayEnd(b) - dayStart(a)) / DAY);
export const shortDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

/* ── Play-level: the outcome is computed from the data, never trusted blindly ── */
export const reachOf = (e: PlayEvent) => e.rt > 0 ? Math.min(1, e.pos / e.rt) : 0;
/**
 * Items this short are marked complete by the app the moment they are opened: it sets `status: 'complete'`
 * once the viewer is within 20s of the end, which is always true for a 5s clip. Below this length the
 * stored flag is ignored and only real reach counts.
 */
export const SHORT_ITEM_S = 60;
/** Finished = the app's stored flag (on items long enough for it to mean anything) OR 90%+ reached. */
export const isComplete = (e: PlayEvent) =>
  (!!e.complete && (e.rt === 0 || e.rt >= SHORT_ITEM_S)) || reachOf(e) >= 0.9;
export function statusOf(e: PlayEvent): StatusKey {
  if (e.live) return 'live';
  return isComplete(e) ? 'completed' : 'progress';
}
/** Grouping keys: ids, never the display text — names are not unique and titles change. */
export const personKey = (e: PlayEvent) => e.pid || e.name;
export const itemKey = (e: PlayEvent) => e.vid || e.video;

/** Everything in the filter bar except the date range, which the loader handles. */
export function matchNonDate(e: PlayEvent, f: Filters): boolean {
  const q = f.q.trim().toLowerCase();
  return (!q || e.name.toLowerCase().includes(q) || e.video.toLowerCase().includes(q)) &&
    (!f.src || e.src === f.src) && (!f.st || statusOf(e) === f.st) &&
    (!f.pl || e.platform === f.pl) && (e.spent >= f.min);
}

/** Metrics for any set of plays — used for a whole item and for each playlist slice of it. */
export function statsFor(evs: PlayEvent[]): Stats {
  const people = new Set<string>(), best: Record<string, boolean> = {};
  let watch = 0, reach = 0;
  evs.forEach(e => {
    const k = personKey(e);
    people.add(k); watch += e.spent; reach += reachOf(e);
    best[k] = best[k] || isComplete(e);
  });
  // each person lands in one bucket, from their best attempt
  const done: string[] = [], mid: string[] = [];
  Object.entries(best).forEach(([n, d]) => (d ? done : mid).push(n));
  return {
    evs, views: evs.length, viewers: people.size, rewatch: evs.length - people.size,
    avgReach: evs.length ? reach / evs.length : 0, watch,
    done, mid, doneN: done.length, midN: mid.length,
  };
}

/** By content: one row per item, with its plays split by the playlist or series they came out of. */
export function rollupVideos(rows: PlayEvent[]): VideoRollup[] {
  const m: Record<string, { key: string; video: string; src: string; rt: number; evs: PlayEvent[] }> = {};
  rows.forEach(e => {
    const o = (m[itemKey(e)] ||= { key: itemKey(e), video: e.video, src: e.src, rt: e.rt, evs: [] });
    o.evs.push(e);
    if (e.rt > o.rt) o.rt = e.rt;                  // runtime can be missing on a heartbeat — keep the known one
  });
  const active = new Set(rows.map(personKey)).size;
  return Object.values(m).map(o => {
    // the same item can be carried by several playlists — split its plays by where they came from
    const g: Record<string, PlayEvent[]> = {};
    o.evs.forEach(e => {
      const c = e.cont;
      (g[c ? c.kind + '|' + c.label : 'none|Not in a playlist'] ||= []).push(e);
    });
    const groups: GroupStats[] = Object.entries(g).map(([k, evs]) => {
      const i = k.indexOf('|');
      return { kind: k.slice(0, i), label: k.slice(i + 1), ...statsFor(evs) };
    }).sort((x, y) => y.views - x.views);
    const st = statsFor(o.evs);
    // reach across the active audience is what says "this needs promoting"
    const share = active ? st.viewers / active : 0;
    return {
      ...o, ...st, groups, share,
      band: st.views === 0 ? 'none' : share < 0.25 ? 'low' : 'ok',
      plCount: groups.filter(x => x.kind === 'playlist').length,
    } as VideoRollup;
  });
}

/** By participant: one row per person, with a distinct-item count per content library. */
export function rollupPeople(rows: PlayEvent[]): PersonRollup[] {
  const m: Record<string, PersonRollup> = {};
  rows.forEach(e => {
    const k = personKey(e);
    const o = (m[k] ||= {
      key: k, name: e.name, newUser: e.newUser, journeyName: e.journeyName, views: 0, vids: new Set(),
      watch: 0, last: e.ts, evs: [], bySrc: {}, unique: 0, srcCounts: {},
    });
    o.evs.push(e); o.views++;
    const b: SourceBucket = (o.bySrc[e.src] ||= { vids: new Set(), evs: [] });
    b.vids.add(itemKey(e)); b.evs.push(e); o.vids.add(itemKey(e)); o.watch += e.spent;
    if (e.ts > o.last) o.last = e.ts;
  });
  return Object.values(m).map(o => ({
    ...o, unique: o.vids.size,
    srcCounts: Object.fromEntries(Object.keys(SOURCES).map(k => [k, o.bySrc[k] ? o.bySrc[k].vids.size : 0])),
  }));
}

/* ── Drill-down shapes ── */
export function toPeople(evs: PlayEvent[]): PeopleRow[] {
  const m: Record<string, Omit<PeopleRow, 'avgReach'>> = {};
  evs.forEach(e => {
    const o = (m[personKey(e)] ||= {
      key: personKey(e), name: e.name, journeyName: e.journeyName, views: 0, watch: 0, reach: 0, done: 0, last: e.ts,
    });
    o.views++; o.watch += e.spent; o.reach += reachOf(e);
    if (statusOf(e) === 'completed') o.done++;
    if (e.ts > o.last) o.last = e.ts;
  });
  return Object.values(m).map(o => ({ ...o, avgReach: o.reach / o.views })).sort((a, b) => b.watch - a.watch);
}
/** One participant's performance on the items they opened. */
export function pContent(evs: PlayEvent[]): PContentRow[] {
  const m: Record<string, PContentRow> = {};
  evs.forEach(e => {
    const o = (m[itemKey(e)] ||= { key: itemKey(e), video: e.video, src: e.src, rt: e.rt, plays: 0, best: 0, done: false, spent: 0, evs: [] });
    o.plays++; o.spent += e.spent; o.evs.push(e);
    o.best = Math.max(o.best, reachOf(e));
    o.done = o.done || isComplete(e);
  });
  return Object.values(m).sort((a, b) => b.spent - a.spent);
}

/* ══ Firestore loader ════════════════════════════════════════════════════ */
/** A play counts as "Watching now" if its heartbeat landed this recently (heartbeats are ≤ 15s apart). */
export const LIVE_MS = 45_000;
/**
 * Watch time is accumulated in heartbeat steps (15s in the EiFLIX episode player, 5s in the workshop one,
 * 1–3s in Solar Voice) and a whole step counts even if the item ended partway through it. So "spent longer
 * than the item lasts" only means a rewatch once it exceeds the runtime by more than one full step —
 * otherwise every short clip would carry a ↻ badge.
 */
export const REWATCH_SLACK_S = 15;
/** "Watching now" listens over a wider window than 45s, because a listener's bound is fixed when created. */
const NOW_WINDOW_MS = 10 * 60_000;
const NOW_RESUBSCRIBE_MS = 5 * 60_000;
const COL = 'content analytics';

export interface AllTime { views: number; watch: number; completed: number; first: number | null; }

/* ── Mode tab ─────────────────────────────────────────────────────────────
 * The engagement-mode machine, as the Cloud Functions leave it in Firestore:
 *   participantsproduct  one row per participant × product — `mode` now, `nextmode` + `nextmodedate` next
 *                        (written by participantmode.js: delivery triggers + the daily 00:05 IST cron),
 *                        and `eventref` pointing at the `event collection` / `queue generation` it came from
 *   products             `product` name + `modeflow` (that product's ordered mode path)
 *   modes                the 15-mode catalogue, ordered by `sequence`
 *   product mode config  productref + mode → widgets[] whose `reference`s are the content on that shelf
 * Same collections and the same one-shot read the AppEngagement mode dashboard uses.
 */
export interface ParticipantProduct {
  profileid: string; productid: string; mode: string; nextmode: string; nextmodedate: number | null;
  activityId: string; activityKind: 'event' | 'queue' | '';
}
export interface ProductDef { id: string; name: string; modeflow: string[]; }
export interface ActivityDef { id: string; label: string; kind: 'event' | 'queue'; }
/** One content item configured for a (product, mode) — the "shelf". */
export interface ShelfItem { key: string; label: string; kind: string; widget: string; mandatory: boolean; }
export interface ModeData {
  products: ProductDef[];
  modes: string[];                                   // mode names, lowest `sequence` first
  events: ActivityDef[];
  queues: ActivityDef[];
  shelf: Record<string, ShelfItem[]>;                 // `${productid}|${mode}` → configured content
}
/** The participants of ONE scope — an event, a queue, or a product. Never the whole collection. */
export interface ModeScope {
  key: string;                                        // 'event:<id>' | 'queue:<id>' | 'product:<id>'
  rows: ParticipantProduct[];
  total: number;                                      // how many the scope really holds (counted server-side)
  partial: boolean;                                   // true → only the people moving inside `win` were loaded
  win: number;                                        // the forecast window `partial` was narrowed to
  error?: boolean;
}
/** Above this many participants in one scope, only the ones moving inside the window are loaded. */
export const SCOPE_CAP = 3000;

/* ── Recommendation tab ── */
/** One content item inside a pushed playlist. `container` is the series / playlist it was expanded from. */
export interface RecItem { key: string; label: string; type: string; container: string; }
/** One recommended playlist pushed to one participant — the per-type documents merged back together. */
export interface RecPush {
  key: string; plId: string; pid: string; title: string; types: string[];
  start: number; end: number | null; personalised: boolean; by: string;
  items: RecItem[];
  /** How many items the documents themselves claim are done — only 3–9% of docs carry this. */
  stored: number;
}
/* ── EiFLIX tier tab ── */
export interface TierDef { id: string; name: string; order: number; }
export interface SeriesDef { id: string; name: string; tiers: string[]; eps: string[]; }
/** A participant with an app account. `tiers` can hold more than one — they are listed under each. */
export interface TierPerson { pid: string; name: string; tiers: string[]; }
export interface TierData { tiers: TierDef[]; series: SeriesDef[]; people: TierPerson[]; }

/** A period holding more pushes than this loads the most recent REC_CAP. */
export const REC_CAP = 4000;

/** The two sources a period is assembled from. */
type Part = 'past' | 'today';
/** Above this many plays in the period, only the most recent CAP are loaded (see `capped`). */
export const PERIOD_CAP = 5000;

@Injectable()
export class ContentAnalyticsV2Live {
  private readonly fs = inject(Firestore);
  private readonly guard = inject(AuthguardService);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Plays in the watched window, newest first. */
  readonly events = signal<PlayEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Lifetime totals from server-side aggregates — no documents are downloaded. */
  readonly allTime = signal<AllTime | null>(null);
  /** Plays logged in the equally-long window before the current one (aggregate count). */
  readonly prevCount = signal<number | null>(null);
  /** Plays mid-flight right now — its own listener, so it means "now" whatever period is selected. */
  readonly nowPlaying = signal<PlayEvent[]>([]);
  /** Set when the period holds more plays than PERIOD_CAP and only the most recent ones were loaded. */
  readonly capped = signal<{ total: number; shown: number } | null>(null);

  /** Docs per source — finished days and legacy string dates are fetched once, today is listened to. */
  private readonly docs = new Map<string, Record<string, any>>();
  private readonly byQuery: Record<Part, Map<string, Record<string, any>>> = { past: new Map(), today: new Map() };
  /** Which parts of the window are still outstanding — `loading` clears when all have answered. */
  private pending: Record<Part, boolean> = { past: false, today: false };
  /** Has the today listener heard from the server yet? Until then its cache snapshots are ignored. */
  private todayReady = false;
  /** The window being shown, and the day it was split on (so the split can be redone after midnight). */
  private lastWindow: [number, number] | null = null;
  private watchDay = 0;
  private names: Record<string, string> = {};
  /** `participant metadata` documents — email / phone / country code, needed to send to someone. */
  private meta: Record<string, any> = {};
  private newNames: Record<string, string> = {};
  private playlists: Record<string, string> = {};
  /** journey doc id → its name, for the participant's `activejourney`. */
  private journeys: Record<string, string> = {};
  /** general content / ads titles, for naming shelf items on the Mode tab. */
  private contentNames: Record<string, string> = {};
  private series: Record<string, string> = {};
  /** series / solar-voice-playlist id → the content ids inside it (`sequence`), for expanding a push. */
  private seq: Record<string, string[]> = {};
  /** series id → the tier ids allowed to see it (`series.tier`), for the EiFLIX tier tab. */
  private seriesTier: Record<string, string[]> = {};
  /** episode + audio titles — loaded only when the Recommendation tab needs them. */
  private itemNames: Record<string, string> = {};
  private itemNamesLoaded = false;
  private unsubs: (() => void)[] = [];
  private nowDocs = new Map<string, Record<string, any>>();
  private nowUnsub: (() => void) | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor() {
    if (!this.browser) return;
    this.loadLookups();
    this.loadAllTime();
    this.watchNow();
    // re-evaluate "Watching now" as heartbeats age out, without waiting for a new snapshot
    const tick = this.zone.runOutsideAngular(() => setInterval(() => {
      const now = Date.now();
      this.zone.run(() => {
        this.emitNow();
        if (this.events().some(e => !!e.live !== (now - e.ts < LIVE_MS))) this.emit();
        // past midnight the "finished days vs today" split is stale — redo it
        if (this.lastWindow && dayStart(now) !== this.watchDay) this.watch(...this.lastWindow);
      });
    }, 15_000));
    // the window bound is fixed when a listener is created, so roll it forward periodically
    const roll = this.zone.runOutsideAngular(() => setInterval(() => this.zone.run(() => this.watchNow()), NOW_RESUBSCRIBE_MS));
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick); clearInterval(roll);
      this.nowUnsub?.(); this.nowUnsub = null;
      this.stop();
    });
  }

  /**
   * Load the plays between the start of `from` and the end of `to`.
   *
   * Finished days can't change, so they are fetched ONCE; only today gets a live listener. That keeps a long
   * period (90 days of logs) from holding an open listener over every document, while today's plays — the only
   * ones that can still move — stay live. Legacy string logdates are fetched once too: they arrive from an
   * offline queue, so they are never "live" anyway.
   */
  watch(from: number, to: number) {
    if (!this.browser) return;
    this.stop();
    const gen = ++this.generation;
    this.docs.clear();
    this.byQuery.past.clear(); this.byQuery.today.clear();
    this.todayReady = false;
    this.capped.set(null);
    this.events.set([]);
    this.loading.set(true);
    this.error.set(null);

    const a = dayStart(from), b = dayEnd(to) + 999;
    const today = dayStart(Date.now());
    this.lastWindow = [from, to];
    this.watchDay = today;
    const col = collection(this.fs, COL);
    const pastEnd = Math.min(b, today - 1);          // everything before today 00:00
    this.pending = { past: a <= pastEnd, today: b >= today };

    if (this.pending.today) {
      this.listenToday(gen, query(col, where('logdate', '>=', new Date(Math.max(a, today))), where('logdate', '<', new Date(b)), orderBy('logdate', 'desc')));
    }
    if (this.pending.past) {
      // Count first (one cheap aggregate): a wide period on a busy project can hold tens of thousands of
      // plays, and every one would be a document read. Over the cap we load only the most recent ones and
      // say so, rather than quietly reporting totals off a partial load.
      const pastQ = query(col, where('logdate', '>', new Date(a)), where('logdate', '<=', new Date(pastEnd)), orderBy('logdate', 'desc'));
      getCountFromServer(pastQ)
        .then(async c => {
          if (gen !== this.generation) return;
          const total = c.data().count;
          if (total > PERIOD_CAP) this.capped.set({ total, shown: PERIOD_CAP });
          await this.fetchOnce(gen, total > PERIOD_CAP ? query(pastQ, limit(PERIOD_CAP)) : pastQ, 'past');
        })
        .catch(err => {                       // counting failed (e.g. rules) — fall back to a plain read
          console.warn('[content-analytics-v2] period count failed', err);
          if (gen === this.generation) this.fetchOnce(gen, query(pastQ, limit(PERIOD_CAP)), 'past');
        });
    }

    // prior window for the "vs prev" delta
    const span = Math.round((b - a) / DAY);
    this.prevCount.set(null);
    getCountFromServer(query(col, where('logdate', '>=', new Date(a - span * DAY)), where('logdate', '<', new Date(a))))
      .then(s => { if (gen === this.generation) this.prevCount.set(s.data().count); })
      .catch(err => console.warn('[content-analytics-v2] previous-period count failed', err));
  }

  /** One-shot read for a part of the window that cannot change any more. */
  private async fetchOnce(gen: number, q: any, which: Part) {
    try {
      const snap = await getDocs(q);
      if (gen !== this.generation) return;
      const m = this.byQuery[which];
      m.clear();
      snap.docs.forEach(d => m.set(d.id, d.data()));
    } catch (err: any) {
      if (gen !== this.generation) return;
      console.warn(`[content-analytics-v2] ${which} fetch failed`, err);
      if (which === 'past') this.error.set(String(err?.message || err));
    }
    if (gen === this.generation) this.settle(which);
  }

  /**
   * Today's plays, live. Two traps, both hit in testing:
   * 1. When a range is already in the local cache, the first snapshot is fromCache and — if the server finds
   *    nothing new — Firestore sends NO further data event, only a metadata one. Skipping cache snapshots
   *    without includeMetadataChanges (the legacy screen's pattern) leaves the screen on "Loading…" forever.
   * 2. A cache snapshot can be a SUBSET (only what an earlier, narrower range cached). Rendering it would flash
   *    wrong totals. So cache snapshots are ignored until the server has answered once.
   */
  private listenToday(gen: number, q: any) {
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap: any) => {
      if (gen !== this.generation) return;
      const fromServer = !snap.metadata.fromCache;
      if (!fromServer && !this.todayReady) return;
      const first = fromServer && !this.todayReady;
      if (fromServer) this.todayReady = true;
      const m = this.byQuery.today;
      m.clear();
      snap.docs.forEach((d: any) => m.set(d.id, d.data()));
      if (first) this.settle('today');
      else { this.rebuild(); this.scheduleEmit(); }
    }, (err: any) => {
      if (gen !== this.generation) return;
      console.error('[content-analytics-v2] today listener failed', err);
      this.error.set(String(err?.message || err));
      this.settle('today');
    });
    this.unsubs.push(unsub);
  }

  /** A part of the window has answered: merge it in, show it at once, and clear `loading` when none are left. */
  private settle(which: Part) {
    this.pending[which] = false;
    this.rebuild();
    if (this.emitTimer) { clearTimeout(this.emitTimer); this.emitTimer = null; }
    this.emit();
    if (!this.pending.past && !this.pending.today) this.loading.set(false);
  }

  private rebuild() {
    this.docs.clear();
    this.byQuery.past.forEach((v, k) => this.docs.set(k, v));
    this.byQuery.today.forEach((v, k) => this.docs.set(k, v));
  }

  /**
   * "Watching now", independent of the selected period: listen over the last NOW_WINDOW_MS and keep the rows
   * whose heartbeat is under LIVE_MS old. Kept apart from the period listeners so changing the period — or
   * looking at a past period — never changes what "now" means.
   */
  private watchNow() {
    if (!this.browser) return;
    this.nowUnsub?.();
    const q = query(collection(this.fs, COL), where('logdate', '>', new Date(Date.now() - NOW_WINDOW_MS)), orderBy('logdate', 'desc'));
    this.nowUnsub = onSnapshot(q, (snap: any) => {
      this.nowDocs.clear();
      snap.docs.forEach((d: any) => this.nowDocs.set(d.id, d.data()));
      this.emitNow();
    }, (err: any) => console.warn('[content-analytics-v2] watching-now listener failed', err));
  }

  private emitNow() {
    const now = Date.now(), out: PlayEvent[] = [];
    this.nowDocs.forEach((d, id) => {
      const e = this.toEvent(id, d, now);
      if (e && e.live) out.push(e);
    });
    out.sort((x, y) => y.ts - x.ts);
    const cur = this.nowPlaying();
    // keep the same array when nothing changed, so the drill-down and the badge don't churn
    if (cur.length !== out.length || out.some((e, i) => e.docid !== cur[i].docid || e.ts !== cur[i].ts)) this.nowPlaying.set(out);
  }

  private stop() {
    this.unsubs.forEach(u => u());
    this.unsubs = [];
    if (this.emitTimer) { clearTimeout(this.emitTimer); this.emitTimer = null; }
  }

  /** Heartbeats arrive every few seconds while people watch — coalesce them into one re-render. */
  private scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.emit(); }, this.events().length ? 800 : 0);
  }

  private emit() {
    const now = Date.now(), out: PlayEvent[] = [];
    this.docs.forEach((d, id) => { const e = this.toEvent(id, d, now); if (e) out.push(e); });
    out.sort((x, y) => y.ts - x.ts);
    this.events.set(out);
  }

  private toEvent(id: string, d: Record<string, any>, now: number): PlayEvent | null {
    const ts = toMs(d['logdate']);
    if (!ts) return null;
    const pid: string = d['profileid'] ?? '';
    const rt = toNum(d['totalruntime']);
    const spent = toNum(d['totaltimespend']);
    const exit = Math.round(parsePosition(d['lastwatchedtime']));
    const src = sourceOf(d);
    return {
      ts, docid: id, pid,
      name: this.names[pid] || this.newNames[pid] || pid || 'Unknown participant',
      newUser: !!pid && !this.names[pid],
      journeyName: this.journeys[this.meta[pid]?.['activejourney']] || '',
      video: d['videoname'] || d['videoid'] || 'Untitled',
      vid: d['videoid'] || d['videoname'] || id,
      src,
      rt, pos: exit, exit, spent,
      rewatch: rt > 0 && spent > rt + REWATCH_SLACK_S,
      plId: typeof d['playlistid'] === 'string' ? d['playlistid'] : undefined,
      platform: normPlatform(d['platform_name']),
      complete: d['status'] === 'complete',
      live: now - ts < LIVE_MS,
      cont: this.containerOf(d['playlistid']),
    };
  }

  private containerOf(pl: unknown): Container | null {
    if (!pl || typeof pl !== 'string') return null;
    if (pl === 'downloadsplaylist') return { label: 'Downloads Playlist', kind: 'playlist', color: '#6D029A' };
    if (this.series[pl]) return { label: this.series[pl], kind: 'series', color: '#6B7280' };
    if (this.playlists[pl]) return { label: this.playlists[pl], kind: 'playlist', color: '#6D029A' };
    return null;
  }

  /** Names + playlist/series labels. Rows re-resolve when these land. */
  private async loadLookups() {
    const tasks = [
      this.guard.getParticipantMetaMap().then((r: any) => { this.names = r.map || {}; this.meta = r.docdata || {}; }),
      this.guard.getProfileMapNewUser().then((r: any) => { this.newNames = r.map || {}; }),
      // `sequence` is captured here too — the Recommendation tab expands a pushed series / playlist into
      // the episodes and audios it actually contains. Same documents, no extra reads.
      getDocs(collection(this.fs, 'solar voice playlist')).then(s => s.docs.forEach(x => {
        const v = x.data(); this.playlists[v['id'] || x.id] = v['name'];
        this.seq[x.id] = (v['sequence'] || []).map((r: any) => r?.id || r).filter(Boolean);
      })),
      getDocs(collection(this.fs, 'series')).then(s => s.docs.forEach(x => {
        const v = x.data(); this.series[x.id] = v['seriesName'];
        this.seq[x.id] = (v['sequence'] || []).map((r: any) => r?.id || r).filter(Boolean);
        // `tier` is an array of refs into the tier catalogue — which tiers may see this series
        this.seriesTier[x.id] = (v['tier'] || []).map((r: any) => r?.id || r).filter(Boolean);
      })),
      getDocs(collection(this.fs, 'journey')).then(s => s.docs.forEach(x => { this.journeys[x.id] = x.data()['journey']; })),
      getDocs(collection(this.fs, 'content_urls')).then(s => s.docs.forEach(x => { this.contentNames[x.id] = x.data()['title']; })),
      getDocs(collection(this.fs, 'adsplaylist')).then(s => s.docs.forEach(x => { this.contentNames[x.id] = x.data()['adstitle']; })),
    ];
    await Promise.all(tasks.map(t => t.catch(err => console.warn('[content-analytics-v2] lookup failed', err))));
    if (this.docs.size) this.emit();
  }

  /** A participant's display name, for screens that only hold their profileid. */
  nameOf(pid: string): string { return this.names[pid] || this.newNames[pid] || pid; }
  /** Their active journey's name, blank until `participant metadata` and `journey` have both landed. */
  journeyName(pid: string): string { return this.journeys[this.meta[pid]?.['activejourney']] || ''; }

  /** Selected people as the communication service wants them: `{ profileid, name, metadata }`. */
  recipientsFor(keys: string[], label: (k: string) => string): { profileid: string; name: string; metadata: any }[] {
    return keys.map(k => ({ profileid: k, name: label(k), metadata: this.meta[k] || null }));
  }

  /* ── Mode tab data (lazy: only when that tab is opened, then cached) ── */
  readonly modeData = signal<ModeData | null>(null);
  readonly modeLoading = signal(false);
  private modeStarted = false;

  /**
   * The catalogues the Mode tab is built on — products, modes, shelves and the activity lists.
   * All small and fixed (104 / 15 / ~97 / ~96 docs), so they load once and stay.
   *
   * `participantsproduct` is deliberately NOT here: it holds ~38.5k documents, and reading it whole
   * to show one product's ladder froze the browser. It is fetched per scope instead — see loadScope().
   */
  async loadModeData(): Promise<void> {
    if (!this.browser || this.modeStarted) return;
    this.modeStarted = true;
    this.modeLoading.set(true);
    try {
      const [products, modes, config, events, queues] = await Promise.all([
        getDocs(collection(this.fs, 'products')),
        getDocs(query(collection(this.fs, 'modes'), orderBy('sequence', 'asc'))),
        getDocs(collection(this.fs, 'product mode config')),
        getDocs(collection(this.fs, 'event collection')),
        getDocs(collection(this.fs, 'queue generation')),
      ]);

      const shelf: Record<string, ShelfItem[]> = {};
      config.docs.forEach(d => {
        const v = d.data();
        const productid = v['productref']?.id;
        if (!productid || !v['mode']) return;
        const items: ShelfItem[] = [];
        (v['widgets'] || []).forEach((w: any) => {
          (w['reference'] || []).forEach((ref: any) => {
            const id = ref?.id, path = String(ref?.path || '');
            if (!id) return;
            const kind = path.split('/')[0] || '';
            items.push({ key: id, label: this.contentLabel(id, kind), kind, widget: w['title'] || w['widgetid'] || '', mandatory: !!w['mandatory'] });
          });
        });
        shelf[`${productid}|${v['mode']}`] = items;
      });

      this.modeData.set({
        products: products.docs.map(d => ({ id: d.id, name: d.data()['product'] || d.id, modeflow: d.data()['modeflow'] || [] }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        modes: modes.docs.map(d => d.data()['mode']).filter(Boolean),
        events: events.docs.map(d => ({ id: d.id, label: d.data()['name'] || d.id, kind: 'event' as const }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        queues: queues.docs.map(d => ({ id: d.id, label: d.data()['queuename'] || d.id, kind: 'queue' as const }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        shelf,
      });
    } catch (err) {
      console.warn('[content-analytics-v2] mode data failed', err);
      this.modeStarted = false;                        // let the next visit retry
    } finally {
      this.modeLoading.set(false);
    }
  }

  /* ── One scope's participants ────────────────────────────────────────
   * `participantsproduct` is ~38.5k documents, so it is never read whole. Every panel on the Mode tab
   * is about ONE product (or one event / queue), so the rows are fetched for that selection only:
   *
   *   event / queue   eventref == <that doc>          the people that activity put on a product
   *   product         productref == <that product>    everyone on it
   *
   * Both are single-field equalities, which Firestore indexes automatically — no composite index needed.
   * Counted first, and if a product is bigger than the cap we narrow to `nextmodedate` inside the
   * forecast window instead (a single-field range, so again no composite index): the people who are
   * about to move. `partial` then says so on screen, so no total is read off a silently cut load.
   */
  readonly modeScope = signal<ModeScope | null>(null);
  readonly scopeLoading = signal(false);
  private readonly scopeCache = new Map<string, ModeScope>();
  private scopeGen = 0;

  async loadScope(by: 'event' | 'queue' | 'other', id: string, win: number): Promise<void> {
    if (!this.browser || !id) return;
    const key = by === 'other' ? `product:${id}` : `${by}:${id}`;
    const gen = ++this.scopeGen;

    const hit = this.scopeCache.get(key);
    // a cached movers-only scope still has to be refetched when the window grows past what it covers.
    // scopeLoading is cleared here too: bumping scopeGen above orphans any in-flight load, and its own
    // `finally` checks the generation, so nothing else would ever turn the flag off.
    if (hit && (!hit.partial || hit.win >= win)) { this.modeScope.set(hit); this.scopeLoading.set(false); return; }

    this.scopeLoading.set(true);
    const col = collection(this.fs, 'participantsproduct');
    const base = by === 'other'
      ? query(col, where('productref', '==', doc(this.fs, 'products', id)))
      : query(col, where('eventref', '==', doc(this.fs, by === 'queue' ? 'queue generation' : 'event collection', id)));
    try {
      const total = (await getCountFromServer(base)).data().count;
      if (gen !== this.scopeGen) return;

      let q = base, partial = false;
      if (total > SCOPE_CAP) {
        // too many to hold — keep the ones the tab is actually about: whoever moves inside the window
        const today = dayStart(Date.now());
        q = query(col,
          where('nextmodedate', '>=', new Date(today)),
          where('nextmodedate', '<=', new Date(today + win * DAY + DAY - 1)));
        partial = true;
      }
      const snap = await getDocs(q);
      if (gen !== this.scopeGen) return;

      let rows = snap.docs.map(d => toParticipantProduct(d.data())).filter(r => r.profileid && r.productid);
      // the movers fallback can't also filter by scope in the same query (that needs a composite index)
      if (partial) rows = by === 'other'
        ? rows.filter(r => r.productid === id)
        : rows.filter(r => r.activityKind === by && r.activityId === id);

      const scope: ModeScope = { key, rows, total, partial, win };
      this.scopeCache.set(key, scope);
      this.modeScope.set(scope);
    } catch (err) {
      console.warn('[content-analytics-v2] mode scope failed', err);
      if (gen === this.scopeGen) this.modeScope.set({ key, rows: [], total: 0, partial: false, win, error: true });
    } finally {
      if (gen === this.scopeGen) this.scopeLoading.set(false);
    }
  }

  /** Shelf references point at series / playlists / content docs — name them from the catalogues. */
  private contentLabel(id: string, kind: string): string {
    return this.series[id] || this.playlists[id] || this.contentNames[id] || `${kind || 'item'} ${id.slice(0, 6)}`;
  }

  /* ── Recommendation tab ──────────────────────────────────────────────
   * `recommended mix playlist`: one document per participant × buffer group × content type, so a single
   * push to one person can be three documents sharing a `bufferdocref`. They are merged back together here.
   *
   * What the June audit found in a 100-doc sample, and why this tab is built the way it is:
   *   profileid / title / bufferdocref / date / type / list[] / personalised   100%
   *   expiredate 20%   completedcontent 9%   status 4%   completedplaylist 3%
   * So completion is NOT read from the stored arrays — it is derived from `content analytics` plays with
   * the same rule as the rest of the screen (operator decision 2026-09-23), and anything about a closing
   * window is reported over the pushes that actually carry an `expiredate`.
   */
  readonly recs = signal<RecPush[] | null>(null);
  readonly recLoading = signal(false);
  readonly recCapped = signal<{ total: number; shown: number } | null>(null);
  private recGen = 0;

  async loadRecs(from: number, to: number): Promise<void> {
    if (!this.browser) return;
    const gen = ++this.recGen;
    this.recLoading.set(true);
    this.recCapped.set(null);
    try {
      if (!this.itemNamesLoaded) await this.loadItemNames();
      const col = collection(this.fs, 'recommended mix playlist');
      const q = query(col,
        where('date', '>=', new Date(dayStart(from))), where('date', '<=', new Date(dayEnd(to) + 999)),
        orderBy('date', 'desc'));
      const total = (await getCountFromServer(q)).data().count;
      if (gen !== this.recGen) return;
      if (total > REC_CAP) this.recCapped.set({ total, shown: REC_CAP });
      const snap = await getDocs(total > REC_CAP ? query(q, limit(REC_CAP)) : q);
      if (gen !== this.recGen) return;

      // merge the per-type documents back into one push per (group, participant)
      const byPush = new Map<string, RecPush>();
      snap.docs.forEach(d => {
        const v = d.data();
        if (v['delete'] === true) return;                    // soft-deleted on the authoring screen
        const plId = v['bufferdocref']?.id, pid = v['profileid'];
        if (!plId || !pid) return;
        const key = `${plId}|${pid}`;
        const push = byPush.get(key) ?? {
          key, plId, pid, title: v['title'] || plId, types: [], start: toMs(v['date']),
          end: toMs(v['expiredate']) || null, personalised: !!v['personalised'],
          by: v['recommendedbyname'] || '', items: [], stored: 0,
        };
        const type = String(v['type'] || '');
        if (type && !push.types.includes(type)) push.types.push(type);
        push.start = Math.min(push.start || Infinity, toMs(v['date']));
        const end = toMs(v['expiredate']) || null;           // the latest close date across the types
        if (end && (!push.end || end > push.end)) push.end = end;
        push.stored += ((v['completedcontent'] || []).length + (v['completedplaylist'] || []).length);

        (v['list'] || []).forEach((ref: any) => {
          const id = ref?.id || ref;
          if (!id) return;
          // a pushed series / playlist stands for the episodes or audios inside it; general content is itself
          const inner = this.seq[id];
          const keys = inner?.length ? inner : [id];
          keys.forEach(k => {
            if (push.items.some(i => i.key === k)) return;
            push.items.push({ key: k, label: this.itemLabel(k), type, container: inner?.length ? id : '' });
          });
        });
        byPush.set(key, push);
      });
      this.recs.set([...byPush.values()].sort((a, b) => b.start - a.start));
    } catch (err) {
      console.warn('[content-analytics-v2] recommended playlists failed', err);
      if (gen === this.recGen) this.recs.set([]);
    } finally {
      if (gen === this.recGen) this.recLoading.set(false);
    }
  }

  /* ── EiFLIX tier tab ─────────────────────────────────────────────────
   * Everything this tab needs is already in memory except the 13-document `tier` catalogue:
   *   tier                        the named tiers and their `order` (there is no numbering, and no
   *                               "tier N unlocks N×M series" rule — that was a prototype invention)
   *   series.tier[]               which tiers may see each series (100% filled, captured in loadLookups)
   *   participant metadata.tier[] which tiers a participant holds — an ARRAY, filled on 63% of docs
   *
   * Who is listed follows the legacy `contentanalytics` screen: every `participant metadata` document
   * that has a `firebaseuserref` (i.e. an app account), placed under each tier it holds.
   */
  readonly tierData = signal<TierData | null>(null);
  readonly tierLoading = signal(false);
  private tierStarted = false;

  async loadTierData(): Promise<void> {
    if (!this.browser || this.tierStarted) return;
    this.tierStarted = true;
    this.tierLoading.set(true);
    try {
      if (!this.itemNamesLoaded) await this.loadItemNames();       // episode titles for the series drill
      const snap = await getDocs(collection(this.fs, 'tier'));
      const tiers: TierDef[] = snap.docs
        .map(d => ({ id: d.id, name: d.data()['tier'] || d.id, order: d.data()['order'] ?? 999 }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

      const series: SeriesDef[] = Object.keys(this.series).map(id => ({
        id, name: this.series[id] || id, tiers: this.seriesTier[id] || [], eps: this.seq[id] || [],
      })).sort((a, b) => a.name.localeCompare(b.name));

      const people: TierPerson[] = Object.entries(this.meta)
        .filter(([, v]) => !!v?.['firebaseuserref'])                // the legacy screen's own rule
        .map(([pid, v]) => ({
          pid, name: this.nameOf(pid),
          tiers: (v['tier'] || []).map((t: any) => t?.id || t).filter(Boolean),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      this.tierData.set({ tiers, series, people });
    } catch (err) {
      console.warn('[content-analytics-v2] tier data failed', err);
      this.tierStarted = false;
    } finally {
      this.tierLoading.set(false);
    }
  }

  /**
   * One participant's ALL-TIME completed series, read on demand.
   *
   * `participant content analytics` is a rollup keyed by profileid whose `eiflixseries[]` holds refs to
   * the series they have finished — the same source the legacy screen uses. A single document read, which
   * is why all-time progress is a drill-down and not a column: the period's plays cannot answer it, and
   * scanning `content analytics` (278k docs, ~30% complete) is not something a browser tab can do.
   * Returns null when the participant has no rollup document at all — which is NOT the same as zero done.
   */
  async allTimeSeries(pid: string): Promise<string[] | null> {
    try {
      const d = await getDoc(doc(this.fs, 'participant content analytics', pid));
      if (!d.exists()) return null;
      return ((d.data()['eiflixseries'] || []) as any[]).map(r => r?.id || r).filter(Boolean);
    } catch (err) {
      console.warn('[content-analytics-v2] all-time series failed', err);
      return null;
    }
  }
  /** A series id named from the catalogue. */
  seriesName(id: string): string { return this.series[id] || id; }

  /** Episode + audio titles (502 + 49 docs) — only the Recommendation tab needs them, so they load with it. */
  private async loadItemNames() {
    this.itemNamesLoaded = true;
    try {
      const [eps, auds] = await Promise.all([
        getDocs(collection(this.fs, 'episodes')),
        getDocs(collection(this.fs, 'solar voice audios')),
      ]);
      eps.docs.forEach(d => { this.itemNames[d.id] = d.data()['title']; });
      auds.docs.forEach(d => { this.itemNames[d.id] = d.data()['name']; });
    } catch (err) {
      console.warn('[content-analytics-v2] item names failed', err);
      this.itemNamesLoaded = false;                          // let the next load retry
    }
  }
  /** An item id named from whichever catalogue holds it. */
  private itemLabel(id: string): string {
    return this.itemNames[id] || this.contentNames[id] || this.series[id] || this.playlists[id] || id.slice(0, 8);
  }
  /** The series / playlist a pushed item came from, for the "Playlist" column. */
  containerLabel(id: string): string { return this.series[id] || this.playlists[id] || ''; }

  private async loadAllTime() {
    const col = collection(this.fs, COL);
    try {
      const [agg, done, first] = await Promise.all([
        getAggregateFromServer(col, { views: count(), watch: sum('totaltimespend') }),
        getCountFromServer(query(col, where('status', '==', 'complete'))),
        getDocs(query(col, orderBy('logdate', 'asc'), limit(1))),
      ]);
      const a = agg.data();
      this.allTime.set({
        views: a.views, watch: a.watch || 0, completed: done.data().count,
        first: first.docs.length ? toMs(first.docs[0].data()['logdate']) : null,
      });
    } catch (err) {
      console.warn('[content-analytics-v2] all-time aggregates failed', err);
    }
  }
}

/* ── value normalisers ── */
/** One `participantsproduct` document. `eventref`'s PATH is what tells a queue from an event. */
function toParticipantProduct(v: Record<string, any>): ParticipantProduct {
  const path = String(v['eventref']?.path || '');
  return {
    profileid: v['profileid'] || '',
    productid: v['productref']?.id || '',
    mode: v['mode'] || '',
    nextmode: v['nextmode'] || '',
    nextmodedate: toMs(v['nextmodedate']) || null,
    activityId: v['eventref']?.id || '',
    activityKind: path.startsWith('queue generation') ? 'queue' : path ? 'event' : '',
  };
}
function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = new Date(v.includes('T') ? v : v.replace(' ', 'T')).getTime(); return isNaN(t) ? 0 : t; }
  return 0;
}
/**
 * Content library. `from` is usually the library, and is the only field that tells a workshop
 * video (`eiflixworkshop`) from an EiFLIX one — but some writers put the screen there instead
 * (`moderecommendation`, `Interim Report`). `type` is always the library, so fall back to it.
 */
function sourceOf(d: Record<string, any>): string {
  const from = String(d['from'] ?? d['contentfrom'] ?? '').toLowerCase();
  if (SOURCES[from] && from !== 'other') return from;
  const type = String(d['type'] ?? d['contenttype'] ?? '').toLowerCase();
  if (type === 'eiflix') return 'eiflixcontent';
  return SOURCES[type] && type !== 'other' ? type : 'other';
}
function toNum(v: any): number { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : 0; }
/** "0:12:34.567000" (Dart Duration.toString) or "754" (seconds). */
export function parsePosition(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (!s.includes(':')) return toNum(s);
  let secs = 0;
  for (const p of s.split(':')) secs = secs * 60 + (parseFloat(p) || 0);
  return secs;
}
function normPlatform(v: any): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'ios';
  if (s.includes('android')) return 'android';
  if (s.includes('web')) return 'web';
  return s;
}

interface Col { k: string; l: string; cls?: string; }

/* ── Recommendation tab rows (live) ── */
/** `nodate` = the push carries no `expiredate`, which is 80% of them — it is never "missed". */
type RecState = 'open' | 'closed' | 'nodate';
interface RecItemRow extends RecItem { plays: PlayEvent[]; opened: boolean; done: boolean; best: number; watch: number; }
interface RecRow extends Omit<RecPush, 'items'> {
  items: RecItemRow[]; total: number; done: number; opened: number; watch: number; prog: number;
  left: number | null; state: RecState; name: string; journey: string;
}
interface RecPlaylist {
  id: string; label: string; types: string[]; all: RecRow[]; people: Set<string>;
  items: number; done: number; opened: number; watch: number; fin: number;
}
interface RecPerson { pid: string; n: string; j: string; all: RecRow[]; items: number; done: number; watch: number; }
interface RecContentRow {
  key: string; label: string; type: string; container: string;
  pushed: number; opened: number; done: number; watch: number; reach: number; plays: PlayEvent[];
}
/* ── EiFLIX tier rows (live) ── */
/** The bucket for participants whose `participant metadata.tier` is empty (37% of documents). */
const TIERLESS = '__tierless__';
interface TierRowLive extends TierPerson {
  open: number; openSeries: SeriesDef[]; eps: number; epsDone: number; done: number;
  epsPct: number; consumed: number; pct: number; tierNames: string[];
}

type SendChannel = 'whatsapp' | 'email' | 'notification';
/** A selected person, as the app's communication dialogs want them. */
interface Recipient { profileid: string; name: string; metadata: any; }
interface Drill { label: string; kind: DrillKind; rows: any[]; }

const PAGE = 25;

/**
 * Click start, click end — nothing else. Material's default range strategy also lets a press inside the
 * selected range DRAG the whole range, and that move ignores [max]: in testing a click on a date inside the
 * current range shifted it to Sep 12 → Oct 1 (future). Leaving out createDrag disables the drag.
 */
@Injectable()
export class ClickOnlyRangeStrategy<D> implements MatDateRangeSelectionStrategy<D> {
  private readonly base = new DefaultMatCalendarRangeStrategy<D>(inject(DateAdapter) as DateAdapter<D>);
  selectionFinished(date: D | null, range: DateRange<D>): DateRange<D> { return this.base.selectionFinished(date as D, range); }
  createPreview(active: D | null, range: DateRange<D>): DateRange<D> { return this.base.createPreview(active, range); }
}
const DRILL_CAP = 250;

/**
 * Content Analytics v2 — every tab reads live Firestore through ContentAnalyticsV2Live.
 *   Activity log / By content / By participant   `content analytics`
 *   Mode based                                   `participantsproduct` (per scope) + products / modes / shelf
 *   Recommendation based                         `recommended mix playlist`
 *   EiFLIX tier based                            `tier` + `series.tier` + `participant metadata.tier`
 * What each tab can and cannot claim from that data is written up in
 * specs/journals/2026-09-22-content-analytics-v2-design.md — read it before changing a number.
 */
@Component({
  selector: 'app-content-analytics-v2',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDatepickerModule],
  templateUrl: './content-analytics-v2.component.html',
  styleUrl: './content-analytics-v2.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ContentAnalyticsV2Live, { provide: MAT_DATE_RANGE_SELECTION_STRATEGY, useClass: ClickOnlyRangeStrategy }],
})
export class ContentAnalyticsV2Component {
  /** Live play logs for the log / content / participant tabs. */
  readonly live = inject(ContentAnalyticsV2Live);
  /* ── Communication: the app's own dialogs, opened straight from here ── */
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly guard = inject(AuthguardService);
  private readonly snackbar = inject(SnackbarService);
  private readonly fsDefault = getFirestore();
  /* ── Reference config + formatters for the template ── */
  readonly sources = SOURCES; readonly sourceKeys = Object.keys(SOURCES).filter(k => k !== 'other');
  readonly platform = PLATFORM; readonly status = STATUS;
  readonly pushFlagDef = PUSH_FLAG; readonly bands = BANDS; readonly kindNoun = KIND_NOUN;
  readonly recType = REC_TYPE;
  readonly scopeByDef = SCOPE_BY; readonly scopeKeys = Object.keys(SCOPE_BY) as ScopeBy[];
  readonly windows = [7, 10, 14, 30];
  readonly drillCap = DRILL_CAP;
  readonly dur = dur; readonly durLong = durLong; readonly fmtDate = fmtDate; readonly pct = pct; readonly num = num;
  readonly reachColor = reachColor; readonly shortDay = shortDay; readonly iso = iso;
  readonly statusOf = statusOf; readonly reachOf = reachOf;
  readonly max = Math.max;

  // Via is hidden: nothing in `content analytics` records the app surface a play started from.
  // Platform only appears when some row actually carries one — no writer sets it today.
  readonly logCols = computed<Col[]>(() => [
    { k: 'ts', l: 'When' }, { k: 'name', l: 'Participant' }, { k: 'video', l: 'Content' }, { k: 'cont', l: 'Playlist / Series' },
    { k: 'src', l: 'Source' }, { k: 'rt', l: 'Overall Duration', cls: 'num' },
    { k: 'exit', l: 'Dropped at', cls: 'num' }, { k: 'spent', l: 'Spend time', cls: 'num' },
    ...(this.hasPlatform() ? [{ k: 'platform', l: 'Platform' }] : []),
    { k: 'status', l: 'Outcome' },
  ]);
  readonly videoCols: Col[] = [
    { k: 'video', l: 'Content' }, { k: 'src', l: 'Source' }, { k: 'rt', l: 'Overall Duration', cls: 'num' },
    { k: 'views', l: 'Total views', cls: 'num' }, { k: 'viewers', l: 'Unique viewers', cls: 'num' },
    { k: 'rewatch', l: 'Rewatches', cls: 'num' }, { k: 'avgReach', l: 'Average consumption', cls: 'num' },
    { k: 'doneN', l: 'Completed', cls: 'num' }, { k: 'midN', l: 'Partly watched', cls: 'num' },
    { k: 'watch', l: 'Watch time', cls: 'num' },
  ];
  readonly recPeopleCols = computed<Col[]>(() => [
    { k: '', l: 'Participant' },
    ...(this.hasJourney() ? [{ k: '', l: 'Journey' }] : []),
    { k: '', l: 'Playlists', cls: 'num' }, { k: '', l: 'Items done', cls: 'num' },
    { k: '', l: 'Progress', cls: 'num' }, { k: '', l: 'Finished', cls: 'num' }, { k: '', l: 'Closed unfinished', cls: 'num' },
    { k: '', l: 'Closing soon', cls: 'num' }, { k: '', l: 'Standing', cls: 'num' },
  ]);
  readonly recContentCols: Col[] = [
    { k: '', l: 'Content' }, { k: '', l: 'In playlist' }, { k: '', l: 'Type' }, { k: '', l: 'Pushed to', cls: 'num' },
    { k: '', l: 'Opened by', cls: 'num' }, { k: '', l: 'Finished by', cls: 'num' }, { k: '', l: 'Open rate', cls: 'num' },
    { k: '', l: 'Avg reach', cls: 'num' }, { k: '', l: 'Watch time', cls: 'num' },
  ];
  readonly tierOverviewCols: Col[] = [
    { k: '', l: 'Tier' }, { k: '', l: 'Participants', cls: 'num' }, { k: '', l: 'Series available', cls: 'num' },
    { k: '', l: 'Avg series completed', cls: 'num' }, { k: '', l: 'Videos watched', cls: 'num' },
  ];
  readonly tierPeopleCols: Col[] = [
    { k: '', l: 'Participant' }, { k: '', l: 'Tier' }, { k: '', l: 'Series available', cls: 'num' },
    { k: '', l: 'Series completed', cls: 'num' }, { k: '', l: 'Videos completed', cls: 'num' },
    { k: '', l: 'Consumed', cls: 'num' }, { k: '', l: 'All-time', cls: 'num' },
  ];
  readonly tierSeriesCols: Col[] = [
    { k: '', l: 'Series' }, { k: '', l: 'Open to', }, { k: '', l: 'Videos', cls: 'num' },
    { k: '', l: 'Have access', cls: 'num' }, { k: '', l: 'Completed it', cls: 'num' },
    { k: '', l: 'Videos completed', cls: 'num' }, { k: '', l: 'Consumed', cls: 'num' }, { k: '', l: 'Completion', cls: 'num' },
  ];

  /* ══ State ══════════════════════════════════════════════════════════ */
  readonly view = signal<ViewKey>('log');
  readonly from = signal(0);
  readonly to = signal(0);
  readonly preset = signal<number | null>(7);
  readonly q = signal(''); readonly src = signal(''); readonly viaF = signal(''); readonly st = signal('');
  readonly pl = signal(''); readonly min = signal(0);
  readonly page = signal(PAGE);
  readonly sort = signal<Record<'log' | 'video' | 'person', [string, SortDir]>>({
    log: ['ts', 'desc'], video: ['watch', 'desc'], person: ['watch', 'desc'],
  });
  readonly cband = signal<BandKey>('all');
  readonly openContent = signal<string | null>(null);
  readonly tier = signal<string>('');   // '' = all tiers, TIERLESS, or a tier id
  readonly tlist = signal<TierList>('people');
  readonly sel = signal<Set<string>>(new Set());
  readonly scopeBy = signal<ScopeBy>('event');
  /** Empty until the catalogues land — the first real event / product is selected then (see constructor). */
  readonly activity = signal('');
  readonly openPerson = signal<string | null>(null);
  readonly openRec = signal<string | null>(null);
  readonly rlist = signal<ListKind>('people');
  readonly mlist = signal<ListKind>('people');
  readonly product = signal('');
  readonly mmode = signal('');
  readonly shiftWin = signal(10);

  readonly drill = signal<Drill | null>(null);
  readonly insKey = signal<string | null>(null);
  readonly retHover = signal<{ i: number; px: number; py: number; scale: number } | null>(null);
  readonly sending = signal<SendChannel | null>(null);

  constructor() {
    this.setPeriod(7);
    // (re)subscribe to the live logs whenever the period changes
    effect(() => { const f = this.from(), t = this.to(); untracked(() => this.live.watch(f, t)); });
    // pushed playlists follow the same period, but only once the tab has been opened
    effect(() => {
      const f = this.from(), t = this.to();
      if (this.view() !== 'rec' && !this.live.recs()) return;
      untracked(() => this.live.loadRecs(f, t));
    });

    /*
     * Mode tab: fetch the people of the SELECTED scope only. `participantsproduct` is ~38.5k documents —
     * reading it whole to draw one product's ladder is what froze the browser. This fires on the cascade
     * (Event / Queue / product) and on the forecast window, which is the fallback bound when a product is
     * bigger than the cap. Each scope is cached, so going back to one costs nothing.
     */
    effect(() => {
      if (this.view() !== 'mode') return;
      if (!this.live.modeData()) return;                 // catalogues not in yet
      const by = this.scopeBy(), win = this.shiftWin();
      // Nothing is auto-selected (operator decision 2026-09-23): opening the tab must not read a single
      // participant product. The first query fires when an Event, Queue or product is actually picked.
      const id = by === 'other' ? this.product() : this.activity();
      if (!id) return;
      untracked(() => this.live.loadScope(by, id, win));
    });
  }

  /* ══ Derived ════════════════════════════════════════════════════════ */
  readonly filters = computed<Filters>(() => ({ q: this.q(), src: this.src(), st: this.st(), pl: this.pl(), min: this.min() }));
  readonly anyFilter = computed(() => { const f = this.filters(); return !!(f.q.trim() || f.src || f.st || f.pl || f.min); });
  /** Live plays in the period, after the filter bar. */
  readonly rows = computed(() => {
    const a = dayStart(this.from()), b = dayEnd(this.to()) + 999, f = this.filters();
    return this.live.events().filter(e => e.ts >= a && e.ts <= b && matchNonDate(e, f));
  });
  /** Everyone mid-play right now — its own listener, so it ignores the selected period and the filters. */
  readonly liveEvents = computed(() => this.live.nowPlaying());
  /** Tabs that carry their own scope, so the filter bar does not apply to them. */
  readonly bare = computed(() => ['mode', 'rec', 'tier'].includes(this.view()));
  readonly videoRollup = computed(() => rollupVideos(this.rows()));
  readonly personCount = computed(() => new Set(this.rows().map(personKey)).size);
  readonly toYear = computed(() => new Date(this.to()).getFullYear());
  /** Platform values actually present — the field is free text across writers. */
  readonly platformOpts = computed(() => [...new Set(this.live.events().map(e => e.platform).filter(Boolean))].sort());
  readonly hasPlatform = computed(() => this.platformOpts().length > 0);
  /** Journey needs `participant metadata` — hidden while that lookup is unavailable (e.g. signed out). */
  readonly hasJourney = computed(() => this.live.events().some(e => !!e.journeyName));
  /** Library columns on By participant: the fixed five, plus "Other" only when an unknown `from` shows up. */
  readonly personSrcKeys = computed(() => this.rows().some(e => e.src === 'other') ? [...this.sourceKeys, 'other'] : this.sourceKeys);
  readonly personCols = computed<Col[]>(() => [
    { k: 'name', l: 'Participant' },
    ...(this.hasJourney() ? [{ k: 'journeyName', l: 'Journey' }] : []),
    ...this.personSrcKeys().map(k => ({ k: 'src_' + k, l: SOURCES[k].short, cls: 'num' })),
    { k: 'unique', l: 'Total number of content', cls: 'num' }, { k: 'views', l: 'Views', cls: 'num' },
    { k: 'watch', l: 'Watch time', cls: 'num' }, { k: 'last', l: 'Last active', cls: 'num' },
  ]);

  readonly tiles = computed(() => {
    const rows = this.rows();
    const viewers = new Set(rows.map(personKey)).size;
    const watch = rows.reduce((a, r) => a + r.spent, 0);
    const done = rows.filter(r => statusOf(r) === 'completed').length;
    const spans = rows.map(r => r.spent).sort((a, b) => a - b);
    const days = daySpan(this.from(), this.to());
    // prior-window count is a server-side aggregate over ALL plays, so it only compares when no filter is on,
    // and only when the data reaches back far enough to cover that window
    const prev = this.live.prevCount(), first = this.live.allTime()?.first ?? null;
    const covered = first !== null && dayStart(this.from()) - days * DAY >= dayStart(first);
    const loading = this.live.loading();
    const delta = !loading && !this.anyFilter() && covered && prev ? (rows.length - prev) / prev : null;
    return {
      days, viewers, views: rows.length, watch, delta, done,
      deltaNote: loading ? 'comparing…' : this.anyFilter() ? 'no comparison while filtered' : 'no prior period',
      deltaPct: delta === null ? 0 : Math.abs(Math.round(delta * 100)),
      med: spans.length ? spans[Math.floor(spans.length / 2)] : 0,
      per: viewers ? watch / viewers : 0,
      each: (rows.length / (viewers || 1)).toFixed(1),
      completion: rows.length ? pct(done / rows.length) : '—',
      completedRows: rows.filter(r => statusOf(r) === 'completed'),
    };
  });

  /** Lifetime totals — server-side count/sum aggregates; ignores the period and every filter. */
  readonly allTime = computed(() => {
    const a = this.live.allTime();
    return a ? { ...a, completion: a.views ? a.completed / a.views : 0 } : null;
  });

  readonly chips = computed(() => {
    const on: { key: string; label: string }[] = [];
    if (this.q()) on.push({ key: 'q', label: `“${this.q()}”` });
    if (this.src()) on.push({ key: 'src', label: SOURCES[this.src()].label });
    if (this.st()) on.push({ key: 'st', label: STATUS[this.st() as keyof typeof STATUS].label });
    if (this.pl()) on.push({ key: 'pl', label: PLATFORM[this.pl()] || this.pl() });
    if (this.min()) on.push({ key: 'min', label: `Over ${dur(this.min())}` });
    return on;
  });

  /* ── Activity log ── */
  readonly logVM = computed(() => {
    const [sk, sd] = this.sort().log;
    const val: Record<string, (r: PlayEvent) => any> = {
      ts: r => r.ts, name: r => r.name.toLowerCase(), video: r => r.video.toLowerCase(), src: r => SOURCES[r.src].label,
      cont: r => { const c = r.cont; return c ? c.kind + '|' + c.label : '~'; },
      exit: r => r.exit, spent: r => r.spent, rt: r => r.rt, platform: r => r.platform,
      status: r => ({ progress: 0, completed: 1, live: 2 })[statusOf(r)],
    };
    const f = val[sk], m = sd === 'asc' ? 1 : -1;
    const sorted = [...this.rows()].sort((a, b) => { const x = f(a), y = f(b); return x < y ? -m : x > y ? m : 0; });
    return { sk, sd, page: sorted.slice(0, this.page()) };
  });

  /* ── By content ── */
  readonly videoVM = computed(() => {
    const [sk, sd] = this.sort().video, m = sd === 'asc' ? 1 : -1;
    const all = this.videoRollup();
    const counts: Record<BandKey, number> = { all: all.length, none: 0, low: 0, ok: 0 };
    all.forEach(o => counts[o.band]++);
    const band = this.cband();
    const list = all.filter(o => band === 'all' || o.band === band)
      .sort((a: any, b: any) => (a[sk] < b[sk] ? -m : a[sk] > b[sk] ? m : 0));
    return { sk, sd, counts, list, needs: counts.none + counts.low };
  });

  /* ── By participant ── */
  readonly personVM = computed(() => {
    const [sk, sd] = this.sort().person, m = sd === 'asc' ? 1 : -1;
    const key = (o: any) => sk.startsWith('src_') ? o.srcCounts[sk.slice(4)] : o[sk];
    const list = rollupPeople(this.rows()).sort((a, b) => (key(a) < key(b) ? -m : key(a) > key(b) ? m : 0));
    return { sk, sd, list, keys: list.map(o => o.key), labels: Object.fromEntries(list.map(o => [o.key, o.name])) };
  });

  /* ── Mode based (live) ─────────────────────────────────────────────
   * participantsproduct holds `mode` / `nextmode` / `nextmodedate`, so "who moves when" is read, not
   * forecast. Plays are attributed to the participant's mode TODAY (operator decision 2026-09-23) —
   * accurate for a short period, approximate over a long one; the screen says so.
   */
  readonly modeActivities = computed<ActivityDef[]>(() => {
    const md = this.live.modeData();
    if (!md) return [];
    return this.scopeBy() === 'event' ? md.events : this.scopeBy() === 'queue' ? md.queues : [];
  });
  /** The scope the cascade is asking for — the VM only renders once THAT scope's people have landed. */
  readonly scopeKey = computed(() =>
    this.scopeBy() === 'other' ? `product:${this.product()}` : `${this.scopeBy()}:${this.activity()}`);
  /** False until an Event / Queue / product is picked — nothing is fetched before that. */
  readonly hasScopeSel = computed(() => !!(this.scopeBy() === 'other' ? this.product() : this.activity()));

  /* The cascade's own options. Deliberately independent of modeVM: the cascade is what decides which
     participants get fetched, so it has to stay usable while a scope is loading or came back empty. */
  readonly prodOpts = computed<ProductDef[]>(() => {
    const md = this.live.modeData();
    if (!md) return [];
    if (this.scopeBy() === 'other') return md.products;      // any product can be asked for directly
    const sc = this.live.modeScope();                        // an event / queue offers only its own products
    if (!sc || sc.key !== this.scopeKey()) return [];
    const ids = new Set(sc.rows.map(r => r.productid));
    return md.products.filter(p => ids.has(p.id));
  });
  readonly selProduct = computed(() => this.modeVM()?.prod ?? this.product());
  readonly ladderOpts = computed<string[]>(() => {
    const md = this.live.modeData();
    if (!md) return [];
    const P = md.products.find(p => p.id === this.selProduct());
    return (P?.modeflow?.length ? P.modeflow : md.modes).filter((m: string) => !!m);
  });

  readonly modeVM = computed(() => {
    const md = this.live.modeData(), sc = this.live.modeScope();
    // null while THIS selection is still being fetched, and when it holds nobody — the template then
    // keeps the cascade on screen with an empty state, so another scope can be picked.
    if (!md || !sc || sc.key !== this.scopeKey() || !sc.rows.length) return null;
    const by = this.scopeBy(), win = this.shiftWin(), mm = this.mmode();

    // one scope's participants — an event / queue's people, or everyone on one product
    const inScope = sc.rows;
    const productIds = [...new Set(inScope.map(r => r.productid))];
    const prodOpts = by === 'other' ? md.products : md.products.filter(p => productIds.includes(p.id));
    const prod = prodOpts.some(p => p.id === this.product()) ? this.product() : (prodOpts[0]?.id ?? '');
    const P = md.products.find(p => p.id === prod) || null;
    const rows = inScope.filter(r => r.productid === prod);
    const ladder = (P?.modeflow?.length ? P.modeflow : md.modes).filter(m => !!m);

    // plays in the period by these participants, attributed to the mode they are in now
    const modeOfPid: Record<string, string> = {};
    rows.forEach(r => { if (r.mode) modeOfPid[r.profileid] = r.mode; });
    const plays = this.live.events().filter(e => !!e.pid && modeOfPid[e.pid!] !== undefined);
    const playsByMode: Record<string, PlayEvent[]> = {};
    plays.forEach(e => (playsByMode[modeOfPid[e.pid!]] ||= []).push(e));

    const onShelf = (e: PlayEvent, mode: string) => {
      const items = md.shelf[`${prod}|${mode}`] || [];
      return items.some(i => i.key === e.vid || i.key === e.plId);
    };
    const list = ladder.map(mode => {
      const r = playsByMode[mode] || [];
      const watch = r.reduce((a, e) => a + e.spent, 0);
      const onWatch = r.filter(e => onShelf(e, mode)).reduce((a, e) => a + e.spent, 0);
      return {
        key: mode, rows: r, views: r.length, watch, onWatch, onShare: watch ? onWatch / watch : 0,
        people: rows.filter(x => x.mode === mode).length,
        shelf: (md.shelf[`${prod}|${mode}`] || []).length,
      };
    });
    const totW = list.reduce((a, o) => a + o.watch, 0) || 1;
    const totOn = list.reduce((a, o) => a + o.onWatch, 0);

    // who moves next, straight off nextmodedate
    const today = dayStart(Date.now()), cutoff = today + win * DAY;
    const soon = rows.filter(r => r.nextmode && r.nextmodedate !== null && r.nextmodedate >= today && r.nextmodedate <= cutoff);
    const fc: Record<string, { from: string; to: string; n: number; first: number; list: ParticipantProduct[] }> = {};
    soon.forEach(r => {
      const k = r.mode + '>' + r.nextmode;
      const o = (fc[k] ||= { from: r.mode || '—', to: r.nextmode, n: 0, first: r.nextmodedate!, list: [] });
      o.n++; o.list.push(r);
      if (r.nextmodedate! < o.first) o.first = r.nextmodedate!;
    });
    const shifts = Object.values(fc).sort((a, b) => a.first - b.first);

    const shown = rows.filter(r => !mm || r.mode === mm)
      .map(r => ({
        ...r,
        name: this.live.nameOf(r.profileid),
        days: r.nextmodedate !== null ? Math.ceil((r.nextmodedate - today) / DAY) : null,
        plays: plays.filter(e => e.pid === r.profileid).length,
        watch: plays.filter(e => e.pid === r.profileid).reduce((a, e) => a + e.spent, 0),
      }))
      .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999) || a.name.localeCompare(b.name));

    return {
      prod, product: P, prodOpts, ladder, list, rows, shown, soon, shifts,
      moving: soon.length, names: shown.map(r => r.profileid),
      labels: Object.fromEntries(shown.map(r => [r.profileid, r.name])),
      onPct: pct(totOn / totW), plays,
      inScopeCount: rows.filter(r => !mm || r.mode === mm).length,
      // set when the scope was too big to load whole and only the people moving inside the window were read
      partial: sc.partial ? { total: sc.total, win: sc.win } : null,
    };
  });

  /** Content configured for the selected product + mode, with what the period's plays did to it. */
  readonly modeContent = computed(() => {
    const md = this.live.modeData(), vm = this.modeVM();
    if (!md || !vm) return [];
    const modes = this.mmode() ? [this.mmode()] : vm.ladder;
    const out: { key: string; label: string; mode: string; kind: string; widget: string; mandatory: boolean; evs: PlayEvent[]; views: number; viewers: number; finN: number; avgReach: number; watch: number }[] = [];
    modes.forEach(mode => {
      (md.shelf[`${vm.prod}|${mode}`] || []).forEach(item => {
        const evs = vm.plays.filter(e => e.vid === item.key || e.plId === item.key);
        const people = new Set(evs.map(e => e.pid));
        const fin = new Set(evs.filter(e => isComplete(e)).map(e => e.pid));
        out.push({
          key: item.key, label: item.label, mode, kind: item.kind, widget: item.widget, mandatory: item.mandatory, evs,
          views: evs.length, viewers: people.size, finN: fin.size,
          avgReach: evs.length ? evs.reduce((a, e) => a + reachOf(e), 0) / evs.length : 0,
          watch: evs.reduce((a, e) => a + e.spent, 0),
        });
      });
    });
    return out.sort((a, b) => b.watch - a.watch || a.label.localeCompare(b.label));
  });

  /** A playlist's colour comes from the content types it carried; mixed pushes read as neutral. */
  recTypeColor(types: string[]): string {
    const known = types.filter(t => REC_TYPE[t]);
    return known.length === 1 ? REC_TYPE[known[0]].color : '#6B7280';
  }

  /** A stable colour per mode, so the ladder reads like the design without a hard-coded mode list. */
  private readonly modePalette = ['#8A8F98', '#0076C8', '#6D029A', '#BE1484', '#16A34A', '#B45309', '#0E7490', '#7C3AED'];
  modeColor(mode: string): string {
    const md = this.live.modeData();
    const i = md ? md.modes.indexOf(mode) : -1;
    return this.modePalette[(i < 0 ? mode.length : i) % this.modePalette.length];
  }

  /* ── Recommendation based ── */
  /**
   * Every push in the period, with what the participant actually did to its items.
   *
   * Completion is DERIVED from plays, not read from `completedcontent` / `completedplaylist`: those carry
   * 9% / 3% fill, so trusting them would report nearly every push as untouched (operator decision
   * 2026-09-23). The same rule as the rest of the screen applies — `isComplete` on the play.
   */
  readonly recRows = computed<RecRow[]>(() => {
    const src = this.live.recs();
    if (!src) return [];
    // the period's plays, indexed by participant → content id
    const byPerson = new Map<string, Map<string, PlayEvent[]>>();
    this.live.events().forEach(e => {
      if (!e.pid) return;
      const m = byPerson.get(e.pid) ?? new Map<string, PlayEvent[]>();
      if (e.vid) { const l = m.get(e.vid); l ? l.push(e) : m.set(e.vid, [e]); }
      byPerson.set(e.pid, m);
    });
    const today = dayStart(Date.now());

    return src.map(p => {
      const mine = byPerson.get(p.pid);
      const items = p.items.map(i => {
        const plays = mine?.get(i.key) ?? [];
        const best = plays.length ? Math.max(...plays.map(reachOf)) : 0;
        return {
          ...i, plays, opened: plays.length > 0, done: plays.some(isComplete), best,
          watch: plays.reduce((a, e) => a + e.spent, 0),
        };
      });
      const total = items.length, done = items.filter(i => i.done).length;
      const left = p.end === null ? null : Math.ceil((p.end - today) / DAY);
      const state: RecState = p.end === null ? 'nodate' : left! < 0 ? 'closed' : 'open';
      return {
        ...p, items, total, done, opened: items.filter(i => i.opened).length,
        watch: items.reduce((a, i) => a + i.watch, 0), prog: total ? done / total : 0,
        left, state, name: this.live.nameOf(p.pid), journey: this.live.journeyName(p.pid),
      };
    });
  });

  readonly recVM = computed(() => {
    const win = this.shiftWin(), pushes = this.recRows();
    const totItems = pushes.reduce((a, x) => a + x.total, 0) || 1;
    const totDone = pushes.reduce((a, x) => a + x.done, 0);

    // per playlist (the buffer group), across everyone it was pushed to
    const plM = new Map<string, RecPlaylist>();
    pushes.forEach(x => {
      const o = plM.get(x.plId) ?? { id: x.plId, label: x.title, types: [] as string[], all: [] as RecRow[], people: new Set<string>(), items: 0, done: 0, opened: 0, watch: 0, fin: 0 } as RecPlaylist;
      o.all.push(x); o.people.add(x.pid);
      x.types.forEach(t => { if (!o.types.includes(t)) o.types.push(t); });
      o.items += x.total; o.done += x.done; o.opened += x.opened; o.watch += x.watch;
      if (x.total && x.done === x.total) o.fin++;
      plM.set(x.plId, o);
    });
    const pls = [...plM.values()].map(o => ({
      ...o, pushed: o.all.length, peopleN: o.people.size,
      itemRate: o.items ? o.done / o.items : 0, openRate: o.items ? o.opened / o.items : 0,
      finRate: o.all.length ? o.fin / o.all.length : 0,
    })).sort((a, b) => b.pushed - a.pushed || b.itemRate - a.itemRate);

    // per participant
    const pM = new Map<string, RecPerson>();
    pushes.forEach(x => {
      const o = pM.get(x.pid) ?? { pid: x.pid, n: x.name, j: x.journey, all: [] as RecRow[], items: 0, done: 0, watch: 0 } as RecPerson;
      o.all.push(x); o.items += x.total; o.done += x.done; o.watch += x.watch;
      pM.set(x.pid, o);
    });
    const people = [...pM.values()].map(o => {
      const prog = o.items ? o.done / o.items : 0;
      const soon = o.all.filter(x => this.closingSoon(x, win));
      const missed = o.all.filter(x => x.state === 'closed' && x.done < x.total).length;
      const flag: PushFlag = o.items && prog >= 0.7 ? 'complete' : prog >= 0.4 ? 'ontrack' : soon.length ? 'behind' : missed ? 'missed' : 'notyet';
      return {
        ...o, prog, pushed: o.all.length, soon: soon.length,
        complete: o.all.filter(x => x.total && x.done === x.total).length, missed, flag,
      };
    }).sort((a, b) => b.pushed - a.pushed || a.n.localeCompare(b.n));

    // Closing soon — only over the pushes that carry an `expiredate` (20% of them do), which is why the
    // panel prints its own denominator instead of implying the rest are fine.
    const closing = new Map<string, { label: string; types: string[]; n: number; first: number; list: RecRow[] }>();
    pushes.forEach(x => {
      if (!this.closingSoon(x, win)) return;
      const o = closing.get(x.plId) ?? { label: x.title, types: x.types, n: 0, first: x.end!, list: [] as RecRow[] };
      o.n++; o.list.push(x);
      if (x.end! < o.first) o.first = x.end!;
      closing.set(x.plId, o);
    });
    const cl = [...closing.values()].sort((a, b) => a.first - b.first);
    const dated = pushes.filter(x => x.end !== null);

    return {
      pushes, pls, people, names: people.map(r => r.pid),
      labels: Object.fromEntries(people.map(r => [r.pid, r.n])),
      cl, clTotal: cl.reduce((a, o) => a + o.n, 0), clAll: cl.flatMap(o => o.list),
      open: dated.filter(x => x.state === 'open'), dated, undated: pushes.length - dated.length,
      donePct: pct(totDone / totItems), totItems, totDone,
    };
  });
  /** Unfinished, has a close date, and that date falls inside the window. */
  closingSoon(x: RecRow, win: number) {
    return x.state === 'open' && x.left !== null && x.left <= win && x.done < x.total;
  }
  completedOf(all: RecRow[]) { return all.filter(x => x.total && x.done === x.total); }
  countDone(all: RecRow[]) { return this.completedOf(all).length; }
  missedOf(all: RecRow[]) { return all.filter(x => x.state === 'closed' && x.done < x.total); }
  closingOf(all: RecRow[]) { return all.filter(x => this.closingSoon(x, this.shiftWin())); }

  /** One row per content item across every push it appeared in. */
  readonly recContent = computed(() => {
    const m = new Map<string, RecContentRow>();
    this.recRows().forEach(x => x.items.forEach(i => {
      const o = m.get(i.key) ?? {
        key: i.key, label: i.label, type: i.type, container: this.live.containerLabel(i.container),
        pushed: 0, opened: 0, done: 0, watch: 0, reach: 0, plays: [] as PlayEvent[],
      } as RecContentRow;
      o.pushed++; o.watch += i.watch;
      if (i.opened) { o.opened++; o.reach += i.best; o.plays.push(...i.plays); }
      if (i.done) o.done++;
      m.set(i.key, o);
    }));
    return [...m.values()].map(o => ({
      ...o, openRate: o.pushed ? o.opened / o.pushed : 0,
      doneRate: o.pushed ? o.done / o.pushed : 0, avgReach: o.opened ? o.reach / o.opened : 0,
    })).sort((a, b) => b.pushed - a.pushed || a.label.localeCompare(b.label));
  });

  readonly openRecHist = computed(() => {
    const n = this.openRec();
    if (!n) return null;
    const r = this.recVM().people.find(x => x.pid === n);
    return r ? [...r.all].sort((a, b) => b.start - a.start) : null;
  });

  /* ── EiFLIX tier based (all-time) ── */
  /**
   * EiFLIX tiers, live.
   *
   * Access is explicit — `series.tier[]` says which tiers may see each series — so the prototype's
   * "tier N opens base + (N-1)×step series" rule is gone. A participant's `tier` is an ARRAY, so anyone
   * holding two tiers is listed under both (operator decision 2026-09-23, matching the existing
   * viewparticipant-tier-access screen), and the tier counts therefore sum to more than the headcount.
   *
   * Everything measured here is INSIDE THE SELECTED PERIOD. All-time progress needs the
   * `participant content analytics` rollup, read one document at a time from the participant drill.
   */
  readonly tierVM = computed(() => {
    const td = this.live.tierData();
    if (!td) return null;
    const sel = this.tier();                      // '' = all, TIERLESS, or a tier id

    // plays in the period, per participant → set of episode ids they finished, and their reach
    const doneBy = new Map<string, Set<string>>(), reachBy = new Map<string, Map<string, number>>();
    this.live.events().forEach(e => {
      if (!e.pid || !e.vid) return;
      if (isComplete(e)) (doneBy.get(e.pid) ?? doneBy.set(e.pid, new Set()).get(e.pid)!).add(e.vid);
      const m = reachBy.get(e.pid) ?? reachBy.set(e.pid, new Map()).get(e.pid)!;
      m.set(e.vid, Math.max(m.get(e.vid) ?? 0, reachOf(e)));
    });

    const seriesFor = (tiers: string[]) => {
      const set = new Set(tiers);
      return td.series.filter(s => s.tiers.some(t => set.has(t)));
    };

    // one row per participant (their whole entitlement, across every tier they hold)
    const rows: TierRowLive[] = td.people.map(p => {
      const open = seriesFor(p.tiers);
      const eps = open.flatMap(s => s.eps);
      const mine = doneBy.get(p.pid), reach = reachBy.get(p.pid);
      const epsDone = eps.filter(id => mine?.has(id)).length;
      const done = open.filter(s => s.eps.length > 0 && s.eps.every(id => mine?.has(id))).length;
      const consumed = eps.length ? eps.reduce((a, id) => a + (reach?.get(id) ?? 0), 0) / eps.length : 0;
      return {
        ...p, open: open.length, openSeries: open, eps: eps.length, epsDone, done,
        epsPct: eps.length ? epsDone / eps.length : 0, consumed,
        pct: open.length ? done / open.length : 0,
        tierNames: p.tiers.map(t => td.tiers.find(x => x.id === t)?.name || t).filter(Boolean),
      };
    });

    // one row per tier, plus the tierless bucket the legacy screen also shows
    const overview = td.tiers.map(t => {
      const r = rows.filter(x => x.tiers.includes(t.id));
      const open = td.series.filter(s => s.tiers.includes(t.id));
      return {
        id: t.id, name: t.name, r, open: open.length,
        epsOpen: open.reduce((a, s) => a + s.eps.length, 0),
        avg: r.length ? r.reduce((a, x) => a + x.done, 0) / r.length : 0,
        rate: r.length ? r.reduce((a, x) => a + x.epsPct, 0) / r.length : 0,
      };
    });
    const tierless = rows.filter(x => !x.tiers.length);
    if (tierless.length) {
      overview.push({ id: TIERLESS, name: 'Tierless', r: tierless, open: 0, epsOpen: 0, avg: 0, rate: 0 });
    }

    const shown = (sel === '' ? rows : rows.filter(x => sel === TIERLESS ? !x.tiers.length : x.tiers.includes(sel)))
      .sort((a, b) => b.epsDone - a.epsDone || a.name.localeCompare(b.name));

    // series-wise, measured against whoever is currently in scope
    const scope = sel === '' ? rows : shown;
    const inScope = new Set(scope.map(r => r.pid));
    const series = td.series.map(s => {
      const access = scope.filter(r => r.openSeries.some(o => o.id === s.id));
      let epsDone = 0, reachSum = 0, reachN = 0;
      const fin = access.filter(r => {
        const mine = doneBy.get(r.pid), reach = reachBy.get(r.pid);
        const d = s.eps.filter(id => mine?.has(id)).length;
        epsDone += d;
        s.eps.forEach(id => { const v = reach?.get(id); if (v !== undefined) { reachSum += v; reachN++; } });
        return s.eps.length > 0 && d === s.eps.length;
      });
      const epsTot = access.length * s.eps.length;
      return {
        ...s, access, fin, epsDone, epsTot,
        tierNames: s.tiers.map(t => td.tiers.find(x => x.id === t)?.name || t).filter(Boolean),
        consumed: reachN ? reachSum / reachN : 0,
        rate: access.length ? fin.length / access.length : 0,
        inScope: inScope.size,
      };
    }).sort((a, b) => b.fin.length - a.fin.length || a.name.localeCompare(b.name));

    return {
      all: rows, shown: shown.slice(0, this.page()), shownTotal: shown.length,
      names: shown.map(r => r.pid), labels: Object.fromEntries(shown.map(r => [r.pid, r.name])),
      overview, series, tierless: tierless.length,
      active: rows.filter(r => r.epsDone > 0).length,
    };
  });
  readonly tierless = TIERLESS;
  tierLabel(id: string) {
    if (id === TIERLESS) return 'Tierless';
    return this.live.tierData()?.tiers.find(t => t.id === id)?.name || id;
  }

  /** All-time completed series for the open participant — one `participant content analytics` document. */
  readonly tierAllTime = signal<{ pid: string; name: string; series: string[] | null; loading: boolean } | null>(null);
  async openAllTime(ev: Event, r: { pid: string; name: string }) {
    ev.stopPropagation();
    this.tierAllTime.set({ pid: r.pid, name: r.name, series: null, loading: true });
    const ids = await this.live.allTimeSeries(r.pid);
    if (this.tierAllTime()?.pid === r.pid) this.tierAllTime.set({ pid: r.pid, name: r.name, series: ids, loading: false });
  }
  closeAllTime() { this.tierAllTime.set(null); }
  seriesNameOf(id: string) { return this.live.seriesName(id); }

  /* ── Content insights modal ── */
  readonly insights = computed(() => {
    const key = this.insKey(); if (!key) return null;
    const o = this.videoRollup().find(x => x.key === key); if (!o) return null;
    const half = o.views ? o.evs.filter(e => e.pos >= o.rt * 0.5).length / o.views : 0;
    return {
      o, half, ret: this.retention(o.rt, o.evs, o.views), daily: this.daily(o.evs),
      from: hbars(o.groups.map(g => ({
        label: g.label, v: g.avgReach, color: g.kind === 'playlist' ? '#6D029A' : g.kind === 'series' ? '#6B7280' : '#D4D3CE',
        square: g.kind === 'playlist', text: pct(g.avgReach), em: '· ' + g.views,
      }))),
    };
  });

  /** Audience retention: share of plays still going at each point of the item. */
  private retention(rt: number, evs: PlayEvent[], views: number) {
    const W = 920, H = 214, L = 46, R = 16, T = 12, B = 30, pw = W - L - R, ph = H - T - B, N = 60;
    const pts: number[] = [];
    for (let i = 0; i <= N; i++) { const t = rt * i / N; pts.push(views ? evs.filter(e => e.pos >= t).length / views : 0); }
    const X = (i: number) => L + pw * i / N, Y = (v: number) => T + ph * (1 - v);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return {
      W, H, L, R, T, ph, pw, N, pts, rt, line, area: `${line} L${X(N).toFixed(1)},${T + ph} L${L},${T + ph} Z`,
      grid: [0, .25, .5, .75, 1].map(v => ({ y: Y(v), label: Math.round(v * 100) + '%' })),
      xlab: [0, .25, .5, .75, 1].map(f => ({ x: L + pw * f, anchor: f === 0 ? 'start' : f === 1 ? 'end' : 'middle', label: dur(rt * f) })),
    };
  }
  /** Plays per day across the selected period. */
  private daily(evs: PlayEvent[]) {
    const days: number[] = [];
    for (let d = dayStart(this.from()); d <= dayEnd(this.to()); d = new Date(new Date(d).setDate(new Date(d).getDate() + 1)).getTime()) days.push(d);
    const counts = days.map(d => evs.filter(e => e.ts >= dayStart(d) && e.ts <= dayEnd(d)).length);
    const peak = Math.max(1, ...counts);
    const W = 920, H = 150, L = 34, R = 12, T = 10, B = 24, pw = W - L - R, ph = H - T - B;
    const bw = Math.max(1.5, pw / days.length - 2);
    return {
      W, H, L, R, T, ph, peak, first: shortDay(days[0]), last: shortDay(days[days.length - 1]),
      bars: counts.map((c, i) => {
        const h = ph * c / peak;
        return {
          x: (L + pw * i / days.length).toFixed(1), y: (T + ph - h).toFixed(1), w: bw.toFixed(1), h: Math.max(c ? 1.5 : 0, h).toFixed(1),
          rx: Math.min(2, bw / 2), op: c ? 1 : .15, title: `${shortDay(days[i])} · ${c} view${c === 1 ? '' : 's'}`,
        };
      }),
    };
  }
  retMove(ev: MouseEvent, svg: SVGSVGElement) {
    const ins = this.insights(); if (!ins) return;
    const d = ins.ret, r = svg.getBoundingClientRect();
    if (!r.width) return;                       // laid out yet? otherwise the maths goes NaN
    const scale = d.W / r.width, x = (ev.clientX - r.left) * scale;
    const i = Math.max(0, Math.min(d.N, Math.round((x - d.L) / d.pw * d.N)));
    this.retHover.set({ i, px: d.L + d.pw * i / d.N, py: d.T + d.ph * (1 - d.pts[i]), scale });
  }

  /* ══ Actions ════════════════════════════════════════════════════════ */
  setView(v: ViewKey) {
    this.view.set(v); this.page.set(PAGE);
    if (v === 'mode') this.live.loadModeData();      // lazy: the mode collections load on first visit
    if (v === 'rec') this.live.loadRecs(this.from(), this.to());
    if (v === 'tier') this.live.loadTierData();
  }
  setPeriod(days: number) {
    const to = dayStart(Date.now());
    const f = new Date(to); f.setDate(f.getDate() - (days - 1));
    this.from.set(f.getTime()); this.to.set(to); this.preset.set(days); this.page.set(PAGE);
    this.syncRange();
  }

  /* ── Custom range: Material date range picker ── */
  readonly range = new FormGroup({ start: new FormControl<Date | null>(null), end: new FormControl<Date | null>(null) });
  readonly maxDate = new Date(dayStart(Date.now()));
  /** Put the picker back on the applied period (after a preset, or when a pick is abandoned half-way). */
  private syncRange() { this.syncRangeTo(this.from(), this.to()); }
  private syncRangeTo(a: number, b: number) {
    this.range.setValue({ start: new Date(a), end: new Date(b) }, { emitEvent: false });
  }
  /** True while the calendar is open — picks there are applied once, on close, not per click. */
  pickerOpen = false;
  /**
   * Apply the picked range — only once both ends are set. Typed dates arrive through the inputs' dateChange
   * (fires on blur / Enter, so half-typed dates never re-query); calendar picks arrive through onPickerClosed.
   * A custom range drops the preset highlight unless it lines up with one.
   */
  commitRange(fromPicker = false) {
    if (this.pickerOpen && !fromPicker) return;
    const { start, end } = this.range.value;
    if (!start || !end || isNaN(+start) || isNaN(+end)) return;
    const today = dayStart(Date.now());
    let a = dayStart(start.getTime()), b = dayStart(end.getTime());
    if (a > b) [a, b] = [b, a];
    // never query the future, whatever the input produced
    if (b > today) b = today;
    if (a > today) a = today;
    if (b !== dayStart(end.getTime()) || a !== dayStart(start.getTime())) this.syncRangeTo(a, b);
    if (a === this.from() && b === this.to()) return;
    this.from.set(a); this.to.set(b); this.page.set(PAGE);
    const span = daySpan(a, b);
    this.preset.set([7, 14, 30, 90].includes(span) && iso(b) === iso(Date.now()) ? span : null);
  }
  onPickerClosed() {
    this.pickerOpen = false;
    const { start, end } = this.range.value;
    if (!start || !end) this.syncRange();       // abandoned half-way — put the applied period back
    else this.commitRange(true);
  }
  setFilter(k: 'q' | 'src' | 'via' | 'st' | 'pl', v: string) {
    ({ q: this.q, src: this.src, via: this.viaF, st: this.st, pl: this.pl })[k].set(v ?? '');
    this.page.set(PAGE);
  }
  setMin(v: number) { this.min.set(+v || 0); this.page.set(PAGE); }
  clearChip(k: string) {
    if (k === 'min') this.min.set(0); else this.setFilter(k as 'q', '');
  }
  clearAll() {
    this.q.set(''); this.src.set(''); this.viaF.set(''); this.st.set(''); this.pl.set(''); this.mmode.set(''); this.min.set(0); this.page.set(PAGE);
  }
  more() { this.page.update(p => p + PAGE); }
  sortBy(v: 'log' | 'video' | 'person', k: string) {
    this.sort.update(s => {
      const cur = s[v];
      return { ...s, [v]: cur && cur[0] === k ? [k, cur[1] === 'asc' ? 'desc' : 'asc'] : [k, 'desc'] };
    });
  }
  tip(label: string): string | null { return TIPS[label] || null; }
  platformLabel(p: string) { return PLATFORM[p] || p || '—'; }
  /** The Journey column only appears once `participant metadata` + `journey` have resolved a name. */
  readonly drillHasJourney = computed(() => this.drillRows().some((o: any) => !!o.journeyName));
  isDoneRow(o: { done: boolean; best: number }) { return o.done || o.best >= 0.9; }
  fmtYear(ms: number) { return new Date(ms).getFullYear(); }
  toArr<T>(s: Set<T>): T[] { return [...s]; }
  countZero(rows: { views: number }[]) { return rows.filter(o => o.views === 0).length; }
  countUnopened(rows: { opened: number }[]) { return rows.filter(o => o.opened === 0).length; }

  toggleContent(v: string) { this.openContent.update(c => c === v ? null : v); }
  togglePerson(n: string) { this.openPerson.update(c => c === n ? null : n); }
  toggleRec(n: string) { this.openRec.update(c => c === n ? null : n); }

  /* ── Scope cascade (shared by Mode + Recommendation) ── */
  /**
   * The cascade only records the selection — the effect in the constructor fetches it. Switching what we
   * scope BY clears the selection: an event id means nothing to a queue, and on "Others" the product is
   * the query key, so it has to be chosen deliberately rather than carried over.
   */
  setScopeBy(by: ScopeBy) { this.scopeBy.set(by); this.activity.set(''); this.product.set(''); this.mmode.set(''); }
  setActivity(id: string) { this.activity.set(id); this.mmode.set(''); }
  setProduct(k: string) { this.product.set(k); this.mmode.set(''); }

  /* ── Selection + communication ── */
  isSel(n: string) { return this.sel().has(n); }
  allSel(names: string[]) { const s = this.sel(); return names.length > 0 && names.every(n => s.has(n)); }
  /** Selection is keyed by profileid on the live tabs (names aren't unique); labels are what the composer shows. */
  private readonly selLabel = new Map<string, string>();
  toggleSel(n: string, on: boolean, label?: string) {
    if (label) this.selLabel.set(n, label);
    this.sel.update(s => { const x = new Set(s); on ? x.add(n) : x.delete(n); return x; });
  }
  toggleAll(names: string[], on: boolean, labels?: Record<string, string>) {
    if (labels) names.forEach(n => this.selLabel.set(n, labels[n]));
    this.sel.update(s => { const x = new Set(s); names.forEach(n => on ? x.add(n) : x.delete(n)); return x; });
  }
  clearSel() { this.sel.set(new Set()); }
  readonly selNames = computed(() => [...this.sel()].map(k => ({ key: k, label: this.selLabel.get(k) || k })));
  /** Recipients for the selected people, with their metadata (email / phone) attached. */
  private recipients(): Recipient[] {
    return this.live.recipientsFor([...this.sel()], k => this.selLabel.get(k) || k);
  }
  /** Opens the app's own composer for the chosen channel. Each dialog carries the send itself from there. */
  async send(channel: SendChannel) {
    if (!this.sel().size || this.sending()) return;
    this.sending.set(channel);
    try {
      const list = this.recipients();
      if (channel === 'whatsapp') await this.sendWhatsapp(list);
      else if (channel === 'email') await this.sendEmail(list);
      else await this.sendNotification(list);
    } finally {
      this.sending.set(null);
    }
  }

  /**
   * WhatsApp — the WATI composer Participants Analytics uses (pick a template, fill its parameters, send
   * now / queue / schedule). It posts to WATI and writes `wati archive` itself, so nothing is sent here.
   */
  private async sendWhatsapp(list: Recipient[]) {
    const { WatiInputComponent } = await import(
      '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component'
    );
    const ref = this.dialog.open(WatiInputComponent, {
      data: { selectedParticipants: list, communicationDoc: null },
      width: '70vw', height: '80vh', disableClose: true,
    });
    ref.afterClosed().subscribe((result: any) => {
      const status = typeof result === 'string' ? result : result?.status;
      if (status === 'sent' || status === 'success') this.snackbar.show('WhatsApp message sent');
      else if (status === 'scheduled') this.snackbar.show('WhatsApp message scheduled');
      else if (status === 'failed') this.snackbar.show('Sending WhatsApp message failed');
      // 'queued' and a plain close already say so in the dialog
    });
  }

  /** Email — the same composer and follow-up the workshop dashboard and Participants Analytics use. */
  private async sendEmail(list: Recipient[]) {
    // EmailInputComponent reads `profileid`, `email` and `name` off each entry
    const recipients = list
      .filter(p => p.metadata?.['email'])
      .map(p => ({ ...p.metadata, profileid: p.profileid, name: p.name || p.metadata?.['name'], email: p.metadata['email'] }));
    if (!recipients.length) { this.snackbar.show('No valid recipients found'); return; }

    const { EmailInputComponent } = await import(
      '../../Participants Profile Management/participants-analytics/email-input/email-input.component'
    );
    const ref = this.dialog.open(EmailInputComponent, { data: recipients, minWidth: '600px', disableClose: true });
    ref.afterClosed().subscribe(async result => {
      if (result == null) return;
      if (result['status'] === 'queued' || result['status'] === 'send') {
        const docRef = doc(collection(this.fsDefault, 'email archive'), result['docid']);
        await setDoc(docRef, result, { merge: true })
          .then(() => this.snackbar.show(result['status'] === 'queued' ? 'Successfully Added to Queue' : 'Email Sent Successfully'))
          .catch(err => { console.log(err); this.snackbar.show('Error Sending Email'); });
      } else if (result['status'] === 'validated') {
        const project = environment.firebase.projectId;
        const url = project === 'starlabs-test' ? 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail'
          : project === 'fir-sample-aae4a' ? 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail' : '';
        if (!url) return;
        result['archiveid'] = result['docid'];
        this.http.post(url, JSON.stringify(result), {
          responseType: 'text', headers: new HttpHeaders().set('Content-Type', 'application/json'),
        }).subscribe({ next: r => console.log('response', r), error: err => console.log('Error: ' + err) });
      }
    });
  }

  /** In-app notification (A&H update) — the dialog used by Participants Analytics and the workshop dashboard. */
  private async sendNotification(list: Recipient[]) {
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    const ref = this.dialog.open(AhNotificationComponent, {
      width: '60vw', maxHeight: '90vh', disableClose: true, autoFocus: false, data: list,
    });
    ref.afterClosed().subscribe(async result => {
      // The dialog returns a truthy value even when dismissed, so a plain close would otherwise fire a
      // save with empty fields (Firestore rejects it as invalid data).
      if (!result || (!result['title'] && !result['message'])) return;
      const profileid = list.map(p => p.profileid);
      let notificationimage: string | null = null;
      if (result['notificationimage'] != null) {
        const { getDownloadURL, ref: storageRefFn, uploadBytes } = await import('@angular/fire/storage');
        const { getStorage } = await import('firebase/storage');
        const { getApp } = await import('firebase/app');
        const storage = getStorage(getApp());
        const filepath = 'Notification Images/' + new Date().toISOString() + result['notificationimage'].name;
        try {
          const uploadResult = await uploadBytes(storageRefFn(storage, filepath), result['notificationimage']);
          notificationimage = await getDownloadURL(uploadResult.ref);
        } catch (error) {
          console.log('file upload error', error);
        }
      }
      await this.guard.saveNotificationRecord({
        title: result['title'], message: result['message'], subtitle: result['subtitle'] ?? null,
        notificationtype: 'ahupdate', notificationimage, sticky: result['sticky'], logged: true,
        landingpage: result['landingpage'], profileid,
        receivingapp: result['receivingapp'] ?? 'breakthroughsapp',
      });
      this.snackbar.show(`Notification sent to ${profileid.length} participant${profileid.length === 1 ? '' : 's'}`);
    });
  }

  /* ── Drill-downs: every count opens the records behind it ── */
  private openDrill(ev: Event, label: string, kind: DrillKind, rows: any[]) { ev.stopPropagation(); this.drill.set({ label, kind, rows }); }
  dEvents(ev: Event, label: string, evs: PlayEvent[]) { this.openDrill(ev, label, 'events', evs); }
  dPeople(ev: Event, label: string, evs: PlayEvent[]) { this.openDrill(ev, label, 'people', toPeople(evs)); }
  dPeopleIn(ev: Event, label: string, evs: PlayEvent[], names: string[]) {
    const keep = new Set(names);
    this.openDrill(ev, label, 'people', toPeople(evs.filter(e => keep.has(personKey(e)))));
  }
  dRepeat(ev: Event, label: string, evs: PlayEvent[]) { this.openDrill(ev, label, 'people', toPeople(evs).filter(x => x.views > 1)); }
  dPContent(ev: Event, label: string, evs: PlayEvent[]) { this.openDrill(ev, label, 'pcontent', pContent(evs)); }
  dMovers(ev: Event, label: string, rows: ParticipantProduct[]) {
    const today = dayStart(Date.now());
    this.openDrill(ev, label, 'movers', rows.map(r => ({
      ...r, name: this.live.nameOf(r.profileid),
      days: r.nextmodedate !== null ? Math.ceil((r.nextmodedate - today) / DAY) : null,
    })));
  }
  dPushes(ev: Event, label: string, pushes: RecRow[]) { this.openDrill(ev, label, 'pushes', pushes); }
  /** Roll a set of pushes up to the people they went to, so the drill lists participants, not rows. */
  dPushPeople(ev: Event, label: string, pushes: RecRow[]) {
    const m = new Map<string, RecPerson & { pushed: number; prog: number }>();
    pushes.forEach(x => {
      const o = m.get(x.pid) ?? { pid: x.pid, n: x.name, j: x.journey, all: [], items: 0, done: 0, watch: 0, pushed: 0, prog: 0 };
      o.all.push(x); o.items += x.total; o.done += x.done; o.watch += x.watch; o.pushed++;
      o.prog = o.items ? o.done / o.items : 0;
      m.set(x.pid, o);
    });
    this.openDrill(ev, label, 'pushpeople', [...m.values()].sort((a, b) => b.pushed - a.pushed));
  }
  dItems(ev: Event, label: string, items: RecItemRow[]) { this.openDrill(ev, label, 'items', items); }
  dTierPeople(ev: Event, label: string, rows: TierRowLive[]) { this.openDrill(ev, label, 'tierpeople', rows); }

  readonly drillRows = computed(() => { const d = this.drill(); return d ? d.rows.slice(0, DRILL_CAP) : []; });

  openInsights(ev: Event, key: string) { ev.stopPropagation(); this.retHover.set(null); this.insKey.set(key); }
  closeOnBackdrop(ev: Event, which: 'drill' | 'ins' | 'alltime') {
    if (ev.target !== ev.currentTarget) return;
    if (which === 'drill') this.drill.set(null);
    else if (which === 'alltime') this.tierAllTime.set(null);
    else this.insKey.set(null);
  }
  @HostListener('document:keydown.escape')
  onEsc() { this.drill.set(null); this.insKey.set(null); this.tierAllTime.set(null); }

  /* ── Export ── */
  exportCsv() {
    const head = ['Last seen', 'Participant', 'Profile id', 'Content', 'Content id', 'Playlist / Series', 'Container type', 'Source',
      'Overall Duration (s)', 'Dropped at (s)', 'Spend time (s)', 'Platform', 'Stored status', 'Outcome', 'Log doc id'];
    const body = this.rows().map(e => {
      const c = e.cont;
      return [new Date(e.ts).toISOString(), e.name, e.pid ?? '', e.video, e.vid ?? '', c ? c.label : '', c ? c.kind : '',
        SOURCES[e.src].label, e.rt, e.exit, e.spent, PLATFORM[e.platform] || e.platform,
        e.complete ? 'complete' : '', STATUS[statusOf(e)].label, e.docid ?? ''];
    });
    const csv = [head, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `content-analytics_${iso(this.from())}_${iso(this.to())}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }
}

interface HBar { label: string; v: number; text: string; em: string; color?: string; square?: boolean; }
function hbars(items: HBar[]) {
  const peak = Math.max(1, ...items.map(i => i.v));
  return items.map(i => ({ ...i, w: Math.max(1.5, i.v / peak * 100) }));
}
