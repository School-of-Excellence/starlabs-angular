import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkshopImageUploadComponent } from './workshop-image-upload.component';

describe('WorkshopImageUploadComponent', () => {
  let component: WorkshopImageUploadComponent;
  let fixture: ComponentFixture<WorkshopImageUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkshopImageUploadComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkshopImageUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
