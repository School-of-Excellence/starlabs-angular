import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateSpaceTypeComponent } from './create-space-type.component';

describe('CreateSpaceTypeComponent', () => {
  let component: CreateSpaceTypeComponent;
  let fixture: ComponentFixture<CreateSpaceTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateSpaceTypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateSpaceTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
