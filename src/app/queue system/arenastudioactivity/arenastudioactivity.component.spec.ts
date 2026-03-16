import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenastudioactivityComponent } from './arenastudioactivity.component';

describe('ArenastudioactivityComponent', () => {
  let component: ArenastudioactivityComponent;
  let fixture: ComponentFixture<ArenastudioactivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenastudioactivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenastudioactivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
