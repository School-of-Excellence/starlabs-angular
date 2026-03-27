import { CommonModule } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import { collection, doc, Firestore, getDocs, orderBy, query, setDoc, where } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthguardService } from '../../../authguard.service';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import * as XLSX from 'xlsx';

interface purchaseProduct {
  productref: any
  packageref: any
  minimumpayment: any
  tentativestart: any
  status: any
  unlimited: any
  participantproductid: any
  deliverytype: any
}

interface ParticipantPurchase {
  purchasetype: any
  participantjourneyproductref: any
  journeystatus: any
  purchaseref: any
  subscriptionstart: any
  subscriptionend: any
  journeyref: any
  productref: any
  watsonpurchaseid: any
  watsonpurchaselabel: any
  products: Array<purchaseProduct>
}

@Component({
  selector: 'app-bulk-add-products',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule,
    FormsModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './bulk-add-products.component.html',
  styleUrl: './bulk-add-products.component.css'
})
export class BulkAddProductsComponent {

  // Array declarations 
  productsList: any = [];
  allpackageList: any = [];
  addonpackageList: any = [];
  requiredJourneyKey = ["subscriptionstart", "subscriptionend"];
  requiredProductKey = ["productref", "packageref"];

  // String declarations 
  selectedProduct = null;

  // Object declarations 
  mapMinimumRequiredAmount: any = {};
  mapParticipantProducts: any = {};
  mapJourney: any = {};

  productForm: FormGroup;

