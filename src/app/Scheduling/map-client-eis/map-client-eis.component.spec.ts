import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapClientEisComponent } from './map-client-eis.component';

describe('MapClientEisComponent', () => {
  let component: MapClientEisComponent;
  let fixture: ComponentFixture<MapClientEisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapClientEisComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapClientEisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
