/**
 * Free map view for the Live Location Tracking dashboard.
 *
 * Leaflet + OpenStreetMap tiles: no API key, no billing account, no usage quota
 * to blow through — which is why it is here instead of Google Maps.
 *
 * Implementation details worth knowing:
 *  - Leaflet touches `window` at import time, so it is loaded via a dynamic
 *    `import()`. That keeps SSR working and keeps ~150 kB out of the initial
 *    bundle for everyone who never opens this page. The import is deferred
 *    further until the map scrolls near the viewport (IntersectionObserver).
 *  - Tiles are requested with `crossOrigin: 'anonymous'`. This app serves
 *    COEP: require-corp (for the Zoom SDK's cross-origin isolation), under
 *    which a plain cross-origin <img> is blocked. OSM sends
 *    `Access-Control-Allow-Origin: *`, so CORS-mode requests load fine.
 *  - A ResizeObserver drives `invalidateSize()`. Leaflet caches the container
 *    size at init and positions every tile against it; if the element is later
 *    resized (drawer animating open, sidenav collapsing, window resize, or
 *    simply a layout that settles after init) the tile grid tears into a
 *    staircase of offset and missing tiles. This is *the* classic Leaflet bug.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import type * as LeafletNS from 'leaflet';

import { Coordinates, ParticipantLocation } from './location.model';
import {
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getStatusColor,
  getStatusText,
  googleMapsUrl,
} from './location.utils';

/**
 * OpenStreetMap standard tiles — free, and attribution is mandatory.
 *
 * Deliberately the single `tile.openstreetmap.org` host rather than the old
 * `{s}` subdomain rotation: OSM deprecated the subdomains, and over HTTP/2 one
 * host multiplexes every tile on a single connection, where three hosts force
 * three TLS handshakes before the first tile can even start downloading.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** Zoom used when centring on a single participant. */
const FOCUS_ZOOM = 15;

/** How early (in px) the map starts loading before it scrolls into view. */
const LAZY_ROOT_MARGIN_PX = 400;

/** When to hand-check visibility, in case IntersectionObserver delivery stalls. */
const VISIBILITY_FALLBACK_MS = 1200;

/** Fallback view when there is nothing at all to show (world view). */
const FALLBACK_CENTER: [number, number] = [20, 0];
const FALLBACK_ZOOM = 2;

