import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PickForMentoringComponent } from './pick-for-mentoring.component';

describe('PickForMentoringComponent', () => {
  let component: PickForMentoringComponent;
  let fixture: ComponentFixture<PickForMentoringComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PickForMentoringComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PickForMentoringComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
