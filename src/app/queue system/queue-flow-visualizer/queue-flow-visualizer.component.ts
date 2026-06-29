import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  buildFlow,
  FlowConfig,
  FlowEdge,
  FlowModel,
  StageKind,
  validateFlow,
  ValidationReport,
} from './queue-flow.model';

interface KindMeta {
  c: string;
  label: string;
  glyph: string;
}

const KIND: Record<StageKind, KindMeta> = {
  spec: { c: '#f6a429', label: 'specialist studio', glyph: '◆' },
  self: { c: '#46a6ff', label: 'self-guided', glyph: '▣' },
  gate: { c: '#7b8a9d', label: 'gate', glyph: '◇' },
  term: { c: '#2fd6a0', label: 'terminal', glyph: '◉' },
};
const VHUES = ['#ff6b9d', '#8b8cf8', '#2dd6c0', '#a3e635', '#fb923c', '#22d3ee', '#f472b6'];
const COL = 176;
const NODE_W = 138;
const NODE_H = 62;
const SPINE_Y = 300;
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.4;

/**
 * Read-only flow visualizer for a queue config (brief Phase 1).
 *
 * Imperatively renders an SVG edge layer + absolutely-positioned node cards into
 * a single canvas, then drives it through a pan/zoom/fit viewport so a 40-stage
 * queue is actually navigable: fit-to-view overview, ⌘-scroll zoom, drag-pan,
 * a stage search/jump, click-a-warning-to-locate, and keyboard shortcuts.
 */