@Component({
  selector: 'app-location-map',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lm-wrap">
      <div #mapHost class="lm-canvas" role="application" aria-label="Participant location map"></div>

      @if (!ready()) {
        <div class="lm-loading">
          <div class="lm-spinner"></div>
          <span>Loading map…</span>
        </div>
      }

      <div class="lm-legend" aria-hidden="true">
        <span><i class="lm-key lm-key-admin"></i>You</span>
        <span><i class="lm-key lm-key-live"></i>Live</span>
        <span><i class="lm-key lm-key-recent"></i>Recent</span>
        <span><i class="lm-key lm-key-stale"></i>Stale</span>
      </div>

      @if (ready() && showFitControl) {
        <button type="button" class="lm-fit" (click)="fitToMarkers()">Fit all</button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .lm-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 320px;
        border-radius: 18px;
        overflow: hidden;
        background: #eef2f7;
      }

      .lm-canvas {
        width: 100%;
        height: 100%;
      }

      .lm-loading {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 10px;
        background: #eef2f7;
        color: #64748b;
        font-size: 0.85rem;
        z-index: 500;
      }

      .lm-spinner {
        width: 26px;
        height: 26px;
        border: 3px solid #cbd5e1;
        border-top-color: #4338ca;
        border-radius: 50%;
        animation: lm-spin 0.9s linear infinite;
      }

      @keyframes lm-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .lm-legend {
        position: absolute;
        left: 12px;
        bottom: 12px;
        z-index: 500;
        display: flex;
        gap: 12px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.16);
        font-size: 0.72rem;
        color: #475569;
        font-weight: 600;
      }

      .lm-legend span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .lm-key {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }

      .lm-key-admin {
        background: #2563eb;
      }
      .lm-key-live {
        background: #10b981;
      }
      .lm-key-recent {
        background: #f59e0b;
      }
      .lm-key-stale {
        background: #ef4444;
      }

      .lm-fit {
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: 500;
        padding: 7px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.16);
        color: #334155;
        font: 600 0.75rem/1 'Inter', system-ui, sans-serif;
        cursor: pointer;
      }

      .lm-fit:hover {
        background: #fff;
        color: #0f172a;
      }

      @media (max-width: 620px) {
        .lm-legend {
          font-size: 0.66rem;
          gap: 8px;
          padding: 6px 10px;
        }
      }
    `,
    /*
      Markers and popups are injected by Leaflet at runtime via innerHTML, so
      they never receive this component's scoping attribute. ::ng-deep is the
      only way to reach them — anchored to :host so nothing leaks page-wide.
    */
    `
      :host ::ng-deep .lm-pin {
        position: relative;
        width: 34px;
        height: 44px;
        display: grid;
        place-items: center;
        color: #fff;
        filter: drop-shadow(0 3px 5px rgba(15, 23, 42, 0.32));
      }

      :host ::ng-deep .lm-pin::before {
        content: '';
        position: absolute;
        inset: 0 0 8px 0;
        background: var(--pin, #ef4444);
        border: 2.5px solid #fff;
        border-radius: 50% 50% 50% 50% / 58% 58% 42% 42%;
      }

      :host ::ng-deep .lm-pin::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 2px;
        width: 10px;
        height: 12px;
        transform: translateX(-50%);
        background: var(--pin, #ef4444);
        clip-path: polygon(50% 100%, 0 0, 100% 0);
      }

      :host ::ng-deep .lm-pin-initials {
        position: relative;
        z-index: 1;
        margin-bottom: 8px;
        font: 700 0.68rem/1 'Inter', system-ui, sans-serif;
        letter-spacing: 0.02em;
      }

      :host ::ng-deep .lm-pin-pulse::before {
        animation: lm-pin-pulse 2.2s ease-out infinite;
      }

      @keyframes lm-pin-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5);
        }
        60% {
          box-shadow: 0 0 0 11px rgba(16, 185, 129, 0);
        }
      }

      :host ::ng-deep .lm-admin {
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(37, 99, 235, 0.22);
      }

      :host ::ng-deep .lm-admin span {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #2563eb;
        border: 2.5px solid #fff;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
      }

      :host ::ng-deep .lm-popup .leaflet-popup-content-wrapper {
        border-radius: 14px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.2);
        padding: 2px;
      }

      :host ::ng-deep .lm-popup .leaflet-popup-content {
        margin: 12px 14px;
        font-family: 'Inter', system-ui, sans-serif;
      }

      :host ::ng-deep .lm-pop-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      :host ::ng-deep .lm-pop-head strong {
        font-size: 0.95rem;
        color: #0f172a;
      }

      :host ::ng-deep .lm-pop-status {
        padding: 2px 8px;
        border: 1px solid;
        border-radius: 999px;
        font-size: 0.66rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      :host ::ng-deep .lm-pop-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 3px 14px;
        margin: 0 0 10px;
        font-size: 0.78rem;
      }

      :host ::ng-deep .lm-pop-grid dt {
        color: #64748b;
        font-weight: 500;
      }

      :host ::ng-deep .lm-pop-grid dd {
        margin: 0;
        text-align: right;
        color: #0f172a;
        font-weight: 600;
      }

      :host ::ng-deep .lm-pop-btn {
        display: block;
        padding: 8px 12px;
        border-radius: 10px;
        background: #4338ca;
        color: #fff !important;
        font-size: 0.78rem;
        font-weight: 600;
        text-align: center;
        text-decoration: none;
      }

      :host ::ng-deep .lm-pop-btn:hover {
        background: #3730a3;
      }

      :host ::ng-deep .marker-cluster-small,
      :host ::ng-deep .marker-cluster-medium,
      :host ::ng-deep .marker-cluster-large {
        background: rgba(67, 56, 202, 0.22);
      }

      :host ::ng-deep .marker-cluster-small div,
      :host ::ng-deep .marker-cluster-medium div,
      :host ::ng-deep .marker-cluster-large div {
        background: #4338ca;
        color: #fff;
        font: 700 0.78rem/30px 'Inter', system-ui, sans-serif;
      }
    `,
  ],
})
export class LocationMapComponent implements OnChanges, OnDestroy {
  @ViewChild('mapHost', { static: true }) private mapHost!: ElementRef<HTMLDivElement>;

  /** Participants to plot. Only rows with a latest location, already filtered. */
  @Input({ required: true }) participants: readonly ParticipantLocation[] = [];

  /** The admin's own position, drawn as the blue marker. */
  @Input() admin: Coordinates | null = null;

  /** Profile id to centre on and open. Set by the "Locate" action. */
  @Input() focusedProfileId: string | null = null;

  /** Clock value, so popup timestamps agree with the rest of the dashboard. */
  @Input() now: number = Date.now();

  /**
   * Show the "Fit all" control. On by default for the dashboard map, off for
   * the drawer's single-participant mini map where it would be meaningless.
   */
  @Input() showFitControl = true;

  /** Emitted when a participant marker is clicked. */
  @Output() readonly participantSelected = new EventEmitter<string>();

  /**
   * Flips true once Leaflet has loaded and the map exists.
   *
   * A signal rather than a plain field: it is set from inside
   * `afterNextRender`, which runs *outside* the Angular zone, so nothing would
   * schedule a change detection pass and the loading overlay would sit on top
   * of a perfectly working map forever. Signal writes schedule CD themselves.
   */
  readonly ready = signal(false);

  private readonly injector = inject(Injector);

  private leaflet: typeof LeafletNS | null = null;
  private map: LeafletNS.Map | null = null;
  private clusterGroup: LeafletNS.MarkerClusterGroup | null = null;
  private adminMarker: LeafletNS.Marker | null = null;
  private readonly markers = new Map<string, LeafletNS.Marker>();

  /** Set once the first non-empty render has framed the data. */
  private hasFitBounds = false;

  /** Changes that arrive before Leaflet finishes loading are replayed after. */
  private pendingRender = false;

  /**
   * Identity of the currently plotted marker set. Markers are rebuilt only when
   * this changes — see `renderMarkers()` for why that matters.
   */
  private markerSignature = '';

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private visibilityTimer: ReturnType<typeof setTimeout> | undefined;

  /** Guards against IntersectionObserver and the fallback both firing. */
  private initialising = false;

  constructor() {
    // afterNextRender only runs in the browser, which is exactly the guard we
    // need: Leaflet dereferences `window` as soon as it is imported.
    afterNextRender(
      () => {
        this.scheduleInitialisation();
      },
      { injector: this.injector },
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) {
      this.pendingRender = true;
      return;
    }

    // `now` is deliberately absent: it ticks every 30s and only affects popup
    // text, which is generated lazily on open. Rebuilding markers for it would
    // destroy and recreate every layer twice a minute — and slam shut whatever
    // popup the user was reading.
    if (changes['participants'] || changes['admin']) {
      this.renderMarkers();
    }

    if (changes['focusedProfileId']) {
      this.focusOnSelection();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.resizeTimer);
    clearTimeout(this.visibilityTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.map?.remove();
    this.map = null;
    this.clusterGroup = null;
    this.adminMarker = null;
    this.markers.clear();
  }

  /** Re-frames the map around everything currently plotted. */
  fitToMarkers(): void {
    if (!this.leaflet || !this.map) return;

    // Frame against the container's *current* size. Fitting bounds with a
    // stale size is the other half of the torn-tile bug: Leaflet picks a zoom
    // and centre for a box that is not the one on screen.
    this.map.invalidateSize({ animate: false });

    const points: LeafletNS.LatLngExpression[] = this.participants.map((p) => [
      p.latitude,
      p.longitude,
    ]);
    if (this.admin) {
      points.push([this.admin.latitude, this.admin.longitude]);
    }

    if (points.length === 0) {
      this.map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
      return;
    }

    if (points.length === 1) {
      this.map.setView(points[0], FOCUS_ZOOM);
      return;
    }

    this.map.fitBounds(this.leaflet.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }

  /**
   * Hold the Leaflet download until the map is actually about to be seen.
   *
   * The map sits below the table, so on a normal page load it is off-screen —
   * fetching ~150 kB of library plus a dozen tiles right then competes with the
   * Firestore round trip the user is actually waiting on. `rootMargin` starts
   * the work 400px early, so scrolling still lands on a ready map.
   */
  private scheduleInitialisation(): void {
    if (typeof IntersectionObserver === 'undefined') {
      void this.initialise();
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void this.initialise();
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN_PX + 'px' },
    );
    this.intersectionObserver.observe(this.mapHost.nativeElement);

    // Safety net. IntersectionObserver delivery can stall — notably while the
    // tab is hidden or backgrounded — and a map that never loads is a far worse
    // failure than one that loads slightly eagerly. Re-check by hand shortly
    // after mount and initialise if the host is on screen anyway.
    this.visibilityTimer = setTimeout(() => {
      if (!this.map && this.isNearViewport()) {
        void this.initialise();
      }
    }, VISIBILITY_FALLBACK_MS);
  }

  /** Manual equivalent of the IntersectionObserver test, same margin. */
  private isNearViewport(): boolean {
    const rect = this.mapHost.nativeElement.getBoundingClientRect();
    return (
      rect.bottom > -LAZY_ROOT_MARGIN_PX &&
      rect.top < window.innerHeight + LAZY_ROOT_MARGIN_PX &&
      rect.width > 0
    );
  }

  private async initialise(): Promise<void> {
    if (this.initialising || this.map) return;
    this.initialising = true;

    clearTimeout(this.visibilityTimer);
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;

    // Leaflet ships UMD; the ESM interop shape differs between bundlers, so
    // accept either. markercluster is a plugin that mutates the global `L`,
    // hence the assignment before its import.
    const mod = await import('leaflet');
    const leaflet = ((mod as unknown as { default?: typeof LeafletNS }).default ??
      mod) as typeof LeafletNS;
    (window as unknown as { L: typeof LeafletNS }).L = leaflet;
    await import('leaflet.markercluster');

    this.leaflet = leaflet;

    this.map = leaflet.map(this.mapHost.nativeElement, {
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      scrollWheelZoom: false, // page scroll wins until the user clicks in
      attributionControl: true,
    });

    // Click-to-zoom is friendlier than trapping the page scroll.
    this.map.once('focus', () => this.map?.scrollWheelZoom.enable());

    leaflet
      .tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
        crossOrigin: 'anonymous',
        // Keep a ring of off-screen tiles so a small pan is instant instead of
        // showing grey while the next row downloads.
        keepBuffer: 3,
        // Request tiles continuously while panning/zooming rather than waiting
        // for the gesture to finish — fewer visible grey gaps.
        updateWhenIdle: false,
        updateWhenZooming: false,
      })
      .addTo(this.map);

    this.clusterGroup = leaflet.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      // Skip the fly-in animations; on a refresh the whole layer is replaced
      // and the animation just delays the result.
      animateAddingMarkers: false,
      chunkedLoading: true,
    });
    this.map.addLayer(this.clusterGroup);

    this.observeResize();

    this.ready.set(true);
    this.renderMarkers();

    if (this.pendingRender) {
      this.pendingRender = false;
      this.focusOnSelection();
    }
  }

  /**
   * Keep Leaflet's cached container size honest.
   *
   * Leaflet measures the container once at init and lays every tile out against
   * that size. This component is mounted inside a mat-sidenav-content that
   * reflows when the details drawer opens, and the drawer's own mini map is
   * created *while the drawer is still animating* — at which point the element
   * is a fraction of its final width. Without this the tile grid tears into
   * offset rows with holes, which is exactly the breakage reported.
   */
  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      // Coalesce bursts — a drawer animation fires dozens of these — into one
      // invalidateSize. A timer rather than requestAnimationFrame on purpose:
      // rAF is paused entirely in a hidden/background tab, so a resize that
      // happened while the tab was in the background would never be applied
      // and the map would still be torn when the user came back to it.
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.map?.invalidateSize({ animate: false });
      }, 60);
    });

    this.resizeObserver.observe(this.mapHost.nativeElement);
  }

  /**
   * Rebuilds the marker layer — but only when the plotted set actually changed.
   *
   * The guard matters more than it looks. Inputs change on every 30s clock tick
   * and on every auto-refresh, and a rebuild tears down and recreates every
   * marker, every cluster and every popup. Without the signature check the map
   * visibly flickers twice a minute and any popup the user is reading snaps
   * shut. Position, status and name are all that can affect a marker, so they
   * are all the signature needs to cover.
   */
  private renderMarkers(): void {
    const leaflet = this.leaflet;
    const map = this.map;
    const cluster = this.clusterGroup;
    if (!leaflet || !map || !cluster) return;

    const signature = this.computeSignature();
    if (signature === this.markerSignature && this.markers.size > 0) {
      return;
    }
    this.markerSignature = signature;

    cluster.clearLayers();
    this.markers.clear();

    for (const participant of this.participants) {
      const marker = leaflet.marker([participant.latitude, participant.longitude], {
        icon: this.participantIcon(leaflet, participant),
        title: participant.name,
        riseOnHover: true,
      });

      // Content is a function, not a string: it is evaluated when the popup
      // opens, so "12 minutes ago" is correct on open without the marker
      // needing to be rebuilt every time the clock ticks.
      marker.bindPopup(() => this.popupHtml(participant), {
        className: 'lm-popup',
        minWidth: 210,
        closeButton: true,
      });
      marker.on('click', () => this.participantSelected.emit(participant.profileid));

      this.markers.set(participant.profileid, marker);
      cluster.addLayer(marker);
    }

    // Admin marker lives outside the cluster group so it is never swallowed
    // into a cluster bubble — "where am I" must always be visible.
    this.adminMarker?.remove();
    this.adminMarker = null;

    if (this.admin) {
      this.adminMarker = leaflet
        .marker([this.admin.latitude, this.admin.longitude], {
          icon: this.adminIcon(leaflet),
          zIndexOffset: 1000,
          title: 'Your location',
        })
        .bindPopup('<div class="lm-pop"><strong>You are here</strong></div>', {
          className: 'lm-popup',
        })
        .addTo(map);
    }

    if (!this.hasFitBounds && (this.participants.length > 0 || this.admin)) {
      this.hasFitBounds = true;
      this.fitToMarkers();
    }

    this.focusOnSelection();
  }

  /** Everything that can change a marker's appearance or position. */
  private computeSignature(): string {
    const admin = this.admin ? `${this.admin.latitude},${this.admin.longitude}` : 'none';
    const rows = this.participants
      .map((p) => `${p.profileid}:${p.latitude}:${p.longitude}:${p.status}:${p.name}`)
      .join('|');
    return `${admin}#${rows}`;
  }

  private focusOnSelection(): void {
    if (!this.map || !this.focusedProfileId) return;

    const marker = this.markers.get(this.focusedProfileId);
    if (!marker) return;

    // zoomToShowLayer un-clusters the marker first, otherwise a clustered pin
    // silently refuses to open its popup.
    const cluster = this.clusterGroup;
    if (cluster) {
      cluster.zoomToShowLayer(marker, () => {
        this.map?.setView(marker.getLatLng(), Math.max(this.map.getZoom(), FOCUS_ZOOM));
        marker.openPopup();
      });
    } else {
      this.map.setView(marker.getLatLng(), FOCUS_ZOOM);
      marker.openPopup();
    }
  }

  /** Teardrop pin tinted by freshness status. */
  private participantIcon(
    leaflet: typeof LeafletNS,
    participant: ParticipantLocation,
  ): LeafletNS.DivIcon {
    const color = getStatusColor(participant.status);
    const pulse = participant.status === 'live' ? ' lm-pin-pulse' : '';

    return leaflet.divIcon({
      className: 'lm-pin-wrap',
      html: `
        <div class="lm-pin${pulse}" style="--pin:${color}">
          <span class="lm-pin-initials">${escapeHtml(participant.initials)}</span>
        </div>`,
      iconSize: [34, 44],
      iconAnchor: [17, 42],
      popupAnchor: [0, -38],
    });
  }

  /** Blue "you are here" dot with a halo. */
  private adminIcon(leaflet: typeof LeafletNS): LeafletNS.DivIcon {
    return leaflet.divIcon({
      className: 'lm-admin-wrap',
      html: '<div class="lm-admin"><span></span></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14],
    });
  }

  private popupHtml(participant: ParticipantLocation): string {
    const name = escapeHtml(participant.name);
    const status = getStatusText(participant.status);
    const color = getStatusColor(participant.status);

    return `
      <div class="lm-pop">
        <div class="lm-pop-head">
          <strong>${name}</strong>
          <span class="lm-pop-status" style="color:${color};border-color:${color}">${status}</span>
        </div>
        <dl class="lm-pop-grid">
          <dt>Last updated</dt><dd>${escapeHtml(formatRelativeTime(participant.created, this.now))}</dd>
          <dt>Distance</dt><dd>${escapeHtml(formatDistance(participant.distanceMeters))}</dd>
          <dt>Latitude</dt><dd>${formatCoordinate(participant.latitude)}</dd>
          <dt>Longitude</dt><dd>${formatCoordinate(participant.longitude)}</dd>
        </dl>
        <a class="lm-pop-btn"
           href="${googleMapsUrl(participant.latitude, participant.longitude)}"
           target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </div>`;
  }
}

/**
 * Popup content is built as an HTML string (Leaflet's API), so participant
 * names — which come from Firestore — must be escaped before interpolation.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
