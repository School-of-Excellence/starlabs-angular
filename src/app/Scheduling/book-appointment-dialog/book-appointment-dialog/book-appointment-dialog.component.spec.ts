import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookAppointmentDialogComponent } from './book-appointment-dialog.component';

describe('BookAppointmentDialogComponent', () => {
  let component: BookAppointmentDialogComponent;
  let fixture: ComponentFixture<BookAppointmentDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookAppointmentDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookAppointmentDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
