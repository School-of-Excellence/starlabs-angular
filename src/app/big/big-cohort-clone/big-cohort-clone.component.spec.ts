import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigCohortCloneComponent } from './big-cohort-clone.component';

describe('BigCohortCloneComponent', () => {
  let component: BigCohortCloneComponent;
  let fixture: ComponentFixture<BigCohortCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigCohortCloneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigCohortCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
