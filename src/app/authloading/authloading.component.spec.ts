import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthloadingComponent } from './authloading.component';

describe('AuthloadingComponent', () => {
  let component: AuthloadingComponent;
  let fixture: ComponentFixture<AuthloadingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthloadingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthloadingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
