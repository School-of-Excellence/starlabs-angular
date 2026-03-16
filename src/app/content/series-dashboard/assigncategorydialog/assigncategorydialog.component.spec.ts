import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssigncategorydialogComponent } from './assigncategorydialog.component';

describe('AssigncategorydialogComponent', () => {
  let component: AssigncategorydialogComponent;
  let fixture: ComponentFixture<AssigncategorydialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssigncategorydialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssigncategorydialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
