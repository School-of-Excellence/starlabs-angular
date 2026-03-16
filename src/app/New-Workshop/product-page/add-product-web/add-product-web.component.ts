// import { Component, Inject } from '@angular/core';
// import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
// import { MatButtonModule } from '@angular/material/button';
// import { MatIconModule } from '@angular/material/icon';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import {
//   FormBuilder,
//   FormGroup,
//   Validators,
//   ReactiveFormsModule
// } from '@angular/forms';
// import { CommonModule } from '@angular/common';
// import {
//   Firestore,
//   doc,
//   getDoc,
//   setDoc,
//   updateDoc,
//   arrayUnion
// } from '@angular/fire/firestore';
// import {
//   getStorage,
//   ref,
//   uploadBytes,
//   getDownloadURL
// } from '@angular/fire/storage';
// import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// @Component({
//   selector: 'app-add-product-web',
//   standalone: true,
//   imports: [
//     CommonModule,
//     MatDialogModule,
//     MatButtonModule,
//     MatIconModule,
//     MatFormFieldModule,
//     MatInputModule,
//     ReactiveFormsModule,
//     MatSnackBarModule
//   ],
//   templateUrl: './add-product-web.component.html',
//   styleUrl: './add-product-web.component.css'
// })
// export class AddProductWebComponent {
//   productForm: FormGroup;
//   selectedFile: File | null = null;
//   uploading = false;
//   isEditMode = false;
//   editIndex: number | null = null;

//   constructor(
//     private fb: FormBuilder,
//     private firestore: Firestore,
//     private snackBar: MatSnackBar,
//     private dialogRef: MatDialogRef<AddProductWebComponent>,
//     @Inject(MAT_DIALOG_DATA) public data: any
//   ) {
//     this.isEditMode = !!data?.product;
//     this.editIndex = data?.index ?? null;

//     this.productForm = this.fb.group({
//       productname: ['', Validators.required],
//       shortdescription: ['', Validators.required],
//       description: ['', Validators.required],
//       claimlink: ['', Validators.required],
//       productimage: ['']
//     });
//     if (this.isEditMode) {
//       this.productForm.patchValue({
//         productname: data.product.productname,
//         shortdescription: data.product.shortdescription,
//         description: data.product.description,
//         claimlink: data.product.claimlink,
//         productimage: data.product.productimage
//       });
//     }
//   }


//   onFileSelected(event: any) {
//     this.selectedFile = event.target.files[0] ?? null;
//   }

//   async uploadImageAndGetURL(): Promise<string | null> {
//     if (!this.selectedFile) return null;

//     try {
//       this.uploading = true;
//       const storage = getStorage();
//       const filePath = `product_images/${Date.now()}_${this.selectedFile.name}`;
//       const fileRef = ref(storage, filePath);
//       await uploadBytes(fileRef, this.selectedFile);
//       const url = await getDownloadURL(fileRef);
//       this.uploading = false;
//       return url;
//     } catch (error) {
//       console.error('Image upload failed:', error);
//       this.snackBar.open('Image upload failed', 'Close', { duration: 3000 });
//       this.uploading = false;
//       return null;
//     }
//   }

//   async saveProduct() {
//     if (this.productForm.invalid) {
//       this.productForm.markAllAsTouched();
//       this.snackBar.open('Please fill all required fields', 'Close', { duration: 3000 });
//       return;
//     }
//     const imageUrl = await this.uploadImageAndGetURL();
//     const productData: any = {
//       productname: this.productForm.value.productname,
//       shortdescription: this.productForm.value.shortdescription,
//       description: this.productForm.value.description,
//       claimlink: this.productForm.value.claimlink,
//       productimage: imageUrl ?? this.data?.product?.productimage ?? null
//     };

//     const productPageRef = doc(this.firestore, 'static meta data', 'Product Page');

//     try {
//       const docSnap = await getDoc(productPageRef);

//       let updatedProducts: any[] = [];
//       if (docSnap.exists()) {
//         updatedProducts = docSnap.data()['products'] || [];
//       }
//       if (this.isEditMode && this.editIndex !== null) {
//         updatedProducts[this.editIndex] = productData;

//         await updateDoc(productPageRef, {
//           products: updatedProducts
//         });

