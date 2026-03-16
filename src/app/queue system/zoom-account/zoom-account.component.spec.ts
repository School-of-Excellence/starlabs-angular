import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoomAccountComponent } from './zoom-account.component';

describe('ZoomAccountComponent', () => {
  let component: ZoomAccountComponent;
  let fixture: ComponentFixture<ZoomAccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoomAccountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoomAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
