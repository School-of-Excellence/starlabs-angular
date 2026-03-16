import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LearningMaterialAddDialogComponent } from './learning-material-add-dialog.component';

describe('LearningMaterialAddDialogComponent', () => {
  let component: LearningMaterialAddDialogComponent;
  let fixture: ComponentFixture<LearningMaterialAddDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LearningMaterialAddDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LearningMaterialAddDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
