import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateWatsonProfileComponent } from './create-watson-profile.component';

describe('CreateWatsonProfileComponent', () => {
  let component: CreateWatsonProfileComponent;
  let fixture: ComponentFixture<CreateWatsonProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateWatsonProfileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateWatsonProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
