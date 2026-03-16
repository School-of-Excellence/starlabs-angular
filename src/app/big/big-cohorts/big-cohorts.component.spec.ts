import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigCohortsComponent } from './big-cohorts.component';

describe('BigCohortsComponent', () => {
  let component: BigCohortsComponent;
  let fixture: ComponentFixture<BigCohortsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigCohortsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigCohortsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
