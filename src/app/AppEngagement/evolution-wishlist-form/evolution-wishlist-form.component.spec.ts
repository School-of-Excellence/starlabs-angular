import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionWishlistFormComponent } from './evolution-wishlist-form.component';

describe('EvolutionWishlistFormComponent', () => {
  let component: EvolutionWishlistFormComponent;
  let fixture: ComponentFixture<EvolutionWishlistFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionWishlistFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionWishlistFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
