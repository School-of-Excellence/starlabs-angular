import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewParticipantsFormComponent } from './view-participants-form.component';

describe('ViewParticipantsFormComponent', () => {
  let component: ViewParticipantsFormComponent;
  let fixture: ComponentFixture<ViewParticipantsFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewParticipantsFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewParticipantsFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
