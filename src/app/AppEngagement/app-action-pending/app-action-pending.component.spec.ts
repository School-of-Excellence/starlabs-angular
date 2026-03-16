import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppActionPendingComponent } from './app-action-pending.component';

describe('AppActionPendingComponent', () => {
  let component: AppActionPendingComponent;
  let fixture: ComponentFixture<AppActionPendingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppActionPendingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppActionPendingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
