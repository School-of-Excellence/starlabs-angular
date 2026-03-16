import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenaETicketApproveComponent } from './arena-e-ticket-approve.component';

describe('ArenaETicketApproveComponent', () => {
  let component: ArenaETicketApproveComponent;
  let fixture: ComponentFixture<ArenaETicketApproveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaETicketApproveComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenaETicketApproveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
