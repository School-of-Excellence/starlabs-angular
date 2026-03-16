import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigureseriesdialogComponent } from './configureseriesdialog.component';

describe('ConfigureseriesdialogComponent', () => {
  let component: ConfigureseriesdialogComponent;
  let fixture: ComponentFixture<ConfigureseriesdialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfigureseriesdialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfigureseriesdialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
