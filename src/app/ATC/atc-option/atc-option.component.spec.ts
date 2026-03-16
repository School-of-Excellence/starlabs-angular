import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtcOptionComponent } from './atc-option.component';

describe('AtcOptionComponent', () => {
  let component: AtcOptionComponent;
  let fixture: ComponentFixture<AtcOptionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtcOptionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AtcOptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
