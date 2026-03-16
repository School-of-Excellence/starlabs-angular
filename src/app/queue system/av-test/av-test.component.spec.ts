import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvTestComponent } from './av-test.component';

describe('AvTestComponent', () => {
  let component: AvTestComponent;
  let fixture: ComponentFixture<AvTestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvTestComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AvTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
