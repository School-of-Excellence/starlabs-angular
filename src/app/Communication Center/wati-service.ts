import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class WatiService {

  apiToken = '';
  apiUrl = '';

  constructor(private http: HttpClient, private firestore: Firestore) {

    getDoc(doc(this.firestore, "classify", "wati")).then((wati) => {
      if (wati.exists()) {
        this.apiToken = wati.data()['wati'][0]['watitoken'];
        this.apiUrl = wati.data()['wati'][0]['endpoint'] + '/api/v1/templates';
      }
    });

  }

  // Fetch templates
  getTemplates(): Observable<any> {
    const headers = new HttpHeaders({
    'Authorization': `Bearer ${this.apiToken}`,
    'Content-Type': 'application/json'
    });
    return this.http.get(this.apiUrl, { headers });
  }
  
  sendTemplateMessage(body,phonenumber){

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    });

    const apiUrl = this.apiUrl + phonenumber;

    return this.http.post(apiUrl, body, { headers });
  }

  sendBroadcastMessage(phoneNumbers: string[], message: string): Observable<any> {
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
    return this.http.post<any>(this.apiUrl, body, { headers });
  }

}