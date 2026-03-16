import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EpisodesDashboardComponent } from './episodes-dashboard.component';

describe('EpisodesDashboardComponent', () => {
  let component: EpisodesDashboardComponent;
  let fixture: ComponentFixture<EpisodesDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EpisodesDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EpisodesDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
