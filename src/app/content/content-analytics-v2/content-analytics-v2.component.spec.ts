import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentAnalyticsV2Component } from './content-analytics-v2.component';

describe('ContentAnalyticsV2Component', () => {
  let component: ContentAnalyticsV2Component;
  let fixture: ComponentFixture<ContentAnalyticsV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentAnalyticsV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContentAnalyticsV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
