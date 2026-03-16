import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddTripleATCComponent } from './add-triple-atc.component';

describe('AddTripleATCComponent', () => {
  let component: AddTripleATCComponent;
  let fixture: ComponentFixture<AddTripleATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddTripleATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddTripleATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
