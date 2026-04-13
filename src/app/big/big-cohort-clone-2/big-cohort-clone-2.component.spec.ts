import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigCohortClone2Component } from './big-cohort-clone-2.component';

describe('BigCohortClone2Component', () => {
  let component: BigCohortClone2Component;
  let fixture: ComponentFixture<BigCohortClone2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigCohortClone2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigCohortClone2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
