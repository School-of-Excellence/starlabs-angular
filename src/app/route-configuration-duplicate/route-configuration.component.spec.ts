import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RouteConfigurationComponent } from './route-configuration.component';

describe('RouteConfigurationComponent', () => {
  let component: RouteConfigurationComponent;
  let fixture: ComponentFixture<RouteConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouteConfigurationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RouteConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
