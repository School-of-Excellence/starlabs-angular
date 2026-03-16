import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenaSpaceDialogComponent } from './arena-space-dialog.component';

describe('ArenaSpaceDialogComponent', () => {
  let component: ArenaSpaceDialogComponent;
  let fixture: ComponentFixture<ArenaSpaceDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaSpaceDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenaSpaceDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
