import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccessScreenComponent } from './access-screen.component';

describe('AccessScreenComponent', () => {
  let component: AccessScreenComponent;
  let fixture: ComponentFixture<AccessScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccessScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccessScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
