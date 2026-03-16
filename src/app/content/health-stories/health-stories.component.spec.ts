import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HealthStoriesComponent } from './health-stories.component';

describe('HealthStoriesComponent', () => {
  let component: HealthStoriesComponent;
  let fixture: ComponentFixture<HealthStoriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HealthStoriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HealthStoriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
