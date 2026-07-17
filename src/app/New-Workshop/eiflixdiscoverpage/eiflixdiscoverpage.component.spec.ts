import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EiflixdiscoverpageComponent } from './eiflixdiscoverpage.component';

describe('EiflixdiscoverpageComponent', () => {
  let component: EiflixdiscoverpageComponent;
  let fixture: ComponentFixture<EiflixdiscoverpageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EiflixdiscoverpageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EiflixdiscoverpageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
