import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from '@angular/fire/firestore';
import { initializeApp } from '@angular/fire/app';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

const app = initializeApp(environment.firebase);
// enable durable, multi-tab offline persistence (default + named ATC database) before any component reads them
const offlineCache = { }; 
const firestore = initializeFirestore(app, offlineCache);
initializeFirestore(app, {localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })}, 'firestore-atc');

(window as any).process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: (fn: any) => setTimeout(fn, 0),
};

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    appConfig.providers, provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch((err) => console.error(err));

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Each child in a list should have a unique')) {
    return; // suppress Zoom SDK's React key warning
  }
  originalWarn.apply(console, args);
};

  
