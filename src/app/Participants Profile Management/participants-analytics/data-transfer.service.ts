import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class DataTransferService {

  public localStorageName = []

  constructor(private router : Router){}

  ngOnDestroy(){
    this.clearData()
  }

  // Method to set data
  setData(data: any,navigationurl:string,localstoragename:string) {
    this.localStorageName.push(localstoragename)
    // console.log("setData",this.data);
    localStorage.setItem(localstoragename, JSON.stringify(data));
    const url = this.router.createUrlTree([`/${navigationurl}`],{queryParams:{"localStorageItemName":localstoragename}})
    window.open(url.toString(), '_blank')    
  }

  // Method to get data
  // getData():any{
  //   return this.data;
  // }

  // Optional: Method to clear data
  clearData() {
    for (let i = 0; i < this.localStorageName.length; i++) {
      const element = this.localStorageName[i];
      localStorage.removeItem(element)
    }
  }
  
}
