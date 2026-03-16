import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdatesnackbarComponent } from './updatesnackbar.component';

describe('UpdatesnackbarComponent', () => {
  let component: UpdatesnackbarComponent;
  let fixture: ComponentFixture<UpdatesnackbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatesnackbarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdatesnackbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
