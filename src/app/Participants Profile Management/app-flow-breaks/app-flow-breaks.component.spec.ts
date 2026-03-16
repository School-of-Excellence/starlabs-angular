import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppFlowBreaksComponent } from './app-flow-breaks.component';

describe('AppFlowBreaksComponent', () => {
  let component: AppFlowBreaksComponent;
  let fixture: ComponentFixture<AppFlowBreaksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppFlowBreaksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppFlowBreaksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
