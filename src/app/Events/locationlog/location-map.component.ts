/**
 * Free map view for the Live Location Tracking dashboard.
 *
 * Leaflet + OpenStreetMap tiles: no API key, no billing account, no usage quota
 * to blow through — which is why it is here instead of Google Maps.
 *
 * Two implementation details worth knowing:
 *  - Leaflet touches `window` at import time, so it is loaded via a dynamic
 *    `import()` inside `afterNextRender`. That keeps SSR working and keeps
 *    ~150 kB out of the initial bundle for everyone who never opens this page.
 *  - Tiles are requested with `crossOrigin: 'anonymous'`. This app serves
 *    COEP: require-corp (for the Zoom SDK's cross-origin isolation), under
 *    which a plain cross-origin <img> is blocked. OSM sends
 *    `Access-Control-Allow-Origin: *`, so CORS-mode requests load fine.
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

/** OpenStreetMap standard tiles — free, and attribution is mandatory. */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** Zoom used when centring on a single participant. */
const FOCUS_ZOOM = 15;

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

  constructor() {
    // afterNextRender only runs in the browser, which is exactly the guard we
    // need: Leaflet dereferences `window` as soon as it is imported.
    afterNextRender(
      () => {
        void this.initialise();
      },
      { injector: this.injector },
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) {
      this.pendingRender = true;
      return;
    }

    if (changes['participants'] || changes['admin'] || changes['now']) {
      this.renderMarkers();
    }

    if (changes['focusedProfileId']) {
      this.focusOnSelection();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
    this.clusterGroup = null;
    this.adminMarker = null;
    this.markers.clear();
  }

  /** Re-frames the map around everything currently plotted. */
  fitToMarkers(): void {
    if (!this.leaflet || !this.map) return;

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

  private async initialise(): Promise<void> {
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
      })
      .addTo(this.map);

    this.clusterGroup = leaflet.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
    });
    this.map.addLayer(this.clusterGroup);

    this.ready.set(true);
    this.renderMarkers();

    if (this.pendingRender) {
      this.pendingRender = false;
      this.focusOnSelection();
    }
  }

  /**
   * Rebuilds the marker layer. Markers are cheap and the set is bounded by the
   * scan limit, so a full rebuild per refresh is simpler — and measurably
   * faster — than diffing Leaflet layers by hand.
   */
  private renderMarkers(): void {
    const leaflet = this.leaflet;
    const map = this.map;
    const cluster = this.clusterGroup;
    if (!leaflet || !map || !cluster) return;

    cluster.clearLayers();
    this.markers.clear();

    for (const participant of this.participants) {
      const marker = leaflet.marker([participant.latitude, participant.longitude], {
        icon: this.participantIcon(leaflet, participant),
        title: participant.name,
        riseOnHover: true,
      });

      marker.bindPopup(this.popupHtml(participant), {
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
