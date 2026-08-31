import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeamEvolutionDashboardComponent } from './team-evolution-dashboard.component';

describe('TeamEvolutionDashboardComponent', () => {
  let component: TeamEvolutionDashboardComponent;
  let fixture: ComponentFixture<TeamEvolutionDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamEvolutionDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeamEvolutionDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
