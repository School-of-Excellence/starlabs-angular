import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateAtcmodelComponent } from './create-atcmodel.component';

describe('CreateAtcmodelComponent', () => {
  let component: CreateAtcmodelComponent;
  let fixture: ComponentFixture<CreateAtcmodelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAtcmodelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateAtcmodelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
