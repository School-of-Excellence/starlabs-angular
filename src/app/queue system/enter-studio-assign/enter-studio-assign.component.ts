import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

interface EsaRow {
  activity: string | null;
  mandatory: boolean;   // must be filled before entering
  locked: boolean;      // activity is fixed (studio mandatory activity), not editable
  selected: Set<string>;
}

/**
 * EnterStudioAssignComponent — the redesigned "Participant accepted the
 * invitation" popup shown after a participant approves a studio invite.
 *
 * Restyled sibling of AssignQueueStudioComponent (left untouched for the other
 * invite/update flows). Same result contract: closes with the studio object +
 * chosen `participants` (mentors) + optional `bonusactivity` map
 * (participantId -> activityId), so dynamic-studio-v2's assignStudio()
 * afterClosed handler consumes it unchanged.
 *
 * Specialists per activity are sourced from `big cohorts` (activityId ->
 * participantidlist), passed in as `activityspecialists`, mirroring the
 * big-planner screen. Each activity row shows those specialists as toggleable
 * chips.
 */
@Component({
  selector: 'app-enter-studio-assign',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './enter-studio-assign.component.html',
  styleUrl: './enter-studio-assign.component.css'
})
export class EnterStudioAssignComponent {
  studio: any = null
  participantName = ''
  mapActivity: { [id: string]: string } = {}
  mapProfile: { [id: string]: string } = {}
  activitySpecialists: { [activityId: string]: string[] } = {}

  currentProfileId: string | null = null

  requiredRows: EsaRow[] = []
  optionalRows: EsaRow[] = []

  // ---- Mode / copy ---------------------------------------------------------
  // Two modes share the same chips UI:
  //  - 'enter'  (default): the lobby "Participant accepted the invitation" popup
  //             shown after a studio invite is approved. Studio-mandatory +
  //             carried-over activities become locked/required rows; returns the
  //             full studio object + participants + bonusactivity.
  //  - 'invite': the live-studio "Invite More Specialist(s)" popup. No required
  //             rows — the whole dialog is the optional add-specialist flow; it
  //             returns ONLY { bonusactivity } so the caller can merge it into
  //             the live assignment.
  // All copy (title/subtitle/CTA/header icon/section label) is overridable via
  // dialog data so a single component serves both flows; defaults reproduce the
  // original 'enter' popup verbatim.
  mode: 'enter' | 'invite' = 'enter'
  title = 'Participant accepted the invitation'
  subtitle = ''
  ctaLabel = 'Enter Studio'
  headerIcon = 'check'
  optionalTitle = 'Invite more specialist(s)'
  optionalShowOptionalTag = true
  optionalHint = 'Add another specialist for this session. You can also bring in a shadow participant or another activity once inside the studio.'

  constructor(
    @Inject(MAT_DIALOG_DATA) data: any,
    public dialogRef: MatDialogRef<any>
  ) {
    if (data != null) {
      this.studio = data['studio'] ?? null
      this.participantName = data['participantname'] ?? ''
      this.currentProfileId = data['currentprofileid'] ?? null
      this.mapActivity = data['mapactivity'] ?? {}
      this.mapProfile = data['mapprofile'] ?? {}
      this.activitySpecialists = data['activityspecialists'] ?? {}

      // Mode + overridable copy (defaults reproduce the original 'enter' popup).
      this.mode = data['mode'] === 'invite' ? 'invite' : 'enter'
      this.title = data['title'] ?? this.title
      this.ctaLabel = data['cta'] ?? this.ctaLabel
      this.subtitle = data['subtitle'] ?? (this.participantName ? `${this.participantName} is ready to meet you.` : '')
      if (this.mode === 'invite') {
        // Invite-more copy: no "accepted invitation" framing, no required rows.
        this.headerIcon = 'group_add'
        this.optionalTitle = data['optionaltitle'] ?? 'Choose activity & specialist(s)'
        this.optionalShowOptionalTag = false
        this.optionalHint = data['optionalhint'] ?? 'Pick an activity, then tap the specialists to add them to this studio.'
      }

      // Precompute the activity option list ONCE (stable reference). The
      // dropdown *ngFor binds to `filteredActivities` (a cached array), never a
      // method — a method in *ngFor returns a new array every change-detection
      // pass, which churns mat-select's option list and can hang the dialog.
      this.allActivities = Object.keys(this.mapActivity)
        .map(key => ({ key, value: this.mapActivity[key] }))
        .sort((a, b) => (a.value || '').localeCompare(b.value || ''))
      this.filteredActivities = this.allActivities

      // No mentor-selection UI: the studio's own specialists (incl. the
      // logged-in one) are always the session participants — see enterStudio().

      const additional = data['additionalactivities'] ?? {}

      if (this.mode === 'invite') {
        // Invite-more: the whole dialog is the optional add-specialist flow.
        // Prefill rows from any existing bonus activities passed in; otherwise
        // start with one empty row (activity dropdown + specialist chips).
        const keys = Object.keys(additional)
        if (keys.length) {
          keys.forEach(activityId => {
            this.optionalRows.push({
              activity: activityId,
              mandatory: false,
              locked: false,
              selected: new Set<string>(additional[activityId] ?? []),
            })
          })
        } else {
          this.optionalRows.push({ activity: null, mandatory: false, locked: false, selected: new Set() })
        }
      } else {
        // Enter (lobby) mode: studio-level mandatory activities -> locked
        // required rows.
        const mandatory: string[] = this.studio?.['mandatoryactivities'] ?? []
        mandatory.forEach(activityId => {
          this.requiredRows.push({ activity: activityId, mandatory: true, locked: true, selected: new Set() })
        })

        // Activities carried over from a stage-grouping transfer (prefilled,
        // still required, but activity is editable).
        Object.keys(additional).forEach(activityId => {
          this.requiredRows.push({
            activity: activityId,
            mandatory: true,
            locked: false,
            selected: new Set<string>(additional[activityId] ?? []),
          })
        })
      }
    }
  }

