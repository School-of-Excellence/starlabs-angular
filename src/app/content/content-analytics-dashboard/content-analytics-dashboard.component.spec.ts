import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentAnalyticsDashboardComponent } from './content-analytics-dashboard.component';

describe('ContentAnalyticsDashboardComponent', () => {
  let component: ContentAnalyticsDashboardComponent;
  let fixture: ComponentFixture<ContentAnalyticsDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentAnalyticsDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContentAnalyticsDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
