import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { BookAppointmentComponent } from './book-appointment.component';

describe('BookAppointmentComponent', () => {
  let component: BookAppointmentComponent;
  let fixture: ComponentFixture<BookAppointmentComponent>;

  beforeEach(async () => {
    const guard = {
      getRoles: () => new Promise(() => {}),        // no profile picked in these tests
      getAppointmentMap: () => Promise.resolve({ map: {} }),
      getProductMap: () => Promise.resolve({}),
      getProfileMap: () => Promise.resolve({ list: [], map: {} }),
    };
    await TestBed.configureTestingModule({
      imports: [BookAppointmentComponent, NoopAnimationsModule],
      providers: [DatePipe, provideHttpClient(), provideRouter([]),
        { provide: Firestore, useValue: {} }, { provide: AuthguardService, useValue: guard }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookAppointmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /* The studio's Book Session filter; without it (/bookappointment) nothing is hidden. */
  it('narrows products and appointment types only when a filter is given', () => {
    const products = [
      { productid: 'P1', appointment: [{ id: 'a' }, { id: 'b' }] },
      { productid: 'P2', appointment: [{ id: 'a' }] },
    ];
    expect(component.shownProducts(products).length).toBe(2);
    expect(component.shownAppointments(products[0]).length).toBe(2);
    component.filterProductId = 'P1';
    component.filterTypeIds = ['b'];
    expect(component.shownProducts(products).map(p => p.productid)).toEqual(['P1']);
    expect(component.shownAppointments(products[0]).map(a => a.id)).toEqual(['b']);
  });
});