@Component({
  selector: 'app-queue-flow-visualizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./queue-flow-visualizer.component.css'],
  template: `
    <div class="qfv" [class.qfv-empty]="!config" tabindex="0" (keydown)="onKey($event)">
      <!-- slim toolbar — everything else floats over the canvas -->
      <header class="qfv-bar">
        <span class="mark">QF</span>

        <label class="qfv-search" [class.has]="searchTerm">
          <span class="sk">⌕</span>
          <input
            type="text"
            list="qfv-stage-list"
            placeholder="jump to stage…"
            [(ngModel)]="searchTerm"
            (keydown.enter)="jumpToStage(searchTerm, true)"
            (change)="jumpToStage(searchTerm, true)"
          />
          <datalist id="qfv-stage-list">
            <option *ngFor="let s of config?.stages" [value]="s"></option>
          </datalist>
          <kbd>/</kbd>
        </label>

        <button
          class="trace-btn"
          [class.active]="active !== null"
          (click)="railOpen = !railOpen"
          title="trace a variation"
        >
          <span class="d" [style.background]="active !== null ? activeColor : ''"></span>
          {{ active === null ? 'All paths' : activeName }}
          <span class="cr">▾</span>
        </button>

        <span class="qfv-spacer"></span>

        <span class="qfv-legend">
          <span class="lk" *ngFor="let k of legend" [title]="k.label">
            <span class="dot" [style.background]="k.c" [style.color]="k.c"></span>{{ k.label.split(' ')[0] }}
          </span>
        </span>

        <button
          class="pill"
          type="button"
          [class.ok]="report?.ok"
          [class.bad]="report && !report.ok"
          [disabled]="report?.ok"
          (click)="showWarnings = !showWarnings"
          [title]="report?.ok ? 'no drift' : 'toggle drift report'"
        >
          <span class="blink"></span>
          <ng-container *ngIf="report?.ok">consistent</ng-container>
          <ng-container *ngIf="report && !report.ok"
            >{{ report.orphans.length }}⊘ · {{ report.dangling.length }}⤬ ·
            {{ report.unreachableVariations.length }}⚑</ng-container
          >
        </button>
      </header>

      <div
        class="qfv-stage-wrap"
        #wrap
        (wheel)="onWheel($event)"
        (pointerdown)="onPanStart($event)"
        (pointermove)="onPanMove($event)"
        (pointerup)="onPanEnd($event)"
        (pointerleave)="onPanEnd($event)"
        [class.panning]="panning"
      >
        <div class="qfv-pan" #pan [style.transform]="panTransform">
          <div #canvas class="qfv-canvas"></div>
        </div>

        <div #drawer class="qfv-drawer"></div>

        <!-- floating variation rail (overlay) -->
        <div class="qfv-rail" *ngIf="railOpen">
          <button class="chip all" [class.on]="active === null" (click)="setActive(null)">
            <span class="vdot"></span>All paths
          </button>
          <button
            *ngFor="let v of config?.queuevariation; let i = index"
            class="chip"
            [class.on]="active === v.id"
            [class.warn]="unreachableIds.has(v.id)"
            [ngStyle]="{ '--c': varColor(i) }"
            (click)="setActive(v.id)"
          >
            <span class="vdot" [style.background]="varColor(i)"></span>{{ v.variationname }}
            <span class="cnt">{{ nodeCount(v.id) }}</span>
            <span class="vwarn" *ngIf="unreachableIds.has(v.id)" title="cannot reach a terminal">⚑</span>
          </button>
        </div>

        <!-- floating stats badge -->
        <div class="qfv-stats">
          <span><b>{{ statStages }}</b> stages</span>
          <span><b>{{ statEdges }}</b> trans</span>
          <span><b>{{ statVars }}</b> var</span>
          <span class="sub">{{ statOperator }} op · {{ statSelfMove }} self-move</span>
        </div>

        <!-- zoom HUD -->
        <div class="qfv-hud">
          <button (click)="zoomIn()" title="zoom in (+)">＋</button>
          <button (click)="zoomOut()" title="zoom out (−)">−</button>
          <span class="z" (click)="fitToView()" title="fit to view (F)">{{ scalePct }}%</span>
          <button (click)="fitToView()" title="fit to view (F)">⤢</button>
          <button (click)="resetView()" title="reset (0)">⟳</button>
        </div>

        <div class="qfv-hint">drag · ⌘-scroll zoom · F fit</div>

        <!-- drift report (overlay, toggled by pill) -->
        <div class="qfv-warnings" *ngIf="showWarnings && report && !report.ok" #warnings>
          <div class="w-head">
            drift report — {{ report.dangling.length + report.orphans.length + report.unreachableVariations.length }} issue(s) · click to locate
            <button class="wx" (click)="showWarnings = false">✕</button>
          </div>
          <button class="w-row dang" *ngFor="let d of report.dangling" (click)="locate(d.from)">
            <b>dangling</b> &ldquo;{{ d.from }}&rdquo; → &ldquo;{{ d.to }}&rdquo; <i>target not in stages</i>
          </button>
          <button class="w-row orph" *ngFor="let o of report.orphans" (click)="locate(o)">
            <b>orphan</b> &ldquo;{{ o }}&rdquo; <i>no incoming or outgoing transition</i>
          </button>
          <button
            class="w-row unreach"
            *ngFor="let u of report.unreachableVariations"
            (click)="locateVariation(u.id)"
          >
            <b>unreachable</b> {{ u.variationname }} <i>{{ u.reason }}</i>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class QueueFlowVisualizerComponent implements OnChanges, AfterViewInit {
  @Input() config: FlowConfig | null = null;
  /** Emitted when a stage node is clicked; host scrolls to that stage's form. */
  @Output() stageFocus = new EventEmitter<string>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('drawer') drawerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('wrap') wrapRef!: ElementRef<HTMLDivElement>;
  @ViewChild('warnings') warningsRef?: ElementRef<HTMLDivElement>;

  readonly legend = Object.values(KIND);

  active: string | null = null;
  pinned: string | null = null;
  searchTerm = '';
  railOpen = false;
  showWarnings = false;

  statStages = 0;
  statEdges = 0;
  statVars = 0;
  statOperator = 0;
  statSelfMove = 0;
  report: ValidationReport | null = null;
  unreachableIds = new Set<string>();

  // viewport state
  scale = 1;
  tx = 0;
  ty = 0;
  panning = false;
  private panPX = 0;
  private panPY = 0;

  private model: FlowModel | null = null;
  private viewReady = false;
  private pendingFit = false;
  private gW = 0;
  private gH = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.wire();
    this.render();
    this.pendingFit = true;
    this.fitToView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.active = null;
      this.pinned = null;
      this.searchTerm = '';
      this.hideDetail();
      this.pendingFit = true;
    }
    if (this.viewReady) {
      this.render();
      if (this.pendingFit) this.fitToView();
    }
  }

  // ---- template getters ----
  get panTransform(): string {
    return `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }
  get scalePct(): number {
    return Math.round(this.scale * 100);
  }
  get activeName(): string {
    return this.config?.queuevariation.find((v) => v.id === this.active)?.variationname || '';
  }
  get activeColor(): string {
    const i = this.config?.queuevariation.findIndex((v) => v.id === this.active) ?? -1;
    return i >= 0 ? this.varColor(i) : '#fff';
  }

  varColor(i: number): string {
    return VHUES[i % VHUES.length];
  }

  nodeCount(variationId: string): number {
    if (!this.model) return 0;
    return this.model.nodes.filter((n) => n.vars.has(variationId)).length;
  }

  setActive(id: string | null): void {
    this.active = id;
    this.railOpen = false;
    this.apply();
    this.cdr.markForCheck();
  }

  // ---- viewport controls ----
  fitToView(pad = 90): void {
    const wrap = this.wrapRef?.nativeElement;
    if (!wrap || !this.gW) return;
    const vw = wrap.clientWidth;
    const vh = wrap.clientHeight;
    const s = Math.min((vw - pad) / this.gW, (vh - pad) / this.gH);
    this.scale = Math.max(MIN_SCALE, Math.min(s, 1));
    this.tx = (vw - this.gW * this.scale) / 2;
    this.ty = (vh - this.gH * this.scale) / 2;
    this.pendingFit = false;
    this.cdr.markForCheck();
  }

  resetView(): void {
    this.scale = 1;
    this.tx = 40;
    this.ty = 0;
    this.cdr.markForCheck();
  }

  zoomIn(): void {
    this.zoomAtCenter(1.2);
  }
  zoomOut(): void {
    this.zoomAtCenter(1 / 1.2);
  }

  private zoomAtCenter(factor: number): void {
    const wrap = this.wrapRef?.nativeElement;
    if (!wrap) return;
    this.zoomAt(factor, wrap.clientWidth / 2, wrap.clientHeight / 2);
  }

  private zoomAt(factor: number, cx: number, cy: number): void {
    const ns = Math.max(MIN_SCALE, Math.min(this.scale * factor, MAX_SCALE));
    const wx = (cx - this.tx) / this.scale;
    const wy = (cy - this.ty) / this.scale;
    this.tx = cx - wx * ns;
    this.ty = cy - wy * ns;
    this.scale = ns;
    this.cdr.markForCheck();
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = this.wrapRef.nativeElement.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
      this.cdr.markForCheck();
    }
  }

  onPanStart(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('.node') || t.closest('.qfv-drawer') || t.closest('.qfv-hud') || t.closest('.qfv-filter-tag'))
      return;
    this.panning = true;
    this.panPX = e.clientX;
    this.panPY = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  onPanMove(e: PointerEvent): void {
    if (!this.panning) return;
    this.tx += e.clientX - this.panPX;
    this.ty += e.clientY - this.panPY;
    this.panPX = e.clientX;
    this.panPY = e.clientY;
    this.cdr.markForCheck();
  }
  onPanEnd(_e: PointerEvent): void {
    this.panning = false;
  }

  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' && e.key !== 'Escape') return;
    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault();
        this.zoomIn();
        break;
      case '-':
      case '_':
        e.preventDefault();
        this.zoomOut();
        break;
      case '0':
        this.resetView();
        break;
      case 'f':
      case 'F':
        this.fitToView();
        break;
      case '/':
        e.preventDefault();
        (this.wrapRef.nativeElement.closest('.qfv')?.querySelector('.qfv-search input') as HTMLInputElement)?.focus();
        break;
      case 'Escape':
        this.clearAll();
        break;
    }
  }

  clearAll(): void {
    this.active = null;
    this.pinned = null;
    this.searchTerm = '';
    this.railOpen = false;
    this.showWarnings = false;
    this.hideDetail();
    this.apply();
    this.cdr.markForCheck();
  }

  /** Center + pulse a stage node, optionally clearing the search box after. */
  jumpToStage(name: string, fromSearch = false): void {
    const M = this.model;
    const wrap = this.wrapRef?.nativeElement;
    if (!M || !wrap || M.order[name] === undefined) return;
    const i = M.order[name];
    if (this.scale < 0.7) this.scale = 0.95;
    const cxw = 70 + i * COL;
    const cyw = SPINE_Y;
    this.tx = wrap.clientWidth / 2 - cxw * this.scale;
    this.ty = wrap.clientHeight / 2 - cyw * this.scale;
    this.pulse(name);
    this.detail(name);
    this.pinned = name;
    if (fromSearch) this.searchTerm = '';
    this.cdr.markForCheck();
  }

  /** Locate a stage from a drift-report row. */
  locate(name: string): void {
    this.jumpToStage(name);
  }

  /** Locate an unreachable variation: activate its filter and jump to its entry. */
  locateVariation(id: string): void {
    this.setActive(id);
    const v = this.config?.queuevariation.find((x) => x.id === id);
    const entry = (v?.stages || []).find((s) => this.model?.order[s] !== undefined);
    if (entry) this.jumpToStage(entry);
  }

  scrollToWarnings(): void {
    this.warningsRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private pulse(name: string): void {
    const cv = this.canvasRef?.nativeElement;
    const el = cv?.querySelector(`.node[data-node="${cssEsc(name)}"]`) as HTMLElement | null;
    if (!el) return;
    el.classList.remove('locate');
    void el.offsetWidth; // restart animation
    el.classList.add('locate');
    window.setTimeout(() => el.classList.remove('locate'), 1600);
  }

  // ---- render (imperative) ----
  private render(): void {
    const cfg = this.config;
    const cv = this.canvasRef?.nativeElement;
    if (!cv) return;
    if (!cfg || !cfg.stages?.length) {
      cv.innerHTML = '';
      this.model = null;
      this.report = null;
      this.statStages = this.statEdges = this.statVars = this.statOperator = this.statSelfMove = 0;
      this.unreachableIds = new Set();
      this.gW = this.gH = 0;
      this.cdr.markForCheck();
      return;
    }

    const M = buildFlow(cfg);
    this.model = M;
    const n = cfg.stages.length;
    const W = 70 + n * COL + 40;
    const H = 560;
    const spineY = SPINE_Y;
    this.gW = W;
    this.gH = H;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const cx = (i: number) => 70 + i * COL;
    const mid = (a: number, b: number) => (a + b) / 2;

    let paths = '';
    let labels = '';

    M.edges.forEach((e: FlowEdge & { _g?: { gx: number; gy: number } }, ei) => {
      const s = M.nodeBy[e.from];
      const sx = cx(s.i);
      let d: string;
      let lx: number;
      let ly: number;
      let cls = 'edge';
      if (e.dangling) {
        const gx = cx(Math.min(s.i + 1, n - 1));
        const gy = spineY + 186;
        d = `M ${sx} ${spineY + NODE_H / 2} C ${sx} ${gy - 30} ${gx} ${gy - 30} ${gx} ${gy - 22}`;
        lx = mid(sx, gx);
        ly = gy - 44;
        cls = 'edge dangle';
        e._g = { gx, gy };
      } else if (e.loop) {
        d = `M ${sx - 16} ${spineY - NODE_H / 2} C ${sx - 30} ${spineY - NODE_H / 2 - 58} ${
          sx + 30
        } ${spineY - NODE_H / 2 - 58} ${sx + 16} ${spineY - NODE_H / 2}`;
        lx = sx;
        ly = spineY - NODE_H / 2 - 62;
      } else if (e.type === 'selfmove') {
        const t = M.nodeBy[e.to];
        const tx = cx(t.i);
        d = `M ${sx} ${spineY - NODE_H / 2} C ${sx} ${spineY - NODE_H / 2 - 20} ${tx} ${
          spineY - NODE_H / 2 - 20
        } ${tx} ${spineY - NODE_H / 2}`;
        lx = mid(sx, tx);
        ly = spineY - NODE_H / 2 - 22;
      } else {
        const t = M.nodeBy[e.to];
        const tx = cx(t.i);
        const span = Math.abs(t.i - s.i);
        if (e.back) {
          const a = 42 + Math.min(span, 7) * 17;
          d = `M ${sx} ${spineY + NODE_H / 2} C ${sx} ${spineY + NODE_H / 2 + a} ${tx} ${
            spineY + NODE_H / 2 + a
          } ${tx} ${spineY + NODE_H / 2}`;
          lx = mid(sx, tx);
          ly = spineY + NODE_H / 2 + a + 2;
        } else {
          const a = 46 + Math.min(span, 7) * 19;
          d = `M ${sx} ${spineY - NODE_H / 2} C ${sx} ${spineY - NODE_H / 2 - a} ${tx} ${
            spineY - NODE_H / 2 - a
          } ${tx} ${spineY - NODE_H / 2}`;
          lx = mid(sx, tx);
          ly = spineY - NODE_H / 2 - a - 2;
        }
      }
      paths += `<path class="${cls}" data-ei="${ei}" d="${d}" fill="none"></path>`;
      labels += `<g class="elabel" data-ei="${ei}" transform="translate(${lx},${ly})" text-anchor="middle" style="opacity:0">
        <rect x="${-(e.label.length * 4.4 + 10)}" y="-9" width="${
        e.label.length * 4.4 + 20
      }" height="15" rx="4"></rect>
        <text dy="2">${e.loop ? '↺ ' : ''}${esc(e.label)}${e.done ? ' ✓' : ''}</text></g>`;
    });

    const svg = `<svg class="edges" width="${W}" height="${H}">
       <defs>
         <marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#3b4756"/></marker>
         <marker id="ahv" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="context-stroke"/></marker>
         <marker id="ahw" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ff4d62"/></marker>
       </defs>${paths}${labels}</svg>`;

    let html = svg;
    M.nodes.forEach((node) => {
      const k = KIND[node.kind];
      const x = cx(node.i) - NODE_W / 2;
      const y = spineY - NODE_H / 2;
      html += `<div class="node ${node.orphan ? 'orphan' : ''}" data-node="${esc(node.name)}"
         style="left:${x}px;top:${y}px;--kc:${k.c};animation-delay:${node.i * 30}ms">
         <div class="kbar"></div>
         <div class="idx">STAGE ${String(node.i).padStart(2, '0')}</div>
         <div class="nm">${esc(node.name)}</div>
         <div class="meta"><span class="ktag">${k.label.split(' ')[0]}</span>
           ${node.prop.enablezoom ? '<span class="glyph" title="zoom">⦿</span>' : ''}
           <span class="glyph">${k.glyph}</span></div></div>`;
    });
    M.ghosts.forEach((g) => {
      const e = M.edges.find(
        (x: FlowEdge & { _g?: { gx: number; gy: number } }) => x.dangling && x.to === g.name && x._g,
      ) as (FlowEdge & { _g?: { gx: number; gy: number } }) | undefined;
      const gx = (e?._g?.gx || 200) - 75;
      const gy = (e?._g?.gy || 480) - 22;
      html += `<div class="node ghost" style="left:${gx}px;top:${gy}px;--kc:var(--warn)">
         <div class="kbar"></div><div class="idx">UNRESOLVED</div>
         <div class="nm">${esc(g.name)}</div>
         <div class="meta"><span class="ktag">missing stage</span><span class="glyph">⚠</span></div></div>`;
    });
    cv.innerHTML = html;
    cv.querySelectorAll('path.edge').forEach((p) => {
      const L = (p as SVGPathElement).getTotalLength();
      (p as SVGPathElement).style.setProperty('--len', String(L));
    });

    this.report = validateFlow(cfg, M);
    this.unreachableIds = new Set(this.report.unreachableVariations.map((u) => u.id));
    this.statStages = M.nodes.length;
    this.statEdges = M.edges.length;
    this.statVars = cfg.queuevariation.length;
    this.statOperator = M.edges.filter((e) => e.type === 'next').length;
    this.statSelfMove = M.edges.filter((e) => e.type === 'selfmove').length;

    this.apply();
    this.cdr.markForCheck();
  }

  private apply(): void {
    const M = this.model;
    const cv = this.canvasRef?.nativeElement;
    if (!M || !cv) return;
    const v = this.active;
    const vc = v ? this.varColor(this.config!.queuevariation.findIndex((x) => x.id === v)) : null;
    const memberNodes = new Set<string>();

    M.edges.forEach((e, ei) => {
      const path = cv.querySelector(`path[data-ei="${ei}"]`) as SVGPathElement | null;
      const lab = cv.querySelector(`g.elabel[data-ei="${ei}"]`) as SVGGElement | null;
      if (!path) return;
      const member = !v || e.dangling || e.variations.length === 0 || e.variations.includes(v);
      const text = lab?.querySelector('text') as SVGTextElement | null;
      if (e.dangling) {
        path.setAttribute('stroke', '#ff4d62');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('stroke-dasharray', '4 4');
        path.setAttribute('marker-end', 'url(#ahw)');
        path.style.opacity = !v ? '1' : '0.85';
        if (lab) lab.style.opacity = '1';
        text?.setAttribute('fill', '#ff7a88');
        return;
      }
      const sm = e.type === 'selfmove';
      const setDash = () => {
        if (sm) path.setAttribute('stroke-dasharray', '6 5');
        else path.removeAttribute('stroke-dasharray');
      };
      if (!v) {
        path.setAttribute('stroke', sm ? '#3c4a5b' : '#33404f');
        path.setAttribute('stroke-width', sm ? '1.3' : '1.5');
        setDash();
        path.setAttribute('marker-end', 'url(#ah)');
        path.style.opacity = sm ? '0.4' : '0.6';
        path.style.filter = 'none';
        if (lab) lab.style.opacity = '0';
      } else if (member) {
        path.style.color = vc!;
        path.setAttribute('stroke', vc!);
        path.setAttribute('stroke-width', sm ? '1.6' : '2.3');
        setDash();
        path.setAttribute('marker-end', 'url(#ahv)');
        path.style.opacity = sm ? '0.78' : '1';
        path.style.filter = sm ? 'none' : `drop-shadow(0 0 5px ${vc}88)`;
        if (lab) lab.style.opacity = sm ? '0' : '1';
        text?.setAttribute('fill', vc!);
        memberNodes.add(e.from);
        memberNodes.add(e.to);
      } else {
        path.setAttribute('stroke', '#28323e');
        path.setAttribute('stroke-width', '1.2');
        setDash();
        path.setAttribute('marker-end', 'url(#ah)');
        path.style.opacity = '0.07';
        path.style.filter = 'none';
        if (lab) lab.style.opacity = '0';
      }
    });

    cv.querySelectorAll('.node').forEach((nd) => {
      const el = nd as HTMLElement;
      if (el.classList.contains('ghost')) return;
      el.classList.remove('dim', 'member');
      el.style.removeProperty('--vc');
      if (v) {
        if (memberNodes.has(el.dataset['node'] || '')) {
          el.classList.add('member');
          el.style.setProperty('--vc', vc!);
        } else {
          el.classList.add('dim');
        }
      }
    });
  }

  // ---- interaction wiring (node hover/click) ----
  private wire(): void {
    const cv = this.canvasRef?.nativeElement;
    const drawer = this.drawerRef?.nativeElement;
    if (!cv || !drawer) return;
    cv.addEventListener('mouseover', (ev) => {
      const nd = (ev.target as HTMLElement).closest('.node') as HTMLElement | null;
      if (nd && !nd.classList.contains('ghost') && !this.pinned) this.detail(nd.dataset['node'] || '');
    });
    cv.addEventListener('mouseout', (ev) => {
      const nd = (ev.target as HTMLElement).closest('.node');
      if (nd && !this.pinned) this.hideDetail();
    });
    cv.addEventListener('click', (ev) => {
      const nd = (ev.target as HTMLElement).closest('.node') as HTMLElement | null;
      if (!nd || nd.classList.contains('ghost')) return;
      const name = nd.dataset['node'] || '';
      this.pinned = this.pinned === name ? null : name;
      if (this.pinned) this.detail(name);
      else this.hideDetail();
      this.stageFocus.emit(name);
    });
    drawer.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.dx')) {
        this.pinned = null;
        this.hideDetail();
      }
    });
  }

  private detail(name: string): void {
    const M = this.model;
    const cfg = this.config;
    const d = this.drawerRef?.nativeElement;
    if (!M || !cfg || !d) return;
    const node = M.nodeBy[name];
    if (!node) return;
    const k = KIND[node.kind];
    const p = node.prop;
    const outs = p.nextstage || [];
    const sm = M.edges.filter((e) => e.type === 'selfmove' && e.from === name);
    const vnames = (id: string) => cfg.queuevariation.find((v) => v.id === id)?.variationname || id;
    const through = [...node.vars];

    d.style.setProperty('--kc', k.c);
    d.innerHTML = `<button class="dx" title="close">✕</button>
      <h3><span class="hk"></span>${esc(name)}</h3>
      <div class="sub">${k.label}${node.orphan ? ' · ⚠ orphan' : ''}</div>
      <div class="row"><span class="k">action</span><span class="v">${p.actiontype || '—'}</span></div>
      <div class="row"><span class="k">forms</span><span class="v">${
        (p.participantform || []).length || '—'
      }</span></div>
      <div class="row"><span class="k">activity combos</span><span class="v">${
        p.compulsoryactivity ? Object.keys(p.compulsoryactivity).length || '—' : '—'
      }</span></div>
      <div class="row"><span class="k">zoom</span><span class="v">${p.enablezoom ? 'on' : '—'}</span></div>
      <div class="row"><span class="k">in / out</span><span class="v">${node.inN} / ${node.outN}</span></div>
      <div class="row"><span class="k">self-movable</span><span class="v">${
        node.selfmv ? 'yes · auto-advance' : '—'
      }</span></div>
      ${
        p.studiowidgets && p.studiowidgets.length
          ? `<div class="widgets">${p.studiowidgets.map((w) => `<span class="w">${esc(w)}</span>`).join('')}</div>`
          : ''
      }
      <div class="outs"><div class="row" style="border:0;padding-bottom:2px"><span class="k">transitions →</span><span class="v">${
        outs.length + sm.length
      }</span></div>
        ${outs
          .map(
            (o) =>
              `<div class="o"><b>${esc(o.stage)}</b> ${o.markascompleted ? '✓' : ''}<br><span style="color:var(--dim)">operator: "${esc(
                o.calltoaction || '',
              )}"</span> <span class="sc">[${
                o.variations && o.variations.length ? o.variations.map(vnames).join(', ') : 'all'
              }]</span></div>`,
          )
          .join('')}
        ${sm
          .map(
            (e) =>
              `<div class="o">⤳ <b>${esc(e.to)}</b><br><span style="color:var(--dim)">self-move (${esc(
                e.label,
              )})</span> <span class="sc">[${e.variations.length}/${
                cfg.queuevariation.length
              } var · auto]</span></div>`,
          )
          .join('')}
        ${outs.length + sm.length === 0 ? '<div class="o">— terminal —</div>' : ''}</div>
      <div class="row" style="margin-top:8px"><span class="k">variations through</span><span class="v">${
        through.length
      }/${cfg.queuevariation.length}</span></div>
      <div class="hint">click node → host scrolls to its form section</div>`;
    d.classList.add('show');
  }

  private hideDetail(): void {
    this.drawerRef?.nativeElement.classList.remove('show');
  }
}

function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
/** Escape a value for use inside a [data-node="..."] attribute selector. */
function cssEsc(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}
