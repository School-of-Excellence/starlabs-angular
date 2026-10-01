import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SasFilterBarComponent } from './sas-filter-bar.component';
import { SpecialistAppointmentService } from '../specialist-appointment.service';
import { SasFilter } from '../sas-logic';

describe('SasFilterBarComponent', () => {
  let fixture: ComponentFixture<SasFilterBarComponent>;
  let c: SasFilterBarComponent;
  let out: SasFilter[];

  beforeEach(async () => {
    const fake = {
      filterOptions: () => Promise.resolve({
        products: [{ id: 'P1', name: 'Leadership', typeIds: ['a', 'b'] }, { id: 'P2', name: 'Empty', typeIds: [] }],
        types: [{ id: 'a', name: 'Kick-off', duration: 60 }, { id: 'b', name: 'Review', duration: 30 }, { id: 'c', name: 'Other', duration: 45 }],
      }),
    };
    await TestBed.configureTestingModule({
      imports: [SasFilterBarComponent, NoopAnimationsModule],
      providers: [{ provide: SpecialistAppointmentService, useValue: fake }],
    }).compileComponents();
    fixture = TestBed.createComponent(SasFilterBarComponent);
    c = fixture.componentInstance;
    out = [];
    c.filterChange.subscribe(f => out.push(f));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('picking a product ticks its delivery-sequence types', () => {
    c.productId = 'P1';
    c.onProduct();
    expect(c.typeIds).toEqual(['a', 'b']);
    expect(out.pop()).toEqual({ productId: 'P1', typeIds: ['a', 'b'], booked: 'all' });
  });

  it('a product with no types you can give filters to nothing', () => {
    c.productId = 'P2';
    c.onProduct();
    expect(out.pop()!.typeIds).toEqual([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="saf-no-types"]')).toBeTruthy();
  });

  it('Booked / Not booked shows only when asked, and Clear resets everything', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="saf-booked-open"]')).toBeNull();
    c.showBooked = true;
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="saf-booked-open"]') as HTMLButtonElement).click();
    expect(out.pop()!.booked).toBe('open');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="saf-clear"]') as HTMLButtonElement).click();
    expect(out.pop()).toEqual({ productId: null, typeIds: null, booked: 'all' });
  });
});
