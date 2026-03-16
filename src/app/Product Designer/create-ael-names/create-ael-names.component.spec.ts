import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateAelNamesComponent } from './create-ael-names.component';

describe('CreateAelNamesComponent', () => {
  let component: CreateAelNamesComponent;
  let fixture: ComponentFixture<CreateAelNamesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAelNamesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateAelNamesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
