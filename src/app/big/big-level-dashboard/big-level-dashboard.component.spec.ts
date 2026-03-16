import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigLevelDashboardComponent } from './big-level-dashboard.component';

describe('BigLevelDashboardComponent', () => {
  let component: BigLevelDashboardComponent;
  let fixture: ComponentFixture<BigLevelDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigLevelDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigLevelDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
