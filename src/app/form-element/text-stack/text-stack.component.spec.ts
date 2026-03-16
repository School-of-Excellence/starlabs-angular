import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextStackComponent } from './text-stack.component';

describe('TextStackComponent', () => {
  let component: TextStackComponent;
  let fixture: ComponentFixture<TextStackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextStackComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextStackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
