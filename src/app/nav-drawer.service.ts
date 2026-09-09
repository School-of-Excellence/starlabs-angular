import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Lets a screen that hides the app toolbar still open the app's navigation drawer.
 *
 * The drawer is declared in AppComponent's template, so a child route cannot reach it directly and the
 * toolbar's own hamburger is not rendered on those screens. AppComponent subscribes to `toggle$` and
 * calls its existing `toggleLeftDrawer()`.
 */
@Injectable({ providedIn: 'root' })
export class NavDrawerService {
  private readonly toggleSubject = new Subject<void>();
  readonly toggle$ = this.toggleSubject.asObservable();

  toggle(): void { this.toggleSubject.next(); }
}
