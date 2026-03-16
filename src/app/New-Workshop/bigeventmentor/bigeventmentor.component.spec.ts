import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigeventmentorComponent } from './bigeventmentor.component';

describe('BigeventmentorComponent', () => {
  let component: BigeventmentorComponent;
  let fixture: ComponentFixture<BigeventmentorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigeventmentorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigeventmentorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