  private firestore = inject(Firestore);

  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<BulkAddProductsComponent>,
    private fb: FormBuilder,
    public guard: AuthguardService,
    private dialog: MatDialog ) {

    this.productForm = this.fb.group({
      products: this.fb.array([])
    });
  }

  ngOnInit() {

    getDocs(collection(this.firestore, "journey")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapJourney[element['id']] = element['journey']
      }
    })

    getDocs(query(collection(this.firestore, "products"), orderBy("product", "asc"))).then((products)=> {
      if(products.docs.length != 0) {
        for (let i = 0; i < products.docs.length; i++) {
          const productref = products.docs[i].ref;
          const productdata = products.docs[i].data()
          productdata['productref'] = productref
          this.mapMinimumRequiredAmount[productdata["id"]] = productdata["minimumrequiredamount"]
          this.productsList.push(productdata);
        }
      }
    })

    getDocs(query(collection(this.firestore, "package"), orderBy("package"))).then(packagelist => {
      this.allpackageList = packagelist.docs.map((doc) => {
        const data = doc.data();
        data['docid'] = doc.id; // Add document ID
        return data;
      });

      var addonOption = []
      for (let i = 0; i < packagelist.docs.length; i++) {
        const value = packagelist.docs[i].data()
        value['docid'] = packagelist.docs[i].id; // Add document ID
        if (value["nonjourney"] ?? false) {
          addonOption.push(value)
        }
      }
      this.addonpackageList = addonOption
    })
  }

  get productsArray(): FormArray {
    return this.productForm.get('products') as FormArray;
  }

  get isFormValid(): boolean {
    return this.productForm.valid && this.productsArray.length > 0;
  }

  get loading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: "Processing Please wait" }, disableClose: true })
  }

  async fetchPurchase(product) {

    var profileid = product.profileid;
    var PurchaseboxList: Array<ParticipantPurchase> = []

    await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", profileid))).then(clientproduct => {
      const participantProducts = clientproduct.docs.map(e => e.data())
      for (let i = 0; i < participantProducts.length; i++) {
        const product = participantProducts[i];
        this.mapParticipantProducts[product["docid"]] = product
      }
    })

    var mapPurchase = {}
    await getDocs(query(collection(this.firestore, "journeyproductpurchase"), where("profileid", "==", profileid))).then(purchase => {
      for (let i = 0; i < purchase.docs.length; i++) {
        const doc = purchase.docs[i];
        mapPurchase[doc.id] = doc.data()
      }
    })

    await getDocs(query(collection(this.firestore, "participantjourneyproduct"), where("profileid", "==", profileid))).then(clientjourney => {
      for (let i = 0; i < clientjourney.docs.length; i++) {
        const journeyproduct = clientjourney.docs[i];
        const journeyproductdata = journeyproduct.data();
        var productList: Array<purchaseProduct> = [];
        if (journeyproductdata["participantproducts"].length == 0) {
          productList.push({
            productref: null,
            packageref: null,
            minimumpayment: null,
            tentativestart: null,
            status: null,
            unlimited: false,
            participantproductid: null,
            deliverytype: null
          })
        }
        for (let j = 0; j < journeyproductdata["participantproducts"].length; j++) {
          const product = journeyproductdata["participantproducts"][j];
          var mapProduct = this.mapParticipantProducts[product["participantproductid"]] ?? {}
          productList.push({
            productref: product["productref"]?.id ?? null,
            packageref: mapProduct["packageref"]?.id ?? null,
            minimumpayment: mapProduct["minimumpayment"] ?? (this.mapMinimumRequiredAmount[product["productref"]?.id] ?? null),
            tentativestart: mapProduct["tentativestart"]?.toDate() ?? null,
            status: mapProduct["status"] ?? null,
            unlimited: mapProduct["unlimited"] ?? false,
            participantproductid: mapProduct["docid"],
            deliverytype: mapProduct["deliverytype"] ?? null
          })
        }
        PurchaseboxList.push({
          purchasetype: journeyproductdata["journeyref"] != null ? "journey" : "product",
          participantjourneyproductref: journeyproductdata["docid"],
          journeystatus: journeyproductdata["journeystatus"] ?? null,
          journeyref: journeyproductdata["journeyref"]?.id ?? null,
          productref: journeyproductdata["participantproducts"].map(e => e["productref"]?.id),
          purchaseref: journeyproductdata["purchaseref"]?.id ?? null,
          subscriptionstart: journeyproductdata["subscriptionstart"]?.toDate() ?? null,
          subscriptionend: journeyproductdata["subscriptionend"]?.toDate() ?? null,
          products: productList,
          watsonpurchaseid: journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaseid"] : null,
          watsonpurchaselabel: journeyproductdata["purchaseref"] != null ? mapPurchase[journeyproductdata["purchaseref"].id]["watsonpurchaselabel"] : null,
        })
      }
      PurchaseboxList.sort((a, b) => a.purchasetype.localeCompare(b.purchasetype));

      let index = PurchaseboxList.findIndex((e)=> e['journeyref'] == product['journeyref']);

      PurchaseboxList[index].products.push({
        productref: product["productref"],
        packageref: product["packageref"],
        minimumpayment: product["minimumpayment"],
        tentativestart: product["tentativestart"],
        status: product["status"],
        unlimited: product["unlimited"],
        participantproductid: product["participantproductid"],
        deliverytype: product["deliverytype"]
      })
    })

    return PurchaseboxList;

  }

  // async addProduct() {
  //   // Clear existing products first
  //   while (this.productsArray.length !== 0) {
  //     this.productsArray.removeAt(0);
  //   }

  //   for (let i = 0; i < this.data.length; i++) {
  //     const element = this.data[i];

  //     try {
  //       const pjp = await getDocs(query(
  //         collection(this.firestore, "participantjourneyproduct"),
  //         where("profileid", "==", element.profileid),
  //         where("journeystatus", "in", ['initiated', 'ongoing'])
  //       ));

  //       if (pjp.docs.length == 1) {
  //         let journey = pjp.docs[0].data();

  //         const index = this.allpackageList.findIndex((e)=> this.mapJourney[journey['journeyref'].id] == e['package']);
  //         var packageRef = null;

  //         if(index != -1) {
  //           packageRef = this.allpackageList[index]['docid']
  //         }

  //         this.productsArray.push(this.fb.group({
  //           name: [element.name, Validators.required],
  //           profileid: [element.profileid, ''],
  //           journeyref: [journey['journeyref'].id, ''],
  //           productref: [this.selectedProduct, ''],
  //           packageref: [packageRef, Validators.required],
  //           minimumpayment: [this.mapMinimumRequiredAmount[this.selectedProduct], Validators.required],
  //           participantproductid: [null, ''],
  //           status: null,
  //           unlimited: false,
  //           deliverytype: null,
  //           tentativestart: null
  //         }));
  //       }
  //     } catch (error) {
  //       console.error('Error fetching journey data:', error);
  //     }
  //   }
  // }

  async addProduct() {
    const loading = this.loading;
    this.productsArray.clear();
    const profileIds = this.data.map(element => element.profileid);
    const BATCH_SIZE = 10;
    const journeyMap = new Map();
    const participantsWithoutJourney = []; 
    
    for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
      const batch = profileIds.slice(i, i + BATCH_SIZE);
      
      try {
        const pjpSnapshot = await getDocs(query(
          collection(this.firestore, "participantjourneyproduct"),
          where("profileid", "in", batch),
          where("journeystatus", "in", ['initiated', 'ongoing', 'completed'])
        ));

        const profileCounts = new Map();
        pjpSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const profileId = data['profileid'];
          
          if (!profileCounts.has(profileId)) {
            profileCounts.set(profileId, []);
          }
          profileCounts.get(profileId).push(data);
        });

        // Only add profiles with exactly 1 journey
        batch.forEach(profileId => {
          const journeys = profileCounts.get(profileId);
          
          if (!journeys || journeys.length === 0 || journeys.length > 1) {
            // No documents found for this profileId
            const participant = this.data.find(e => e.profileid === profileId);
            if (participant) {
              participantsWithoutJourney.push({
                "Name": participant['name'],
                "EMail": participant['email']
              });
            }
          } else if (journeys.length === 1) {
            // Exactly 1 journey found
            journeyMap.set(profileId, journeys[0]);
          }
        });
      } catch (error) {
        console.error('Error fetching journey data:', error);
      }
    }

    // Create a lookup map for packages
    const packageMap = new Map();
    this.allpackageList.forEach(pkg => {
      packageMap.set(pkg['package'], pkg['docid']);
    });

    // Now process all data with lookups instead of queries
    this.data.forEach(element => {
      const journey = journeyMap.get(element.profileid);
      
      if (journey && journey['journeyref']) {
        const journeyPackage = this.mapJourney[journey['journeyref'].id];
        const packageRef = packageMap.get(journeyPackage) || null;

        this.productsArray.push(this.fb.group({
          name: [element.name, Validators.required],
          profileid: [element.profileid, ''],
          journeyref: [journey['journeyref'].id, ''],
          productref: [this.selectedProduct, ''],
          packageref: [packageRef, Validators.required],
          minimumpayment: [this.mapMinimumRequiredAmount[this.selectedProduct], Validators.required],
          participantproductid: [null, ''],
          status: null,
          unlimited: false,
          deliverytype: null,
          tentativestart: null
        }));
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(participantsWithoutJourney);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Not Found Profiles');
    XLSX.writeFile(workbook, 'Not Found Profiles.xlsx');

    loading.close();
  }

  validateReview(participantPurchase) {
    var value: boolean = true
    let participantProductList = [];
    for (let i = 0; i < participantPurchase.length; i++) {
      const purchase = participantPurchase[i];
      purchase["productref"] = purchase["products"].map(e => e["productref"])
      if (purchase.purchasetype == "journey") {
        if (purchase.journeyref == null) {
          value = false
          break;
        }
      } else if (purchase.purchasetype == "product") {
        if ((purchase.productref ?? []).length == 0) {
          value = false
          break;
        }
      } else {
        value = false
        break;
      }
      for (let a = 0; a < this.requiredJourneyKey.length; a++) {
        const field = this.requiredJourneyKey[a];
        if ((purchase[field] ?? null) == null) {
          value = false
          i = participantPurchase.length + 1
          break;
        }
      }
      var purchaseProduct = purchase["products"]
      for (let j = 0; j < purchaseProduct.length; j++) {
        const product = purchaseProduct[j];
        if (product.participantproductid == null) {
          var productIndex = this.productsList.findIndex(e => e.id == product.productref)
          if (productIndex != -1) {
            product.unlimited = this.productsList[productIndex]["unlimited"] ?? false
          } else {
            console.log("Thappu nae")
          }
        }
        participantProductList.push({
          purchaseindex: i,
          participantproductid: product.participantproductid ?? null,
          joureyref: purchase.journeyref ?? null,
          productref: product.productref,
          packageref: product.packageref,
          tentativestart: product.tentativestart ?? null,
          minimumpayment: product.minimumpayment ?? null,
          status: product.status,
          sequenceorder: ((this.mapParticipantProducts[product.participantproductid] ?? {})["sequenceorder"]) ?? 1000,
          subscriptionstart: purchase.subscriptionstart,
          subscriptionend: purchase.subscriptionend,
          unlimited: product.unlimited ?? false,
          deliverytype: product['deliverytype'] ?? null
        })

        for (let a = 0; a < this.requiredProductKey.length; a++) {
          const field = this.requiredProductKey[a];
          if ((product[field] ?? null) == null) {
            value = false
            i = participantPurchase.length + 1
            j = purchaseProduct.length + 1
            break;
          }
        }
      }
    }
    return { value, participantProductList }
  }

  reviewPurchase(participantPurchase) {
    const data = this.validateReview(participantPurchase);
    let value = data.value;
    let participantProductList = data.participantProductList ?? [];

    if (value) {
      participantProductList.sort((a, b) => a["sequenceorder"] - b["sequenceorder"])
    } else {
      console.log("Review", participantPurchase)
    }

    return participantProductList;
  }

  loadingDialog(): MatDialogRef<any> {
    var loading = this.dialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: {
        msg: "Updating ....."
      }
    })
    return loading
  }

  async updateProduct(value) {
    // Progress tracking
    let totalOperations = 0;
    let completedOperations = 0;
    let loadingWidget = this.loadingDialog();

    // First, calculate total operations needed
    for (let j = 0; j < value.products.length; j++) {
      const productdata = value.products[j];
      let participantPurchase = await this.fetchPurchase(productdata);
      let participantProductList = this.reviewPurchase(participantPurchase);

      totalOperations += participantProductList.length; // participantsproduct docs
      totalOperations += participantPurchase.length * 2; // journeyproductpurchase + participantjourneyproduct
      totalOperations += 1; // delivery sequence update
    }

    console.log(`Total operations to perform: ${totalOperations}`);

    // Collect all operations before executing
    const allOperations = [];
    const allProfileUpdates = [];

    try {
      // Phase 1: Prepare all operations
      for (let j = 0; j < value.products.length; j++) {
        const productdata = value.products[j];
        let participantPurchase = await this.fetchPurchase(productdata);
        let participantProductList = this.reviewPurchase(participantPurchase);

        // Prepare participant product operations
        for (let i = 0; i < participantProductList.length; i++) {
          const product = participantProductList[i];

          var productData = {
            journeyref: product["journeyref"] != null ? doc(this.firestore, "journey", product["journeyref"]) : null,
            productref: product["productref"] != null ? doc(this.firestore, "products", product["productref"]) : null,
            packageref: product["packageref"] != null ? doc(this.firestore, "package", product["packageref"]) : null,
            tentativestart: product["tentativestart"] ?? null,
            minimumpayment: product["minimumpayment"] ?? null,
            status: product["status"],
            sequenceorder: i,
            subscriptionstart: product["subscriptionstart"] ?? null,
            subscriptionend: product["subscriptionend"] ?? null,
            unlimited: product["unlimited"] ?? false,
            profileid: productdata.profileid,
            deliverytype: product["deliverytype"]
          };

          if (product["participantproductid"] == null) {
            product["participantproductid"] = doc(collection(this.firestore, 'participantsproduct')).id;
            var additionalData = {
              docid: product["participantproductid"],
            }
            productData = { ...productData, ...additionalData };
          }

          allOperations.push({
            type: 'participantsproduct',
            docId: product["participantproductid"],
            data: productData,
            profileId: productdata.profileid
          });
        }

        // Prepare purchase operations
        for (let i = 0; i < participantPurchase.length; i++) {
          const purchase = participantPurchase[i];
          var purchaseproduct = participantProductList.filter(e => e["purchaseindex"] == i);
          var productRefList = purchaseproduct.map(e => doc(this.firestore, "products", e["productref"]));
          var productParticipantList = [];

          purchaseproduct.forEach(p => {
            productParticipantList.push({
              participantproductid: p["participantproductid"],
              productref: doc(this.firestore, "products", p["productref"])
            });
          });

          var purchaseData = {
            productref: productRefList,
            watsonpurchaseid: purchase["watsonpurchaseid"],
            watsonpurchaselabel: purchase["watsonpurchaselabel"],
          };

          var journeyproductData = {
            journeystatus: purchase["journeystatus"],
            productref: productRefList,
            participantproducts: productParticipantList,
            subscriptionstart: purchase["subscriptionstart"] ?? null,
            subscriptionend: purchase["subscriptionend"] ?? null,
          };

          purchase["participantjourneyproductref"] = purchase["participantjourneyproductref"] ?? doc(collection(this.firestore, 'participantjourneyproduct')).id;

          if (purchase["purchaseref"] == null) {
            purchase["purchaseref"] = doc(collection(this.firestore, 'journeyproductpurchase')).id;
            var additionalPurchase = {
              docid: purchase["purchaseref"],
              journeyref: purchase["journeyref"] != null ? doc(this.firestore, "journey", purchase["journeyref"]) : null,
              participantjourneyproductref: doc(this.firestore, "participantjourneyproduct", purchase["participantjourneyproductref"]),
              profileid: productdata.profileid,
              purchasetype: purchase["purchasetype"]
            };
            purchaseData = { ...purchaseData, ...additionalPurchase };

            var additionaljourneyproductData = {
              docid: purchase["participantjourneyproductref"],
              journeyref: purchase["journeyref"] != null ? doc(this.firestore, "journey", purchase["journeyref"]) : null,
              purchaseref: doc(this.firestore, "journeyproductpurchase", purchase["purchaseref"]),
              profileid: productdata.profileid,
            };
            journeyproductData = { ...journeyproductData, ...additionaljourneyproductData };
          }

          allOperations.push({
            type: 'journeyproductpurchase',
            docId: purchase["purchaseref"],
            data: purchaseData,
            profileId: productdata.profileid
          });

          allOperations.push({
            type: 'participantjourneyproduct',
            docId: purchase["participantjourneyproductref"],
            data: journeyproductData,
            profileId: productdata.profileid
          });
        }

        // Store for delivery sequence update
        allProfileUpdates.push({
          profileId: productdata.profileid,
          participantProductList: participantProductList
        });
      }

      // Phase 2: Execute all Firestore operations with error tracking
      console.log(`Starting execution of ${allOperations.length} Firestore operations...`);
      const operationPromises = [];

      for (const operation of allOperations) {
        const promise = setDoc(
          doc(this.firestore, operation.type, operation.docId),
          operation.data,
          { merge: true }
        ).then(() => {
          completedOperations++;
          console.log(`Progress: ${completedOperations}/${totalOperations} operations completed (${Math.round((completedOperations / totalOperations) * 100)}%)`);
          return { success: true, operation };
        }).catch(error => {
          console.error(`Failed operation:`, operation, error);
          return { success: false, operation, error };
        });

        operationPromises.push(promise);
      }

      // Wait for all Firestore operations
      const results = await Promise.all(operationPromises);

      // Check if any operation failed
      const failedOperations = results.filter(result => !result.success);

      if (failedOperations.length > 0) {
        console.error(`${failedOperations.length} operations failed:`, failedOperations);
        throw new Error(`Failed to update ${failedOperations.length} documents. No delivery sequences will be updated.`);
      }

      console.log('All Firestore operations completed successfully. Starting delivery sequence updates...');

      // Phase 3: Update delivery sequences only if all Firestore operations succeeded
      const deliveryPromises = allProfileUpdates.map(async (profileUpdate) => {
        try {
          await this.guard.updateDeliverySequence(profileUpdate.profileId, profileUpdate.participantProductList);
          completedOperations++;
          console.log(`Progress: ${completedOperations}/${totalOperations} operations completed (${Math.round((completedOperations / totalOperations) * 100)}%)`);
          return { success: true, profileId: profileUpdate.profileId };
        } catch (error) {
          console.error(`Failed to update delivery sequence for profile ${profileUpdate.profileId}:`, error);
          return { success: false, profileId: profileUpdate.profileId, error };
        }
      });

      const deliveryResults = await Promise.all(deliveryPromises);
      const failedDeliveryUpdates = deliveryResults.filter(result => !result.success);

      if (failedDeliveryUpdates.length > 0) {
        console.error(`${failedDeliveryUpdates.length} delivery sequence updates failed:`, failedDeliveryUpdates);
        // Note: At this point, Firestore docs are already updated, but some delivery sequences failed
        // You might want to implement a cleanup mechanism or log for manual intervention
      }

      console.log('All operations completed successfully!');
      loadingWidget.close();
      this.dialogRef.close();

    } catch (error) {
      console.error('Critical error during update process:', error);
      // Since we're using Promise.all with proper error handling, 
      // any failure in Firestore operations will prevent delivery sequence updates
      throw error;
    }
  }

  updatePurchase(participantProductList, participantPurchase, product) {
    console.log("Purchase.......")
    var write = 0
    for (let i = 0; i < participantPurchase.length; i++) {
      const purchase = participantPurchase[i];
      var purchaseproduct = participantProductList.filter(e => e["purchaseindex"] == i)
      var productRefList = purchaseproduct.map(e => doc(this.firestore, "products", e["productref"]))
      var productParticipantList = []
      purchaseproduct.forEach(p => {
        productParticipantList.push({
          participantproductid: p["participantproductid"],
          productref: doc(this.firestore, "products", p["productref"])
        })
      })
      var purchaseData = {
        productref: productRefList,
        watsonpurchaseid: purchase["watsonpurchaseid"],
        watsonpurchaselabel: purchase["watsonpurchaselabel"],
      }
      var journeyproductData = {
        journeystatus: purchase["journeystatus"],
        productref: productRefList,
        participantproducts: productParticipantList,
        subscriptionstart: purchase["subscriptionstart"] ?? null,
        subscriptionend: purchase["subscriptionend"] ?? null,
      }
      purchase["participantjourneyproductref"] = purchase["participantjourneyproductref"] ?? doc(collection(this.firestore, 'participantjourneyproduct')).id
      if (purchase["purchaseref"] == null) {
        purchase["purchaseref"] = doc(collection(this.firestore, 'journeyproductpurchase')).id
        var additionalPurchase = {
          docid: purchase["purchaseref"],
          journeyref: purchase["journeyref"] != null ? doc(this.firestore, "journey", purchase["journeyref"]) : null,
          participantjourneyproductref: doc(this.firestore, "participantjourneyproduct", purchase["participantjourneyproductref"]),
          profileid: product.profileid,
          purchasetype: purchase["purchasetype"]
        }
        purchaseData = { ...purchaseData, ...additionalPurchase }
        var additionaljourneyproductData = {
          docid: purchase["participantjourneyproductref"],
          journeyref: purchase["journeyref"] != null ? doc(this.firestore, "journey", purchase["journeyref"]) : null,
          purchaseref: doc(this.firestore, "journeyproductpurchase", purchase["purchaseref"]),
          profileid: product.profileid,
        }
        journeyproductData = { ...journeyproductData, ...additionaljourneyproductData }
      }
      console.log("journeyproductpurchase", "-----", purchaseData)
      console.log("participantjourneyproduct", "-----", journeyproductData)
      setDoc(doc(this.firestore, "journeyproductpurchase", purchase["purchaseref"]), purchaseData, { merge: true }).then(async() => {
        write += 1
        if (write == (participantPurchase.length * 2)) {
          await this.updateDeliverySequence(participantProductList, product)
        }
      }).catch(err => {
        console.log(err)
        i = participantPurchase.length + 1
        // this.loadingWidget?.close()
      })
      setDoc(doc(this.firestore, "participantjourneyproduct", purchase["participantjourneyproductref"]), journeyproductData, { merge: true }).then(async() => {
        write += 1
        if (write == (participantPurchase.length * 2)) {
          await this.updateDeliverySequence(participantProductList, product)
        }
      }).catch(err => {
        console.log(err)
        i = participantPurchase.length + 1
        // this.loadingWidget?.close()
      })
    }
  }

  async updateDeliverySequence(participantProductList, product) {
    console.log("done")
    await this.guard.updateDeliverySequence(product.profileid, participantProductList).catch(err => {
      console.log(err)
    })
  }

}
