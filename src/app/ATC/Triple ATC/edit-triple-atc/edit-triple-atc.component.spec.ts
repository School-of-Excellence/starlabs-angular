import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditTripleATCComponent } from './edit-triple-atc.component';

describe('EditTripleATCComponent', () => {
  let component: EditTripleATCComponent;
  let fixture: ComponentFixture<EditTripleATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditTripleATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditTripleATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
