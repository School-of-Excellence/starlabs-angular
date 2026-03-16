import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReleaselogdialogComponent } from './releaselogdialog.component';

describe('ReleaselogdialogComponent', () => {
  let component: ReleaselogdialogComponent;
  let fixture: ComponentFixture<ReleaselogdialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReleaselogdialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReleaselogdialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
