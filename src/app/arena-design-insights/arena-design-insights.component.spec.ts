import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenaDesignInsightsComponent } from './arena-design-insights.component';

describe('ArenaDesignInsightsComponent', () => {
  let component: ArenaDesignInsightsComponent;
  let fixture: ComponentFixture<ArenaDesignInsightsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaDesignInsightsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenaDesignInsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
