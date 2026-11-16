import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChannelTemplatesComponent } from './channeltemplates.component';

describe('ChannelTemplatesComponent', () => {
  let component: ChannelTemplatesComponent;
  let fixture: ComponentFixture<ChannelTemplatesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChannelTemplatesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChannelTemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
