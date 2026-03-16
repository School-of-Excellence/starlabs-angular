import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoomClientviewComponent } from './zoom-clientview.component';

describe('ZoomClientviewComponent', () => {
  let component: ZoomClientviewComponent;
  let fixture: ComponentFixture<ZoomClientviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoomClientviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoomClientviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
