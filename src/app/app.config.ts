import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore,provideFirestore } from '@angular/fire/firestore';
import { routes } from './app.routes';
import { ApplicationConfig, provideZoneChangeDetection , importProvidersFrom } from '@angular/core';
// Import the BASE environment (the file angular.json fileReplacements swap per configuration:
// development -> environment.development.ts, emulator -> environment.emulator.ts). main.ts imports the same
// base environment, creates the default Firebase app and (in emulator mode) connects it to the emulator FIRST;
// these providers reuse that app. environment.ts and environment.development.ts are identical here, so the
// dev/cloud/prod builds are behaviourally unchanged — this only lets the `emulator` fileReplacement apply.
import { environment } from '../environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { FIREBASE_OPTIONS } from '@angular/fire/compat';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatNativeDateModule } from '@angular/material/core';
import { SafeImgDirective } from './shared/safe-img.directive';
import { provideMarkdown } from 'ngx-markdown';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirestore(()=>getFirestore()),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
    provideHttpClient(),
    provideMarkdown(),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    DatePipe,
    importProvidersFrom(MatNativeDateModule),
    { provide: FIREBASE_OPTIONS, useValue: environment.firebase }
  ]
};