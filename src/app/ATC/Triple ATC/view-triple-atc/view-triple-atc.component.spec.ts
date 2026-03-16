import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewTripleATCComponent } from './view-triple-atc.component';

describe('ViewTripleATCComponent', () => {
  let component: ViewTripleATCComponent;
  let fixture: ComponentFixture<ViewTripleATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewTripleATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewTripleATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
