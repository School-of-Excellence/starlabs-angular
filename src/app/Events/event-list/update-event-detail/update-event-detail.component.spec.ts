import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateEventDetailComponent } from './update-event-detail.component';

describe('UpdateEventDetailComponent', () => {
  let component: UpdateEventDetailComponent;
  let fixture: ComponentFixture<UpdateEventDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateEventDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateEventDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
