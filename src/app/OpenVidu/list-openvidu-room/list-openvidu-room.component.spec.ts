import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListOpenviduRoomComponent } from './list-openvidu-room.component';

describe('ListOpenviduRoomComponent', () => {
  let component: ListOpenviduRoomComponent;
  let fixture: ComponentFixture<ListOpenviduRoomComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListOpenviduRoomComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListOpenviduRoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
