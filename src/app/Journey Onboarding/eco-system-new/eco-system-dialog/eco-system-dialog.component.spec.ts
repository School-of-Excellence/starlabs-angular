import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EcoSystemDialogComponent } from './eco-system-dialog.component';

describe('EcoSystemDialogComponent', () => {
  let component: EcoSystemDialogComponent;
  let fixture: ComponentFixture<EcoSystemDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EcoSystemDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EcoSystemDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
