// Auto-generated `ng g c` scaffold. It has NEVER run: the class name it imported did not exist, so this
// file was one of six compile errors that aborted the whole `ng test` run before any test executed.
//
// The import is now correct, so the repo type-checks. The suite is DISABLED rather than enabled, for a
// reason specific to this component: the stock scaffold calls TestBed.createComponent + detectChanges(),
// which runs ngOnInit — and PreviewTripleATCComponent reads ATC data. ATC data is off-limits to all
// automated testing (see CLAUDE.md), so this must not execute. Compiling the import reads nothing;
// instantiating the component would.
//
// If this component ever needs real coverage, extract its pure logic to an engine and test that, the way
// priority.engine.ts and delivery-dashboard.engine.ts do. Do NOT simply re-enable the block below.
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreviewTripleATCComponent } from './preview-triple-atc.component';

xdescribe('PreviewTripleATCComponent', () => {
  let component: PreviewTripleATCComponent;
  let fixture: ComponentFixture<PreviewTripleATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreviewTripleATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PreviewTripleATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
