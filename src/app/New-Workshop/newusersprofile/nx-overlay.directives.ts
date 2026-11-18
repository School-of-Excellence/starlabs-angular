import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { hasModifierKey } from '@angular/cdk/keycodes';
import { Subscription } from 'rxjs';

/**
 * Moves focus to its element once it is rendered (browser only). Used on the desktop panel roots and on the
 * checked Conversion option, so a keyboard user lands inside the panel the pill just opened.
 * `[nxAutofocus]="false"` turns it off for that element.
 */
@Directive({ selector: '[nxAutofocus]', standalone: true })
export class NxAutofocusDirective implements AfterViewInit {
  @Input({ alias: 'nxAutofocus', transform: booleanAttribute }) enabled = true;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngAfterViewInit(): void {
    if (!this.isBrowser || !this.enabled) return;
    setTimeout(() => {
      const el = this.el.nativeElement;
      if (el?.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
    });
  }
}

/**
 * A bottom sheet (narrow layout): the template is attached to a CDK overlay fixed to the bottom of the
 * viewport, centred, at most 640px wide (a wide window with the sidenav open stays readable), over a scrim.
 *
 * Why not cdkConnectedOverlay: it re-applies its connected-position inputs on every change, which a global
 * position strategy does not support. Why not an in-page fixed element: the screen root is a size container
 * (layout containment), so position:fixed inside it is relative to the root, not the viewport.
 *
 * `(nxSheetClose)` fires on a scrim click and on Escape; the host decides what closing means.
 */
@Directive({ selector: 'ng-template[nxSheet]', standalone: true })
export class NxSheetDirective implements OnChanges, OnDestroy {
  @Input({ alias: 'nxSheetOpen', transform: booleanAttribute }) open = false;
  @Output('nxSheetClose') readonly closeRequest = new EventEmitter<void>();

  private readonly overlay = inject(Overlay);
  private readonly zone = inject(NgZone);
  private readonly portal = new TemplatePortal(inject(TemplateRef), inject(ViewContainerRef));
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private ref: OverlayRef | null = null;
  private readonly subs = new Subscription();

  ngOnChanges(): void {
    if (this.open) this.attach();
    else this.detach();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.ref?.dispose();
    this.ref = null;
  }

  private attach(): void {
    if (!this.isBrowser) return;
    if (!this.ref) {
      this.ref = this.overlay.create({
        positionStrategy: this.overlay.position().global().centerHorizontally().bottom('0'),
        scrollStrategy: this.overlay.scrollStrategies.block(),
        hasBackdrop: true,
        backdropClass: 'nx-scrim-backdrop',
        panelClass: 'nx-sheet-pane',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '94vh',
      });
      this.subs.add(this.ref.backdropClick().subscribe(() => this.requestClose()));
      this.subs.add(this.ref.keydownEvents().subscribe(event => {
        if (event.key === 'Escape' && !hasModifierKey(event)) {
          event.preventDefault();
          this.requestClose();
        }
      }));
    }
    if (!this.ref.hasAttached()) this.ref.attach(this.portal);
  }

  private detach(): void {
    if (this.ref?.hasAttached()) this.ref.detach();
  }

  private requestClose(): void {
    this.zone.run(() => this.closeRequest.emit());
  }
}
