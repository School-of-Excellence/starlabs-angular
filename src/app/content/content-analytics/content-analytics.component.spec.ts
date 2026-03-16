import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentAnalyticsComponent } from './content-analytics.component';

describe('ContentAnalyticsComponent', () => {
  let component: ContentAnalyticsComponent;
  let fixture: ComponentFixture<ContentAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentAnalyticsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContentAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
