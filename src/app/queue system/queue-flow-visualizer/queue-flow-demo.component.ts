import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueueFlowVisualizerComponent } from './queue-flow-visualizer.component';
import { FlowConfig } from './queue-flow.model';

interface QueueIndexEntry {
  id: string;
  file: string;
  queuename: string;
  stages: number;
  variations: number;
  operatorTransitions: number;
  selfMovable: number;
}

/**
 * Full-bleed demo / verification harness for the read-only viewer. Loads real
 * `queue generation` configs exported to assets and renders them through the
 * visualizer — no Firebase auth needed, so the output is reproducible and
 * screenshot-friendly. The viewer gets ~all of the window; only a slim top bar
 * (queue picker) sits above it.
 */
@Component({
  selector: 'app-queue-flow-demo',
  standalone: true,
  imports: [CommonModule, QueueFlowVisualizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        background: #06080c;
        color: #e9eef7;
        font-family: 'Outfit', system-ui, sans-serif;
      }
      .topbar {
        flex: 0 0 40px;
        height: 40px;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 0 14px;
        border-bottom: 1px solid #1b2433;
        background: #0a0e15;
      }
      .topbar .brand {
        font-family: 'Chakra Petch', 'Outfit', sans-serif;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.18em;
        color: #cfe0f5;
        white-space: nowrap;
      }
      .topbar select {
        appearance: none;
        background: #131a27
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238593a8'/%3E%3C/svg%3E")
          no-repeat right 11px center;
        border: 1px solid #29354a;
        border-radius: 8px;
        color: #e9eef7;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        padding: 6px 30px 6px 11px;
        max-width: 460px;
        cursor: pointer;
      }
      .topbar select:focus {
        outline: none;
        border-color: #46a6ff;
      }
      .topbar .meta {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #51607a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .topbar .spacer {
        flex: 1;
      }
      .topbar .focus {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #46a6ff;
        white-space: nowrap;
      }
      .viz {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
  template: `
    <div class="topbar">
      <span class="brand">QUEUE&middot;FLOW</span>
      <select (change)="selectById($any($event.target).value)">
        <option *ngFor="let q of index" [value]="q.id" [selected]="q.id === current?.id">
          {{ q.queuename || q.id }} — {{ q.stages }} stages · {{ q.variations }} var
        </option>
      </select>
      <span class="meta" *ngIf="current">{{ current.id }}</span>
      <span class="spacer"></span>
      <span class="focus" *ngIf="focusedStage">focus → {{ focusedStage }}</span>
    </div>
    <div class="viz">
      <app-queue-flow-visualizer [config]="config" (stageFocus)="onFocus($event)" />
    </div>
  `,
})
export class QueueFlowDemoComponent implements OnInit {
  index: QueueIndexEntry[] = [];
  current: QueueIndexEntry | null = null;
  config: FlowConfig | null = null;
  focusedStage = '';

  private readonly base = 'assets/queue-configs';

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    this.index = await fetch(`${this.base}/index.json`).then((r) => r.json());
    if (this.index.length) await this.select(this.index[0]);
    this.cdr.markForCheck();
  }

  selectById(id: string): void {
    const q = this.index.find((x) => x.id === id);
    if (q) this.select(q);
  }

  async select(q: QueueIndexEntry): Promise<void> {
    this.current = q;
    this.focusedStage = '';
    this.config = await fetch(`${this.base}/${q.file}`).then((r) => r.json());
    this.cdr.markForCheck();
  }

  onFocus(stage: string): void {
    this.focusedStage = stage;
    this.cdr.markForCheck();
  }
}
