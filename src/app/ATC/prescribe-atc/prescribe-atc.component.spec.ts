import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrescribeATCComponent } from './prescribe-atc.component';

describe('PrescribeATCComponent', () => {
  let component: PrescribeATCComponent;
  let fixture: ComponentFixture<PrescribeATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrescribeATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrescribeATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
