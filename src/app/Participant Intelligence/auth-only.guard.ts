import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { Auth, authState } from '@angular/fire/auth';
import { MatSnackBar } from '@angular/material/snack-bar';
import { authGuard } from '../auth.guard';
import { environment } from '../../environments/environment';

// Guard for /participant-intelligence.
// On the starlabs-test project (active development), allow any signed-in user so the screen can be
// demoed/tested before a `dashboard` doc exists. On any other project, defer to the full `authGuard`
// (Firebase auth + dashboard role/profile authorization) so production never exposes the screen role-free.
export const loggedInGuard: CanActivateFn = (route, state) => {
  if (environment.firebase?.projectId !== 'starlabs-test') {
    return authGuard(route, state);
  }

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
