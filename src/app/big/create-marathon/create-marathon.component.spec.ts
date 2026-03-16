import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateMarathonComponent } from './create-marathon.component';

describe('CreateMarathonComponent', () => {
  let component: CreateMarathonComponent;
  let fixture: ComponentFixture<CreateMarathonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateMarathonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateMarathonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
