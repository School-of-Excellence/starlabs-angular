// Auto-generated `ng g c` scaffold. It has NEVER run: the class name it imported did not exist, so this
// file was one of six compile errors that aborted the whole `ng test` run before any test executed.
//
// The import is now correct, so the repo type-checks. The suite stays DISABLED because the stock scaffold
// instantiates the real component with no providers — AssignCategoryDialogComponent is a MatDialog body and
// injects MAT_DIALOG_DATA / MatDialogRef, which TestBed cannot supply here, so createComponent would fail on
// a NullInjectorError. Enabling it would trade a compile error for a red test that proves nothing.
//
// This is a placeholder, not coverage. Real coverage for this dialog means extracting its pure logic to an
// engine and unit-testing that (see priority.engine.ts / delivery-dashboard.engine.ts for the pattern).
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignCategoryDialogComponent } from './assigncategorydialog.component';

xdescribe('AssignCategoryDialogComponent', () => {
  let component: AssignCategoryDialogComponent;
  let fixture: ComponentFixture<AssignCategoryDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignCategoryDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignCategoryDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
