import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinOpenviduCallComponent } from './join-openvidu-call.component';

describe('JoinOpenviduCallComponent', () => {
  let component: JoinOpenviduCallComponent;
  let fixture: ComponentFixture<JoinOpenviduCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinOpenviduCallComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinOpenviduCallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
