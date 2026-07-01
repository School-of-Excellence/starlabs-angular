import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

// the two divergent versions to choose between; both are preserved regardless of the choice
export interface DraftConflictData {
  mine: any;     // this device's unsynced version
  theirs: any;   // the version another device saved to the server
  // lookup maps the parent already holds, so refs resolve to names with NO extra reads (offline-safe).
  // Each is keyed by the EXACT value stored in the draft (a path string) → direct lookup, no id-extraction.
  recommendMap?: Record<string, string>;  // procedure_recommend path → name  (for recommended_to)
  agentMap?: Record<string, string>;      // profile_ref path (authorpath) → name (for assigned agents)
  procedureMap?: Record<string, any>;     // procedures id/path → name        (for procedure.name)
}

/**
 * Shown only on a TRUE two-device divergence (both sides edited the same draft from a different base).
 * It renders the FULL content of each version — directive, every adjustment + its procedures, and the notes —
 * side by side, so the specialist can compare and choose with context. Whatever is rejected is archived to
 * `…/{docId}/conflicts/{rev}` by ATCDraftService — never lost. Edit times are HINTS, not the deciding factor.
 */
@Component({
  selector: 'app-draft-conflict-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>This draft was edited in two places — choose which to keep</h2>
    <mat-dialog-content>
      <p class="intro">
        You have unsynced changes on this device, and a newer version was also saved elsewhere. Compare them below
        and pick which one to keep — the other is archived and can be recovered, nothing is deleted.
      </p>
      <div class="cols">
        <div class="col" *ngFor="let side of sides">
          <div class="col-head">
            <span class="tag" [class.mine]="side.key === 'mine'">{{ side.label }}</span>
            <span class="when" *ngIf="editedAt(side.data) as t">edited {{ t | date: 'medium' }}</span>
          </div>

          <div class="field">
            <div class="lbl">Directive</div>
            <div class="val">{{ directive(side.data) }}</div>
          </div>

          <div class="field">
            <div class="lbl">Adjustments ({{ adjustments(side.data).length }})</div>
            <div class="val" *ngIf="adjustments(side.data).length === 0">—</div>
            <div class="adj" *ngFor="let adj of adjustments(side.data); let i = index">
              <div class="adj-title" [class.struck]="adjBadge(adj) === 'Deleted'">
                {{ i + 1 }}. {{ adjText(adj) }}
                <span class="badge" [class.del]="adjBadge(adj) === 'Deleted'" *ngIf="adjBadge(adj)">{{ adjBadge(adj) }}</span>
              </div>
              <div class="adj-meta" *ngIf="adjMeta(adj)">{{ adjMeta(adj) }}</div>
              <ul class="proc" *ngIf="procedures(adj).length">
                <li *ngFor="let p of procedures(adj)" [class.struck]="procBadge(p) === 'Deleted'">
                  {{ procName(p) }}
                  <span class="badge" [class.del]="procBadge(p) === 'Deleted'" *ngIf="procBadge(p)">{{ procBadge(p) }}</span>
                  <span class="proc-meta" *ngIf="procDetail(p)"> — {{ procDetail(p) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="field" *ngIf="value(side.data,'notes') as n">
            <div class="lbl">Case notes</div><div class="val">{{ n }}</div>
          </div>
          <div class="field" *ngIf="value(side.data,'consultationsummary') as s">
            <div class="lbl">Consultation summary</div><div class="val">{{ s }}</div>
          </div>
          <div class="field" *ngIf="value(side.data,'consultationpoint') as p">
            <div class="lbl">Consultation point</div><div class="val">{{ p }}</div>
          </div>

          <button mat-flat-button [color]="side.key === 'mine' ? 'primary' : undefined"
                  class="keep" (click)="choose(side.key)">
            Keep {{ side.label }}'s version
          </button>
        </div>
      </div>
    </mat-dialog-content>
  `,
  styles: [`
    .intro { margin: 0 0 16px; color: rgba(0,0,0,.7); }
    .cols { display: flex; gap: 16px; align-items: stretch; }
    .col { flex: 1 1 0; min-width: 0; border: 1px solid rgba(0,0,0,.12); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; max-height: 60vh; overflow: auto; }
    .col-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
    .tag { font-weight: 700; padding: 2px 10px; border-radius: 12px; background: #eef1f4; }
    .tag.mine { background: #e3f0e6; color: #1d6b34; }
    .when { font-size: 12px; color: rgba(0,0,0,.55); }
    .field { margin-bottom: 12px; }
    .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: rgba(0,0,0,.5); margin-bottom: 2px; }
    .val { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
    .adj { padding: 6px 0; border-bottom: 1px dashed rgba(0,0,0,.1); }
    .adj-title { font-size: 14px; font-weight: 600; }
    .adj-meta { font-size: 12px; color: rgba(0,0,0,.55); }
    .proc { margin: 4px 0 0; padding-left: 18px; }
    .proc li { font-size: 13px; }
    .proc-meta { color: rgba(0,0,0,.55); }
    .badge { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 700; background: #e3f0e6; color: #1d6b34; }
    .badge.del { background: #fde2e1; color: #b3261e; }
    .struck { text-decoration: line-through; opacity: .65; }
    .keep { margin-top: auto; align-self: stretch; }
  `]
})
export class DraftConflictDialogComponent {
  // drive the two columns from one template loop; mine first so it reads "this device vs the other"
  sides = [
    { key: 'mine' as const, label: 'This device', data: null as any },
    { key: 'theirs' as const, label: 'Other device', data: null as any },
  ];

  constructor(
    private ref: MatDialogRef<DraftConflictDialogComponent, 'mine' | 'theirs'>,
    @Inject(MAT_DIALOG_DATA) public data: DraftConflictData
  ) {
    this.ref.disableClose = true;  // force an explicit choice so neither side is lost by an accidental dismiss
    this.sides[0].data = data?.mine;
    this.sides[1].data = data?.theirs;
  }

  choose(which: 'mine' | 'theirs'): void { this.ref.close(which); }

  // ---- defensive field extraction (works for both Prescribe and Edit draft shapes) ----
  directive(d: any): string { return d?.atcdirective ?? d?.directive ?? '—'; }
  value(d: any, key: string): string | null { const v = d?.[key]; return (v === undefined || v === null || v === '') ? null : String(v); }
  // existing adjustments (transcript) + newly-added ones (newtranscript, Edit only) tagged "_new"
  adjustments(d: any): any[] {
    const existing = (Array.isArray(d?.transcript) ? d.transcript : []).map((a: any) => ({ ...a, _new: false }));
    const added = (Array.isArray(d?.newtranscript) ? d.newtranscript : []).map((a: any) => ({ ...a, _new: true }));
    return [...existing, ...added];
  }
  adjText(a: any): string {
    const edited = (typeof a?.adjustmentedit === 'string' && a.adjustmentedit.trim()) ? a.adjustmentedit : null;
    return edited ?? a?.adjustment ?? a?.name ?? '(no text)';
  }
  // Edit drafts carry new/deleted markers; Prescribe drafts don't (→ no badge)
  adjBadge(a: any): string | null { return a?._new ? 'New' : (a?.adjustmentdelete ? 'Deleted' : null); }
  procBadge(p: any): string | null { return p?.newprocedure ? 'New' : (p?.proceduredelete ? 'Deleted' : null); }
  adjMeta(a: any): string {
    const parts: string[] = [];
    const aw = this.awarenessText(a);
    if (aw) parts.push(`awareness: ${aw}`);
    if (a?.potentialyears) parts.push(`${a.potentialyears} yr`);
    return parts.join(' · ');
  }
  // awareness is an object { aware, value } on Prescribe drafts (or a string + awarenessdetail on Edit) —
  // render the selected value (+ detail), never the raw object ([object Object])
  awarenessText(a: any): string | null {
    const w = a?.awareness;
    if (!w) return a?.awarenessdetail ? String(a.awarenessdetail) : null;
    if (typeof w === 'string') return [w, a?.awarenessdetail].filter(Boolean).join(' — ') || null;
    return [w.aware, w.value ?? a?.awarenessdetail].filter(Boolean).join(' — ') || null;
  }
  procedures(a: any): any[] { return Array.isArray(a?.procedure) ? a.procedure : []; }

  // procedure.name / recommended_to / assigned_to are reference paths — resolve to names via the parent's maps
  procName(p: any): string {
    const n = p?.name;
    const m = this.lookup(this.data?.procedureMap, n);
    if (m != null) return this.nameVal(m, this.idOf(n) ?? '(procedure)');
    return (typeof n === 'string') ? n : (this.idOf(n) ?? '(procedure)');
  }
  procDetail(p: any): string {
    const parts: string[] = [];
    const rec = this.recommendedTo(p);
    if (rec) parts.push(`rec: ${rec}`);
    const who = this.assignees(p);
    if (who.length) parts.push(`assigned: ${who.join(', ')}`);
    if (p?.mandatory) parts.push('mandatory');
    if (p?.completed) parts.push('completed');
    return parts.join(' · ');
  }
  // recommended_to is a procedure_recommend path → its name lives in recommendMap (NOT the profile/agent map)
  private recommendedTo(p: any): string | null {
    const r = p?.recommended_to;
    if (!r) return null;
    const map = this.data?.recommendMap;
    return map?.[this.pathOf(r) as string] ?? map?.[this.idOf(r) as string] ?? (this.idOf(r) ?? null);
  }
  // assigned agents = authorpath (profile_ref.path) across assignedMap (Prescribe) / bigactivity (Edit) / assigned_to —
  // resolve each via agentMap keyed by the exact path stored; de-duplicate names
  private assignees(p: any): string[] {
    const refs: any[] = [];
    if (Array.isArray(p?.assigned_to)) refs.push(...p.assigned_to);
    for (const m of [p?.assignedMap, p?.bigactivity]) {
      if (m && typeof m === 'object') Object.values<any>(m).forEach(arr => (Array.isArray(arr) ? arr : []).forEach((r: any) => refs.push(r)));
    }
    return Array.from(new Set(refs.map(r => this.agentName(r)).filter(Boolean)));
  }
  private agentName(ref: any): string {
    const map = this.data?.agentMap;
    return map?.[this.pathOf(ref) as string] ?? map?.[this.idOf(ref) as string] ?? (this.idOf(ref) ?? '—');
  }
  // a reference may be a path string, a DocumentReference-like {id}/{path}, or already-resolved text
  private idOf(ref: any): string | null {
    if (!ref) return null;
    if (typeof ref === 'string') return ref.split('/').pop() || ref;
    if (typeof ref.id === 'string') return ref.id;
    if (typeof ref.path === 'string') return ref.path.split('/').pop() || ref.path;
    return null;
  }
  private pathOf(ref: any): string | null {
    if (!ref) return null;
    if (typeof ref === 'string') return ref;
    if (typeof ref.path === 'string') return ref.path;
    return null;
  }
  // try BOTH the id and the full path as the key (Prescribe keys by id, Edit keys by path)
  private lookup(map: Record<string, any> | undefined, ref: any): any {
    if (!map) return undefined;
    const id = this.idOf(ref); const path = this.pathOf(ref);
    return (id != null ? map[id] : undefined) ?? (path != null ? map[path] : undefined);
  }
  // map value may be a plain name string (Edit) or a userData object with .name (Prescribe)
  private nameVal(v: any, fallback: string): string {
    if (v == null) return fallback;
    if (typeof v === 'string') return v;
    return v.name ?? v['name'] ?? fallback;
  }

  editedAt(d: any): Date | null {
    const v = d?.lastupdated ?? d?.serverUpdatedAt;
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? null : dt;
  }
}
