import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpcomingworkshopresponsesComponent } from './upcomingworkshopresponses.component';

describe('UpcomingworkshopresponsesComponent', () => {
  let component: UpcomingworkshopresponsesComponent;
  let fixture: ComponentFixture<UpcomingworkshopresponsesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingworkshopresponsesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingworkshopresponsesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
