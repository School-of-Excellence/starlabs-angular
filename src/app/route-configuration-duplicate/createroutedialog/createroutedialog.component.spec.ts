import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateroutedialogComponent } from './createroutedialog.component';

describe('CreateroutedialogComponent', () => {
  let component: CreateroutedialogComponent;
  let fixture: ComponentFixture<CreateroutedialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateroutedialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateroutedialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
