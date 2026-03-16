import { Component, OnInit } from '@angular/core';
import { Firestore,collection, collectionData,query,doc,getDocs, orderBy } from '@angular/fire/firestore';
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatAccordion } from '@angular/material/expansion';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { MatListModule } from '@angular/material/list';
import { ProductModeConfigupdateComponent } from './product-mode-configupdate/product-mode-configupdate.component';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { DialogAddProductComponent } from '../../Product Designer/add-product/dialog-add-product/dialog-add-product.component';

@Component({
  selector: 'app-product-mode-config',
  templateUrl: './product-mode-config.component.html',
  standalone:true,
  imports:[MatExpansionModule,MatIconModule,CommonModule,MatListModule],
  styleUrls: ['./product-mode-config.component.css']
})
export class ProductModeConfigComponent implements OnInit {
  firestore = inject(Firestore);
  productSubscription: Subscription
  productList = []
  productmodeSubscription: Subscription
  productmodeConfig = {}
  // Reference List
  mapReference = {}
  mapProducts: any = {};
  adsPlaylist = []
  solarVoicePlaylist = []
  eiflixPlaylist = []
  generalcontentPlaylist = []
  formtemplatelist = []
  constructor(
    public dialog : MatDialog,
    public guard: AuthguardService,
    public router: Router
  ) {
    // guard.getRoles().then(async roles=>{
    //   var ah = roles.ah
    //   var admin = roles.admin
    //   var developer = roles.developer
    //   if(ah || admin || developer){
        const productModeConfigRef = collection(this.firestore, 'product mode config');
         this.productmodeSubscription = collectionData(productModeConfigRef, { idField: 'id' }) .subscribe((config: any[]) => {
          config.forEach(element => {
            var product = element["productref"].id
            var mode = element["mode"]
            this.productmodeConfig[product+mode] = element
          })
          console.log(this.productmodeConfig)
        })
        const productsRef = collection(this.firestore, 'products');
        const productsQuery = query(productsRef, orderBy('product'));
        this.productSubscription = collectionData(productsQuery, { idField: 'id' }).subscribe(product => {
          this.productList = product
          product.forEach(element => {
            this.mapProducts[element['id']] = element;
          });
        })
    //   }
    //   else{
    //     alert("The Access to this screen is restricted")
    //     router.navigateByUrl("/")
    //   }
    // }).catch(err=>{
    //   console.log(err)
    // })
  }

  async ngOnInit(): Promise<void>{
    // Ads Playlist
    const adsQuery = query(
      collection(this.firestore, 'adsplaylist'),
      orderBy('adstitle')
    );
    const adsSnapshot = await getDocs(adsQuery);
    adsSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['adstitle'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.adsPlaylist.push(data);
    });

    // Solar Voice Playlist
    const solarQuery = query(
      collection(this.firestore, 'solar voice playlist'),
      orderBy('name')
    );
    const solarSnapshot = await getDocs(solarQuery);
    solarSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['name'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.solarVoicePlaylist.push(data);
    });
    // EiFlix Playlist
    const seriesQuery = query(collection(this.firestore, 'series'),  orderBy('seriesName') );
    const seriesSnapshot = await getDocs(seriesQuery);
    seriesSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['seriesName'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.eiflixPlaylist.push(data);
    });
    // General Content Playlist
    const contentQuery = query( collection(this.firestore, 'content_urls'), orderBy('title') );
    const contentSnapshot = await getDocs(contentQuery);
    contentSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['title'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.generalcontentPlaylist.push(data);
    });
    // Form List
    const formQuery = query( collection(this.firestore, 'delivery forms'),  orderBy('formname') );
    const formSnapshot = await getDocs(formQuery);
    formSnapshot.forEach(docSnap => {
      const data: any = docSnap.data();
      data['title'] = data['formname'];
      data['value'] = docSnap.ref.path;
      this.mapReference[data['value']] = data['title'];
      this.formtemplatelist.push(data);
    });
  }
  ngOnDestroy(){
    this.productmodeSubscription.unsubscribe()
    this.productSubscription.unsubscribe()
  }

  editProduct (data){
    console.log(data);
    this.dialog.open(DialogAddProductComponent, {
      data : data,
      maxHeight: "90vh",
      maxWidth: "90vw"
    }) 
  }

  updateConfig(mode, product){
    window.scrollTo({
      top : 0,
      behavior: 'auto',
    })

    setTimeout(() => {
      const productDocRef = doc(collection(this.firestore, 'products'), product);
      var data = this.productmodeConfig[product+mode] ?? {
        productref: productDocRef,
        mode: mode
      }
      console.log(mode, product, data)
      this.dialog.open(ProductModeConfigupdateComponent, {
        data : {
          config: data,
          product: product,
          mapProducts: this.mapProducts,
          reference: {
            adsplaylist: this.adsPlaylist,
            solarvoiceplaylist: this.solarVoicePlaylist,
            eiflixplaylist: this.eiflixPlaylist,
            generalcontentplaylist: this.generalcontentPlaylist,
            formlist: this.formtemplatelist
          }
        },
        maxHeight: "90vh",
        maxWidth: "90vw"
      })
    }, 0);
  }

}
