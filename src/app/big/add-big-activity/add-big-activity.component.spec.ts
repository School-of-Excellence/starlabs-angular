import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddBigActivityComponent } from './add-big-activity.component';

describe('AddBigActivityComponent', () => {
  let component: AddBigActivityComponent;
  let fixture: ComponentFixture<AddBigActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddBigActivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddBigActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
