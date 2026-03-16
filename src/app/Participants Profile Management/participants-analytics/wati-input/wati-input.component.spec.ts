import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatiInputComponent } from './wati-input.component';

describe('WatiInputComponent', () => {
  let component: WatiInputComponent;
  let fixture: ComponentFixture<WatiInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatiInputComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WatiInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
