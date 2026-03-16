import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantProductComponent } from './participant-product.component';

describe('ParticipantProductComponent', () => {
  let component: ParticipantProductComponent;
  let fixture: ComponentFixture<ParticipantProductComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantProductComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantProductComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
