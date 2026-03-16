import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapRecommendedplaylistToparticipantComponentComponent } from './map-recommendedplaylist-toparticipant.component.component';

describe('MapRecommendedplaylistToparticipantComponentComponent', () => {
  let component: MapRecommendedplaylistToparticipantComponentComponent;
  let fixture: ComponentFixture<MapRecommendedplaylistToparticipantComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapRecommendedplaylistToparticipantComponentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapRecommendedplaylistToparticipantComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
