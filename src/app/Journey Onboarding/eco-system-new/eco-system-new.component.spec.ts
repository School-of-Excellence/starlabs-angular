import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EcoSystemNewComponent } from './eco-system-new.component';

describe('EcoSystemNewComponent', () => {
  let component: EcoSystemNewComponent;
  let fixture: ComponentFixture<EcoSystemNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ EcoSystemNewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EcoSystemNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});