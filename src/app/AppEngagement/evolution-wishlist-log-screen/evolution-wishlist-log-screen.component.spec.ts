import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionWishlistLogScreenComponent } from './evolution-wishlist-log-screen.component';

describe('EvolutionWishlistLogScreenComponent', () => {
  let component: EvolutionWishlistLogScreenComponent;
  let fixture: ComponentFixture<EvolutionWishlistLogScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionWishlistLogScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionWishlistLogScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
