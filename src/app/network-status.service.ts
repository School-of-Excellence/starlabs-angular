import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable, of, timer } from 'rxjs';
import { mapTo, switchMap, catchError, takeWhile, map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class NetworkStatusService {

  private onlineStatus = new BehaviorSubject<boolean>(navigator.onLine);
  public onlineStatus$ = this.onlineStatus.asObservable();
  private checkUrl = 'https://jsonplaceholder.typicode.com/posts'; // A known endpoint for testing

  constructor(private http: HttpClient) {
    // Listen to online and offline events
    const online$ = fromEvent(window, 'online').pipe(map(() => true));
    const offline$ = fromEvent(window, 'offline').pipe(map(() => false));

    // Merge online and offline observables
    merge(online$, offline$, of(navigator.onLine))
      .pipe(
        switchMap(status => {
          if (status) {
            // Check internet connection periodically until accessible
            return timer(0, 5000).pipe(
              switchMap(() => this.checkInternetConnection()),
              takeWhile(internetAccessible => !internetAccessible, true) // Continue checking until accessible
            );
          } else {
            // If offline, immediately set status to false
            return of(false);
          }
        })
      )
      .subscribe(status => {
        this.onlineStatus.next(status);
      });
  }

  public get isOnline(): boolean {
    return this.onlineStatus.getValue();
  }

  private checkInternetConnection(): Observable<boolean> {
    return this.http.get(this.checkUrl, { observe: 'response' }).pipe(
      map(() => true), // If the request succeeds, return true
      catchError(() => of(false)) // If the request fails, return false
    );
  }
}


