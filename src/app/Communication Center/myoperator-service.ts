import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class MyOperatorService {
  private apiUrl = '';
  private token = '';

  constructor(private http: HttpClient,private firestore: Firestore,
  ) { 

    getDoc(doc(this.firestore, "classify", "myoperator")).then((wati) => {
      if (wati.exists()) {
        this.token = wati.data()['apitoken'];
        this.apiUrl = wati.data()['apiurl'];
      }
    });


  }

  fetchUsers(): Observable<any> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    });

    return this.http.get(`${this.apiUrl}/user`, { headers });
  }

}