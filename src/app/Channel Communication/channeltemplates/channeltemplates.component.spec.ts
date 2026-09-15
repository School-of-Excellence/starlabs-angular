// Auto-generated `ng g c` scaffold. It has NEVER run: the class name it imported did not exist, so this
// file was one of six compile errors that aborted the whole `ng test` run before any test executed.
//
// The import is now correct, so the repo type-checks. The suite stays DISABLED because the stock scaffold
// instantiates the real component with no providers — ChannelTemplatesComponent injects Firestore and does
// work in ngOnInit/ngAfterViewInit, so createComponent would fail on a NullInjectorError. Enabling it would
// trade a compile error for a red test that proves nothing.
//
// This is a placeholder, not coverage. Real coverage for this screen means extracting its pure logic to an
// engine and unit-testing that (see priority.engine.ts / delivery-dashboard.engine.ts for the pattern).
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChannelTemplatesComponent } from './channeltemplates.component';

xdescribe('ChannelTemplatesComponent', () => {
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
