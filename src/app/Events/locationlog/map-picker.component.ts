/**
 * Click-to-pick location map for the reference-point picker.
 *
 * Leaflet + OpenStreetMap: free, no API key, no billing.
 *
 * ── Why the previous map appeared broken ─────────────────────────────────────
 * The first version registered leaflet.css through `angular.json`, which only
 * takes effect when the dev server restarts. On a server started before that
 * change the stylesheet never loaded, and Leaflet's tiles — which rely entirely
 * on its CSS for absolute positioning — rendered as a staircase of offset tiles
 * with gaps, alongside unstyled zoom controls. It read as a broken map; it was
 * an unstyled one.
 *
 * So the stylesheet is imported *here* instead, with `encapsulation: None`, and
 * ships inside this component's own lazy-loaded chunk. There is no build config
 * to forget and no server restart that can defeat it. Everything else in this
 * file is prefixed `.ll-map-picker` precisely because `None` makes these styles
 * global.
 *
 * ── The other classic failure ────────────────────────────────────────────────
 * Leaflet caches the container size at init and lays every tile against it, so
 * a container that resizes afterwards tears the grid. This component is only
 * ever created once the picker panel is already open (so the element has its
 * final size), and it still calls `invalidateSize()` from a ResizeObserver plus
 * a short ladder of timers, because the panel animates open.
 *
 * Markers use a CSS `divIcon`, not Leaflet's default PNG marker: the default
 * one resolves its image relative to the stylesheet and 404s under bundling.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import type * as LeafletNS from 'leaflet';

import { Coordinates } from './location.model';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Zoom when a point is already chosen, and when none is. */
const PICKED_ZOOM = 15;
const DEFAULT_ZOOM = 4;

/** Roughly central India — a sane opening view for this deployment. */
const DEFAULT_CENTER: [number, number] = [20.59, 78.96];

/**
 * invalidateSize ladder. The panel animates open, so one call on init is not
 * enough; these cover the animation without waiting on its completion event.
 */
