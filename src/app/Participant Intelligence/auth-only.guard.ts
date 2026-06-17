import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { Auth, authState } from '@angular/fire/auth';
import { MatSnackBar } from '@angular/material/snack-bar';

// TEMPORARY guard for /participant-intelligence.
// Requires the user to be signed in (so Firestore reads are permitted) but skips the
// dashboard-role/permission check. Swap this back to `authGuard` once a `dashboard`
// document for route '/participant-intelligence' is configured.
export const loggedInGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const auth = inject(Auth);
  const snackbar = inject(MatSnackBar);

  return authState(auth).pipe(
    take(1),
    map((user) => {
      if (!user || !user.uid) {
        snackbar.open('You need to log in to access this page.', 'Close', { duration: 3000 });
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }
      return true;
    })
  );
};
