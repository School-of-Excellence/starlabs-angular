import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeseriesComponent } from './homeseries.component';

describe('HomeseriesComponent', () => {
  let component: HomeseriesComponent;
  let fixture: ComponentFixture<HomeseriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeseriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeseriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
