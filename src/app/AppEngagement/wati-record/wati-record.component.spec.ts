import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatiRecordComponent } from './wati-record.component';

describe('WatiRecordComponent', () => {
  let component: WatiRecordComponent;
  let fixture: ComponentFixture<WatiRecordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatiRecordComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WatiRecordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
