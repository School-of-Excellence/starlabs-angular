import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { take, switchMap } from 'rxjs';
import { AuthguardService } from './authguard.service';
import { Auth, authState } from '@angular/fire/auth';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmComponent } from './DialogBox/confirm/confirm.component';
import { MatDialog } from '@angular/material/dialog';

/**
 * Hard, role-based route guard. Unlike `authGuard` (whose allowed roles are DATA-DRIVEN from the
 * `dashboard` route-config and therefore only as tight as that config happens to be), this guard
 * enforces an explicit allow-list in code — defense in depth for sensitive screens.
 *
 * Use it ALONGSIDE `authGuard` (which handles the unauthenticated → /login bounce):
 *   canActivate: [authGuard, roleGuard(['developer', 'admin', 'ah'])]
 *
 * A logged-in user who holds none of `allowedRoles` is bounced to /EISDashboard with an
 * "Access denied" dialog — they never reach the component, so its data subscriptions never run.
 *
 * Landed for the `/arenastudioactivity` authorization gap: the live-studio monitor exposes every
 * live studio cross-queue (participant identities + Zoom host emails) and previously had no role
 * gate beyond the generic authGuard (see specs/journals/2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md
 * §Direction-1 #1 and specs/validated/04-dynamic-studio.md §3a; e2e SS-15b).
 */
export function roleGuard(allowedRoles: string[]): CanActivateFn {
  return (route, state) => {
    const authService = inject(AuthguardService);
    const router = inject(Router);
    const auth = inject(Auth);
    const dialog = inject(MatDialog);
    const snackbar = inject(MatSnackBar);

    return authState(auth).pipe(
      take(1),
      switchMap(async user => {
        if (!user || !user.uid) {
          // authGuard normally handles this first; guard defensively in case ordering changes.
          router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          return false;
        }
        try {
          const currentRoles = (await authService.getRoles()) || {};
          const hasRole = allowedRoles.some(role => currentRoles[role] === true);
          if (!hasRole) {
            dialog.open(ConfirmComponent, {
              data: {
                title: 'Access denied',
                message: "You don't have permission to access this screen.",
                cancelText: 'Close',
              },
              disableClose: true,
            });
            router.navigate(['/EISDashboard']);
            return false;
          }
          return true;
        } catch (error) {
          console.error('Error checking role permissions:', error);
          snackbar.open('Error checking permissions. Please try again.', 'Close', { duration: 3000 });
          router.navigate(['/EISDashboard']);
          return false;
        }
      })
    );
  };
}
