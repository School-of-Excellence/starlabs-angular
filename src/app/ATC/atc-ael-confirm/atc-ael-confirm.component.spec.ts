import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtcAelConfirmComponent } from './atc-ael-confirm.component';

describe('AtcAelConfirmComponent', () => {
  let component: AtcAelConfirmComponent;
  let fixture: ComponentFixture<AtcAelConfirmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtcAelConfirmComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AtcAelConfirmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
