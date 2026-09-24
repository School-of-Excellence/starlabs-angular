import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateupcomingworkshopsComponent } from './createupcomingworkshops.component';

describe('CreateupcomingworkshopsComponent', () => {
  let component: CreateupcomingworkshopsComponent;
  let fixture: ComponentFixture<CreateupcomingworkshopsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateupcomingworkshopsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateupcomingworkshopsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
