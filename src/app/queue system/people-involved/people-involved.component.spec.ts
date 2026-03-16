import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PeopleInvolvedComponent } from './people-involved.component';

describe('PeopleInvolvedComponent', () => {
  let component: PeopleInvolvedComponent;
  let fixture: ComponentFixture<PeopleInvolvedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeopleInvolvedComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PeopleInvolvedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
