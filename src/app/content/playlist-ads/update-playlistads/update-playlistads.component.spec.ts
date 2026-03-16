import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdatePlaylistadsComponent } from './update-playlistads.component';

describe('UpdatePlaylistadsComponent', () => {
  let component: UpdatePlaylistadsComponent;
  let fixture: ComponentFixture<UpdatePlaylistadsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePlaylistadsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdatePlaylistadsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
