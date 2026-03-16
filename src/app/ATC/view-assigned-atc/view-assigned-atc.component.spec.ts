import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewAssignedATCComponent } from './view-assigned-atc.component';

describe('ViewAssignedATCComponent', () => {
  let component: ViewAssignedATCComponent;
  let fixture: ComponentFixture<ViewAssignedATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewAssignedATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewAssignedATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
