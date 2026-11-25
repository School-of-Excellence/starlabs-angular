import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

/**
 * App widgets for the journey-segment app Home (operator, 2026-11-11):
 *   appwidgets/{autoId} = { widget: <app name>, displayname: <display name>, delete: <soft delete> }
 * `widget` is the app name: one lowercase word (a-z, 0-9), the key the Breakthroughs app maps to its Flutter
 * widget. `displayname` is what people read in STARLABS. Both can be renamed (operator accepts that renaming
 * an app name hides the widget until the app knows the new name).
 */
export const APP_WIDGETS_COLLECTION = 'appwidgets';

// Segment Board collections. The layout lives on the segment doc:
//   segmentboardconfig/{id}.tabwidgets.home = [appwidgetsId, ...]  (array order = screen order)
//   segmentboardconfig/{id}.apptheme        = 'blue' | 'magenta' | 'purple'
// Both are set in the Segment Board's own New / Edit segment form (operator, 2026-11-11).
export const SEGMENT_CONFIG_COLLECTION = 'segmentboardconfig';

/** App tabs whose layouts can reference a widget. Only Home is edited today. */
export const APP_TABS = ['home'] as const;
export type AppTab = (typeof APP_TABS)[number];

export type AppTheme = 'blue' | 'magenta' | 'purple';
export const APP_THEMES: { key: AppTheme; label: string; color: string }[] = [
  { key: 'blue', label: 'uP! blue', color: '#0A6FB0' },
  { key: 'magenta', label: 'LYL · CPM magenta', color: '#B0127D' },
  { key: 'purple', label: 'B!G purple', color: '#6E0399' },
];
export function isAppTheme(v: unknown): v is AppTheme {
  return v === 'blue' || v === 'magenta' || v === 'purple';
}

export interface AppWidget {
  id: string;
  /** app name: one lowercase word */
  widget: string;
  displayname: string;
  delete: boolean;
}

/** One lowercase word: starts with a letter, then letters or digits. */
export const APP_NAME_PATTERN = /^[a-z][a-z0-9]*$/;
export function appNameError(name: string): string | null {
  const v = String(name ?? '').trim();
  if (!v) return 'Type an app name.';
  if (!APP_NAME_PATTERN.test(v)) return 'App name: one lowercase word, letters and digits only (e.g. upcomingevents).';
  return null;
}

