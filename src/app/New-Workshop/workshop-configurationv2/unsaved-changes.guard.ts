import { CanDeactivateFn } from '@angular/router';
import type { WorkshopConfigurationv2Component } from './workshop-configurationv2.component';

/**
 * Blocks route navigation away from /workshopconfig/:id while the Enrollment form has
 * unsaved edits. The component renders the "Leave without saving?" dialog itself so the
 * look matches the approved design; this guard only waits for its answer.
 */
export const workshopConfigUnsavedGuard: CanDeactivateFn<WorkshopConfigurationv2Component> = (component) => {
  if (!component || !component.hasUnsavedChanges()) return true;
  return component.confirmLeave();
};
