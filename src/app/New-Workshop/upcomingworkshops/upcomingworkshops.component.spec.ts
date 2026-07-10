import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpcomingworkshopsComponent } from './upcomingworkshops.component';

describe('UpcomingworkshopsComponent', () => {
  let component: UpcomingworkshopsComponent;
  let fixture: ComponentFixture<UpcomingworkshopsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingworkshopsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingworkshopsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
