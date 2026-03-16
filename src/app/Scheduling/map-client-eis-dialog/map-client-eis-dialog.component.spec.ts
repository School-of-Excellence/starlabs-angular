import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapClientEisDialogComponent } from './map-client-eis-dialog.component';

describe('MapClientEisDialogComponent', () => {
  let component: MapClientEisDialogComponent;
  let fixture: ComponentFixture<MapClientEisDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapClientEisDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapClientEisDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
