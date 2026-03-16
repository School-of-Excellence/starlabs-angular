import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HoldAlertDialogComponent } from './hold-alert-dialog.component';

describe('HoldAlertDialogComponent', () => {
  let component: HoldAlertDialogComponent;
  let fixture: ComponentFixture<HoldAlertDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HoldAlertDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HoldAlertDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