const RESIZE_SETTLE_MS = [0, 150, 400, 800];

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ll-map-picker">
      <div #mapHost class="ll-map-picker-canvas"></div>

      @if (!ready()) {
        <div class="ll-map-picker-loading">
          <span class="ll-map-picker-spinner"></span>
          Loading map…
        </div>
      }

      @if (ready()) {
        <p class="ll-map-picker-hint">
          <span>Click anywhere on the map to drop the pin, or drag it.</span>
        </p>
      }
    </div>
  `,
  styles: [
    /*
      Leaflet's own stylesheet, bundled into this component's chunk rather than
      registered in angular.json — see the file header for why that matters.
    */
    `
      @import 'leaflet/dist/leaflet.css';
    `,
    `
      .ll-map-picker {
        position: relative;
      }

      .ll-map-picker-canvas {
        width: 100%;
        height: 280px;
        border-radius: 12px;
        border: 1px solid #e6eaf2;
        background: #eef2f7;
      }

      .ll-map-picker-loading {
        position: absolute;
        inset: 0 0 26px 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 8px;
        border-radius: 12px;
        background: #eef2f7;
        color: #64748b;
        font-size: 0.8rem;
        z-index: 500;
      }

      .ll-map-picker-spinner {
        width: 22px;
        height: 22px;
        border: 3px solid #cbd5e1;
        border-top-color: #4338ca;
        border-radius: 50%;
        animation: ll-map-picker-spin 0.9s linear infinite;
      }

      @keyframes ll-map-picker-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .ll-map-picker-hint {
        margin: 7px 0 0;
        font-size: 0.74rem;
        color: #5b6b83;
        text-align: center;
      }

      /* The dropped pin. A divIcon, so no PNG asset to resolve. */
      .ll-map-picker-pin {
        width: 30px;
        height: 40px;
        display: grid;
        place-items: center;
        filter: drop-shadow(0 3px 5px rgba(15, 23, 42, 0.35));
        cursor: grab;
      }

      .ll-map-picker-pin::before {
        content: '';
        position: absolute;
        top: 0;
        width: 30px;
        height: 30px;
        background: #4338ca;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 50% / 58% 58% 42% 42%;
      }

      .ll-map-picker-pin::after {
        content: '';
        position: absolute;
        bottom: 2px;
        width: 10px;
        height: 12px;
        background: #4338ca;
        clip-path: polygon(50% 100%, 0 0, 100% 0);
      }

      .ll-map-picker-pin span {
        position: relative;
        z-index: 1;
        margin-bottom: 9px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #fff;
      }

      .ll-map-picker .leaflet-container {
        font: inherit;
        border-radius: 12px;
      }
    `,
  ],
})
export class MapPickerComponent implements OnDestroy {
  @ViewChild('mapHost', { static: true }) private mapHost!: ElementRef<HTMLDivElement>;

  /** Where to open, and where to put the initial pin. */
  @Input() initial: Coordinates | null = null;

  /** Emitted whenever the pin moves — by click or by drag. */
  @Output() readonly pointPicked = new EventEmitter<Coordinates>();

  readonly ready = signal(false);

  private readonly injector = inject(Injector);

  private leaflet: typeof LeafletNS | null = null;
  private map: LeafletNS.Map | null = null;
  private marker: LeafletNS.Marker | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    afterNextRender(
      () => {
        void this.initialise();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }

  /** Recentre the map, e.g. when a place is chosen from the search results. */
  focusOn(coords: Coordinates, dropPin = true): void {
    if (!this.map) {
      this.initial = coords;
      return;
    }
    this.map.setView([coords.latitude, coords.longitude], PICKED_ZOOM);
    if (dropPin) this.placePin(coords, false);
  }

  private async initialise(): Promise<void> {
    const mod = await import('leaflet');
    const leaflet = ((mod as unknown as { default?: typeof LeafletNS }).default ??
      mod) as typeof LeafletNS;
    this.leaflet = leaflet;

    const start = this.initial;

    this.map = leaflet.map(this.mapHost.nativeElement, {
      center: start ? [start.latitude, start.longitude] : DEFAULT_CENTER,
      zoom: start ? PICKED_ZOOM : DEFAULT_ZOOM,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    leaflet
      .tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
        // CORS mode: under COEP require-corp a plain cross-origin image is
        // blocked. OSM sends Access-Control-Allow-Origin: *, so this loads.
        crossOrigin: 'anonymous',
        keepBuffer: 2,
      })
      .addTo(this.map);

    this.map.on('click', (event: LeafletNS.LeafletMouseEvent) => {
      this.placePin({ latitude: event.latlng.lat, longitude: event.latlng.lng }, true);
    });

    if (start) this.placePin(start, false);

    this.observeResize();
    this.settleSize();

    this.ready.set(true);
  }

  private placePin(coords: Coordinates, emit: boolean): void {
    const leaflet = this.leaflet;
    const map = this.map;
    if (!leaflet || !map) return;

    if (this.marker) {
      this.marker.setLatLng([coords.latitude, coords.longitude]);
    } else {
      this.marker = leaflet
        .marker([coords.latitude, coords.longitude], {
          draggable: true,
          icon: leaflet.divIcon({
            className: '',
            html: '<div class="ll-map-picker-pin"><span></span></div>',
            iconSize: [30, 40],
            iconAnchor: [15, 38],
          }),
        })
        .addTo(map);

      this.marker.on('dragend', () => {
        const position = this.marker?.getLatLng();
        if (position) {
          this.pointPicked.emit({ latitude: position.lat, longitude: position.lng });
        }
      });
    }

    if (emit) {
      this.pointPicked.emit(coords);
    }
  }

  /** See the header note: the panel animates open, so re-measure a few times. */
  private settleSize(): void {
    this.timers = RESIZE_SETTLE_MS.map((delay) =>
      setTimeout(() => this.map?.invalidateSize({ animate: false }), delay),
    );
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize({ animate: false });
    });
    this.resizeObserver.observe(this.mapHost.nativeElement);
  }
}