/** Display name used to compare widgets (duplicates are refused case- and space-insensitively). */
export function widgetKey(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Segments whose layout (any tab) contains the widget id, from already-loaded segment docs. */
export function segmentsUsing<T extends { tabwidgets?: Record<string, unknown> }>(widgetId: string, segments: T[]): T[] {
  return segments.filter(s => APP_TABS.some(t => {
    const v = s.tabwidgets?.[t];
    return Array.isArray(v) && v.map(String).includes(widgetId);
  }));
}

@Injectable({ providedIn: 'root' })
export class AppWidgetsService {
  private firestore = inject(Firestore);

  /** Live appwidgets, deleted ones excluded, sorted by name. */
  widgets$(): Observable<AppWidget[]> {
    return (collectionData(collection(this.firestore, APP_WIDGETS_COLLECTION), { idField: 'id' }) as Observable<any[]>).pipe(
      map(docs => docs
        .map(d => ({ id: String(d.id), widget: String(d['widget'] ?? ''), displayname: String(d['displayname'] ?? d['widget'] ?? ''), delete: d['delete'] === true }))
        .filter(w => !w.delete)
        .sort((a, b) => a.displayname.localeCompare(b.displayname))),
    );
  }

  /** One read of the non-deleted widgets, for the Segment Board's Home widgets picker. */
  async listWidgets(): Promise<AppWidget[]> {
    const snap = await getDocs(collection(this.firestore, APP_WIDGETS_COLLECTION));
    return snap.docs
      .map(d => ({ id: d.id, widget: String(d.data()['widget'] ?? ''), displayname: String(d.data()['displayname'] ?? d.data()['widget'] ?? ''), delete: d.data()['delete'] === true }))
      .filter(w => !w.delete)
      .sort((a, b) => a.displayname.localeCompare(b.displayname));
  }

  /** Live non-archived segments with their layouts (for the "used by" counts). */
  segments$(): Observable<{ id: string; name: string; tabwidgets: Record<string, unknown> }[]> {
    return (collectionData(collection(this.firestore, SEGMENT_CONFIG_COLLECTION), { idField: 'id' }) as Observable<any[]>).pipe(
      map(docs => docs
        .filter(d => d['archived'] !== true && !d['migratedto'])
        .map(d => ({
          id: String(d.id),
          name: String(d['name'] ?? d.id),
          tabwidgets: d['tabwidgets'] && typeof d['tabwidgets'] === 'object' ? d['tabwidgets'] : {},
        }))),
    );
  }

  /** Adds { widget, displayname, delete: false }. Both names must be set and unused by another non-deleted widget. */
  async addWidget(appName: string, displayName: string): Promise<string> {
    const { widget, displayname } = this.validate(appName, displayName);
    await this.assertNamesFree(widget, displayname, null);
    const ref = await addDoc(collection(this.firestore, APP_WIDGETS_COLLECTION), { widget, displayname, delete: false });
    return ref.id;
  }

  /** Renames either name (allowed even when segments use the widget — operator, 2026-11-11). */
  async renameWidget(w: AppWidget, appName: string, displayName: string): Promise<void> {
    const { widget, displayname } = this.validate(appName, displayName);
    if (widget === w.widget && displayname === w.displayname) return;
    await this.assertNamesFree(widget, displayname, w.id);
    await updateDoc(doc(this.firestore, APP_WIDGETS_COLLECTION, w.id), { widget, displayname });
  }

  private validate(appName: string, displayName: string): { widget: string; displayname: string } {
    const widget = String(appName ?? '').trim();
    const err = appNameError(widget);
    if (err) throw new Error(err);
    const displayname = cleanName(displayName);
    if (!displayname) throw new Error('Type a display name.');
    return { widget, displayname };
  }

  /**
   * Soft delete (delete: true). Checked against the server first: if any segment's layout uses the widget,
   * nothing is written and the segments are returned so the dialog can list them.
   */
  async softDelete(widget: AppWidget): Promise<{ blockedBy: { id: string; name: string }[] }> {
    const used = await this.segmentsUsingWidget(widget.id);
    if (used.length) return { blockedBy: used };
    await updateDoc(doc(this.firestore, APP_WIDGETS_COLLECTION, widget.id), { delete: true });
    return { blockedBy: [] };
  }

  /** Non-archived segments whose layout (any tab) holds the widget id — a fresh server read. */
  async segmentsUsingWidget(widgetId: string): Promise<{ id: string; name: string }[]> {
    const found = new Map<string, { id: string; name: string }>();
    for (const tab of APP_TABS) {
      const snap = await getDocs(query(collection(this.firestore, SEGMENT_CONFIG_COLLECTION), where(`tabwidgets.${tab}`, 'array-contains', widgetId)));
      for (const d of snap.docs) {
        if (d.data()['archived'] === true) continue;
        found.set(d.id, { id: d.id, name: String(d.data()['name'] ?? d.id) });
      }
    }
    return [...found.values()];
  }

  private async assertNamesFree(appName: string, displayName: string, exceptId: string | null): Promise<void> {
    const snap = await getDocs(collection(this.firestore, APP_WIDGETS_COLLECTION));
    const live = snap.docs.filter(d => d.id !== exceptId && d.data()['delete'] !== true);
    const app = live.find(d => String(d.data()['widget'] ?? '') === appName);
    if (app) throw new Error(`The app name “${appName}” is already used by “${app.data()['displayname'] ?? appName}”.`);
    const disp = live.find(d => widgetKey(d.data()['displayname'] ?? d.data()['widget']) === widgetKey(displayName));
    if (disp) throw new Error(`A widget called “${disp.data()['displayname']}” already exists.`);
  }
}

function cleanName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}
