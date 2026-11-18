import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';

import { NewusersprofileComponent } from './newusersprofile.component';
import { AuthguardService } from '../../authguard.service';
import { SnackbarService } from '../../shared/snackbar.service';
import { WorkshopAccessService } from '../workshop-access/workshop-access.service';

describe('NewusersprofileComponent', () => {
  let component: NewusersprofileComponent;
  let fixture: ComponentFixture<NewusersprofileComponent>;

  beforeEach(async () => {
    // Stub services only: no profile id means access is denied, so the screen never reads Firestore.
    await TestBed.configureTestingModule({
      imports: [NewusersprofileComponent],
      providers: [
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: AuthguardService, useValue: {} },
        { provide: MatDialog, useValue: { open: () => null } },
        { provide: MatSnackBar, useValue: { open: () => null } },
        { provide: HttpClient, useValue: {} },
        { provide: SnackbarService, useValue: {} },
        {
          provide: WorkshopAccessService,
          useValue: {
            currentProfileId: () => Promise.resolve(null),
            getAdminLists: () => Promise.resolve({ newUsersAccess: [] }),
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewusersprofileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
