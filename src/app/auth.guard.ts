import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take, switchMap, of } from 'rxjs';
import { AuthguardService } from './authguard.service';
import { Auth, authState } from '@angular/fire/auth';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmComponent } from './DialogBox/confirm/confirm.component';
import { MatDialog } from '@angular/material/dialog';
import { environment } from '../environments/environment';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthguardService);
  const router = inject(Router);
  const auth = inject(Auth);
  const dialog = inject(MatDialog)
  const snackbar = inject(MatSnackBar);
  
  return authState(auth).pipe(
    take(1),
    switchMap(async user => {
      console.log("Requested URL", state)
      if (!user || !user.uid) {
        snackbar.open('You need to log in to access this page.', 'Close', {
          duration: 3000,
        });
        router.navigate(['/login'], {queryParams: {returnUrl: state.url}});
        return false;
      }
      if (state.url === '/EISDashboard') {
        return true;
      }
      // Test-only bypass for the new Arena Event Planning screen while it has no
      // role/profile config. Active only on starlabs-test, never in production.
      if (environment.firebase.projectId === 'starlabs-test'
          && ('/' + state.url.split('?')[0].split('/')[1]) === '/arena-event-planning') {
        return true;
      }
      try {
        const currentRoles = await authService.getRoles();
        const loggedProfileId = (await authService.username())['profileid'] ?? '';
        // const cleanUrl = '/' + state.url.split('/')[1];
        const cleanUrl = '/' + state.url.split('?')[0].split('/')[1];
        const { roles: routeConfigRoles, label: routeLabel , profileid :  routeConfigProfiles   } = await authService.routeConfig(cleanUrl);
        // const { roles: routeConfigRoles, label: routeLabel } = await authService.routeConfig(state.url);
        const rolesArray = Object.keys(currentRoles).filter(key => currentRoles[key] === true);

        console.log(rolesArray, "rolesArray logggg");
        console.log(state.url, "current route URL");

        console.log(routeConfigProfiles ,loggedProfileId)
        const hasAccess = (rolesArray.some(role => routeConfigRoles?.includes(role))) || (routeConfigProfiles.includes(loggedProfileId))
        //  (accessType === 'profile' && routeConfigProfiles)
        console.log('has access : ',hasAccess)
        if (!hasAccess) {
          if (routeConfigRoles.length === 0 && routeConfigProfiles.length === 0) {
            console.log('No roles or profiles for this screen, contact admin');
              dialog.open(ConfirmComponent, {
                data: {
                  title: 'Contact Admin',
                  message: `No roles or profiles configured for screen: ${routeLabel || state.url}`,
                  // confirmText: 'Yes',
                  cancelText: 'Close'
                },
                disableClose: true
              });
            // snackbar.open('No roles for this screen, contact admin.', 'Close', {
            //   duration: 3000,
            // });
          } else {
            console.log('Access denied: insufficient permissions');
            dialog.open(ConfirmComponent, {
              data: {
                title: 'Access denied',
                message: `You don't have permission to access: ${routeLabel || state.url}`,
                // confirmText: 'Yes',
                cancelText: 'Close'
              },
              disableClose: true
            });
            // snackbar.open('Access denied: insufficient permissions.', 'Close', {
            //   duration: 3000,
            // });
          }
          // router.navigate(['/EISDashboard']);
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('Error checking permissions:', error);
        snackbar.open('Error checking permissions. Please try again.', 'Close', {
          duration: 3000,
        });
        router.navigate(['/EISDashboard']);
        return false;
      }
    })
  );
};