import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChanneltemplatesComponent } from './channeltemplates.component';

describe('ChanneltemplatesComponent', () => {
  let component: ChanneltemplatesComponent;
  let fixture: ComponentFixture<ChanneltemplatesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChanneltemplatesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChanneltemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