//         this.snackBar.open('Product updated successfully!', 'Close', { duration: 3000 });
//         this.dialogRef.close(true);
//         return;
//       }
//       if (docSnap.exists()) {
//         updatedProducts.push(productData);

//         await updateDoc(productPageRef, {
//           products: updatedProducts
//         });
//       } else {
//         await setDoc(productPageRef, {
//           products: [productData]
//         });
//       }

//       this.snackBar.open('Product added successfully!', 'Close', { duration: 3000 });
//       this.dialogRef.close(true);

//     } catch (error) {
//       console.error('Error saving product:', error);
//       this.snackBar.open('Failed to save product', 'Close', { duration: 3000 });
//     }
//   }


//   closeDialog() {
//     this.dialogRef.close(false);
//   }
// }


import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from '@angular/fire/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from '@angular/fire/storage';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-add-product-web',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './add-product-web.component.html',
  styleUrl: './add-product-web.component.css'
})
export class AddProductWebComponent {
  productForm: FormGroup;
  selectedFile: File | null = null;
  uploading = false;
  isEditMode = false;
  editIndex: number | null = null;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AddProductWebComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.isEditMode = !!data?.product;
    this.editIndex = data?.index ?? null;

    this.productForm = this.fb.group({
      productname: ['', Validators.required],
      shortdescription: ['', Validators.required],
      description: ['', Validators.required],
      claimlink: ['', Validators.required],
      productimage: [''],
      buttonname: ['', Validators.required]
    });
    if (this.isEditMode) {
      this.productForm.patchValue({
        productname: data.product.productname,
        shortdescription: data.product.shortdescription,
        description: data.product.description,
        claimlink: data.product.claimlink,
        productimage: data.product.productimage,
        buttonname: data.product.buttonname
      });
    }
  }


  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0] ?? null;
  }

  async uploadImageAndGetURL(): Promise<string | null> {
    if (!this.selectedFile) return null;

    try {
      this.uploading = true;
      const storage = getStorage();
      const filePath = `product_images/${Date.now()}_${this.selectedFile.name}`;
      const fileRef = ref(storage, filePath);
      await uploadBytes(fileRef, this.selectedFile);
      const url = await getDownloadURL(fileRef);
      this.uploading = false;
      return url;
    } catch (error) {
      console.error('Image upload failed:', error);
      this.snackBar.open('Image upload failed', 'Close', { duration: 3000 });
      this.uploading = false;
      return null;
    }
  }

  async saveProduct() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      this.snackBar.open('Please fill all required fields', 'Close', { duration: 3000 });
      return;
    }
    const imageUrl = await this.uploadImageAndGetURL();
    const productData: any = {
      productname: this.productForm.value.productname,
      shortdescription: this.productForm.value.shortdescription,
      description: this.productForm.value.description,
      claimlink: this.productForm.value.claimlink,
      productimage: imageUrl ?? this.data?.product?.productimage ?? null,
       buttonname: this.productForm.value.buttonname
      
    };

    const productPageRef = doc(this.firestore, 'static meta data', 'Product Page');

    try {
      const docSnap = await getDoc(productPageRef);

      let updatedProducts: any[] = [];
      if (docSnap.exists()) {
        updatedProducts = docSnap.data()['products'] || [];
      }
      if (this.isEditMode && this.editIndex !== null) {
        updatedProducts[this.editIndex] = productData;

        await updateDoc(productPageRef, {
          products: updatedProducts
        });

        this.snackBar.open('Product updated successfully!', 'Close', { duration: 3000 });
        this.dialogRef.close(true);
        return;
      }
      if (docSnap.exists()) {
        updatedProducts.push(productData);

        await updateDoc(productPageRef, {
          products: updatedProducts
        });
      } else {
        await setDoc(productPageRef, {
          products: [productData]
        });
      }

      this.snackBar.open('Product added successfully!', 'Close', { duration: 3000 });
      this.dialogRef.close(true);

    } catch (error) {
      console.error('Error saving product:', error);
      this.snackBar.open('Failed to save product', 'Close', { duration: 3000 });
    }
  }


  closeDialog() {
    this.dialogRef.close(false);
  }
}
