import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModeDashboardComponent } from './mode-dashboard.component';

describe('ModeDashboardComponent', () => {
  let component: ModeDashboardComponent;
  let fixture: ComponentFixture<ModeDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModeDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModeDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
