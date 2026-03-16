import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateSegmentsDialogComponent } from './create-segments-dialog.component';

describe('CreateSegmentsDialogComponent', () => {
  let component: CreateSegmentsDialogComponent;
  let fixture: ComponentFixture<CreateSegmentsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateSegmentsDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateSegmentsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
