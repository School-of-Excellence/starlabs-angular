import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SendIndividualEmailComponent } from './send-individual-email.component';

describe('SendIndividualEmailComponent', () => {
  let component: SendIndividualEmailComponent;
  let fixture: ComponentFixture<SendIndividualEmailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SendIndividualEmailComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SendIndividualEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
