import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateArenaSpaceComponent } from './create-arena-space.component';

describe('CreateArenaSpaceComponent', () => {
  let component: CreateArenaSpaceComponent;
  let fixture: ComponentFixture<CreateArenaSpaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateArenaSpaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateArenaSpaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
