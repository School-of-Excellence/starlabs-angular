import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewAtcmodelComponent } from './view-atcmodel.component';

describe('ViewAtcmodelComponent', () => {
  let component: ViewAtcmodelComponent;
  let fixture: ComponentFixture<ViewAtcmodelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewAtcmodelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewAtcmodelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
