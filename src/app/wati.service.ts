import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { from, map, Observable, of, switchMap } from 'rxjs';
import { Subject, takeUntil, forkJoin, debounceTime, distinctUntilChanged } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class WatiService {
  private fetchTemplateapiUrl: string;
  private apiToken: string;
  private sendTemplateMsgUrl: string;
  private sendBroadcastTemplateMsgUrl: string;
  constructor(private http: HttpClient,
    private firestore: Firestore
  ) { }

  async serverURL(serverid,serverData) {
    this.fetchTemplateapiUrl = `https://live-mt-server.wati.io/${serverid}/api/v1/getMessageTemplates`;
    this.sendTemplateMsgUrl = `https://live-server-${serverid}.wati.io/api/v1/sendTemplateMessage?whatsappNumber=`;
    this.sendBroadcastTemplateMsgUrl = `https://live-server-${serverid}.wati.io/api/v1/sendTemplateMessages/`;
    this.apiToken = serverData[serverid]['watitoken']
  }

  getTemplates(serverid: string,serverData:Object): Observable<any[]> {
    return from(this.serverURL(serverid,serverData)).pipe(
      switchMap(() => {

        const headers = new HttpHeaders({
          accept: '*/*',
          Authorization: `Bearer ${this.apiToken.trim()}`,
        });

        const firstUrl = `${this.fetchTemplateapiUrl}?pageSize=200&pageNumber=1`;

        return this.http.get<any>(firstUrl, { headers }).pipe(
          switchMap((res) => {

            const templates = res.messageTemplates || [];
            const total = res.link?.total || 0;
            const pageSize = res.link?.pageSize || 200;

            const totalPages = Math.ceil(total / pageSize);

            const requests = [];

            for (let i = 2; i <= Math.min(totalPages, 9); i++) {
              const url = `${this.fetchTemplateapiUrl}?pageSize=200&pageNumber=${i}`;
              requests.push(this.http.get<any>(url, { headers }));
            }

            return forkJoin(requests).pipe(
              map((responses) => {
                const allTemplates = [...templates];

                responses.forEach(r => {
                  allTemplates.push(...(r.messageTemplates || []));
                });

                return allTemplates;
              })
            );
          })
        );
      })
    );
  }

  sendBroadcastMessage(phoneNumbers: string[], message: string, serverid: string,serverData:Object): Observable<any> {
    console.log('Send Broadcast Message Triggered');

    this.serverURL(serverid,serverData);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    });
    const body = {
      "messages": phoneNumbers.map(number => ({
        to: number,
        message: message
      }))
    };
    return this.http.post<any>(this.sendBroadcastTemplateMsgUrl, body, { headers });
  }

  // sendTemplateMessage(body, phonenumber) {

  //   const headers = new HttpHeaders({
  //     'Authorization': `Bearer ${this.apiToken}`,
  //     'Content-Type': 'application/json'
  //   });

  //   const apiUrl = this.apiUrl + phonenumber;

  //   return this.http.post(apiUrl, body, { headers });
  // }

  // // Fetch templates
  // getTemplates(): Observable<any> {
  //   const headers = new HttpHeaders({
  //   'Authorization': `Bearer ${this.apiToken}`,
  //   'Content-Type': 'application/json'
  //   });
  //   return this.http.get(this.apiUrl, { headers });
  // }


  // sendBroadcastMessage(phoneNumbers: string[], message: string): Observable<any> {
  //   const headers = new HttpHeaders({
  //     'Authorization': `Bearer ${this.apiToken}`,
  //     'Content-Type': 'application/json'
  //   });
  //   const body = {
  //     "messages": phoneNumbers.map(number => ({
  //       to: number,
  //       message: message
  //     }))
  //   };
  //   return this.http.post<any>(this.apiUrl, body, { headers });
  // }

}



