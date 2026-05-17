import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkshopDialogComponent } from './workshop-dialog.component';

describe('WorkshopDialogComponent', () => {
  let component: WorkshopDialogComponent;
  let fixture: ComponentFixture<WorkshopDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkshopDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkshopDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
