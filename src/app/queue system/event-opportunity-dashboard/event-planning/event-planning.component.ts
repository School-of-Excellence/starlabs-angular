import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Event Planning dashboard — ported UI (HTML + CSS only).
 * This is a presentational shell; interactive logic will be wired up later.
 */
@Component({
  selector: 'app-event-planning',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-planning.component.html',
  styleUrl: './event-planning.component.css'
})
export class EventPlanningComponent {}
