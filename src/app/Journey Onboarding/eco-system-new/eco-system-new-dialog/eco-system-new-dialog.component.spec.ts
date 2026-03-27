import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EcoSystemNewDialogComponent } from './eco-system-new-dialog.component';

describe('EcoSystemNewDialogComponent', () => {
  let component: EcoSystemNewDialogComponent;
  let fixture: ComponentFixture<EcoSystemNewDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ EcoSystemNewDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EcoSystemNewDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});