import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateAdjustmentTaxonomyComponent } from './update-adjustment-taxonomy.component';

describe('UpdateAdjustmentTaxonomyComponent', () => {
  let component: UpdateAdjustmentTaxonomyComponent;
  let fixture: ComponentFixture<UpdateAdjustmentTaxonomyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateAdjustmentTaxonomyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateAdjustmentTaxonomyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