  // ---- Activity dropdown search -----------------------------------------
  // Bound to the ngx-mat-select-search box in each Activity dropdown. Shared
  // across the (one-at-a-time) open dropdowns. `allActivities` is the full,
  // sorted list (built once in the constructor); `filteredActivities` is the
  // cached, currently-shown subset — both are STABLE array references the
  // template iterates, so change detection doesn't thrash.
  activitySearch = ''
  allActivities: { key: string; value: string }[] = []
  filteredActivities: { key: string; value: string }[] = []

  /** Re-filter the cached list when the search box changes (case-insensitive). */
  onActivitySearchChange(term: string): void {
    this.activitySearch = term || ''
    const t = this.activitySearch.trim().toLowerCase()
    this.filteredActivities = t
      ? this.allActivities.filter(e => (e.value || '').toLowerCase().includes(t))
      : this.allActivities
  }

  /** Reset the search each time a dropdown opens so a term typed in one row
   *  doesn't linger in the next. */
  resetActivitySearch(): void {
    this.activitySearch = ''
    this.filteredActivities = this.allActivities
  }

  // ---- Activity rows -----------------------------------------------------
  specialistsFor(activityId: string | null) {
    if (!activityId) return []
    const ids = this.activitySpecialists[activityId] ?? []
    return ids
      .map(id => ({ profileid: id, name: this.mapProfile[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  onActivityChange(row: EsaRow) {
    // Options change with the activity, so drop any prior selection.
    row.selected.clear()
  }

  toggleSpecialist(row: EsaRow, pid: string) {
    if (row.selected.has(pid)) row.selected.delete(pid)
    else row.selected.add(pid)
  }

  addOptionalRow() {
    this.optionalRows.push({ activity: null, mandatory: false, locked: false, selected: new Set() })
  }
  removeOptionalRow(index: number) {
    this.optionalRows.splice(index, 1)
  }

  // ---- Submit ------------------------------------------------------------
  get canEnter(): boolean {
    if (this.mode === 'invite') {
      // At least one specialist must be chosen, and no half-filled row
      // (activity picked but no specialist, or vice-versa).
      if (this.optionalRows.length === 0) return false
      for (const r of this.optionalRows) {
        if (!r.activity || r.selected.size === 0) return false
      }
      return true
    }
    // Mentor selection is no longer gated — the logged-in specialist is always
    // included, so only the required activity rows must be complete.
    for (const r of this.requiredRows) {
      if (!r.activity || r.selected.size === 0) return false
    }
    for (const r of this.optionalRows) {
      if (!r.activity || r.selected.size === 0) return false
    }
    return true
  }

  enterStudio() {
    if (!this.canEnter) return

    if (this.mode === 'invite') {
      // Invite-more: return ONLY the bonus-activity map so the caller merges it
      // into the live assignment (no studio / participants payload).
      const bonusActivity: { [participantId: string]: string } = {}
      for (const r of this.optionalRows) {
        if (!r.activity) continue
        r.selected.forEach(pid => { bonusActivity[pid] = r.activity as string })
      }
      this.dialogRef.close({ bonusactivity: bonusActivity })
      return
    }

    const result = { ...this.studio }
    // The studio's own specialists (incl. the logged-in one) are the session
    // participants — no in-popup mentor selection.
    result['participants'] = Array.from(new Set<string>([
      ...((this.studio?.['participants'] ?? []) as string[]),
      ...(this.currentProfileId ? [this.currentProfileId] : []),
    ]))

    const bonusActivity: { [participantId: string]: string } = {}
    for (const r of [...this.requiredRows, ...this.optionalRows]) {
      if (!r.activity) continue
      r.selected.forEach(pid => { bonusActivity[pid] = r.activity as string })
    }
    if (Object.keys(bonusActivity).length !== 0) {
      result['bonusactivity'] = bonusActivity
    }
    this.dialogRef.close(result)
  }
}
