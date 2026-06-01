import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OnewayTemplatesComponent } from './oneway-templates.component';

describe('OnewayTemplatesComponent', () => {
  let component: OnewayTemplatesComponent;
  let fixture: ComponentFixture<OnewayTemplatesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnewayTemplatesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OnewayTemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
