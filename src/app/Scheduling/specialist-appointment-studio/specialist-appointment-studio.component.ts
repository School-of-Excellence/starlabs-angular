import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { BookAppointmentComponent } from '../book-appointment/book-appointment.component';
import { SpecialistAppointmentService } from './specialist-appointment.service';
import { SasHomeComponent } from './sas-home/sas-home.component';
import { SasTeamComponent } from './sas-team/sas-team.component';
import { SasMentorsComponent } from './sas-mentors/sas-mentors.component';
import { SasUtilisationComponent } from './sas-utilisation/sas-utilisation.component';
import { SasSettingsComponent } from './sas-settings/sas-settings.component';
import { ViewRole, VIEW_LABEL, ownsProduct } from './sas-logic';
import { SasLoaderComponent } from './sas-loader/sas-loader.component';

export type SasTab = 'home' | 'team' | 'overview' | 'mentors' | 'util' | 'book' | 'settings';
interface NavItem { tab: SasTab; label: string; icon: string; }

/* The left nav belongs to this screen only. "View as" lists every view the user holds a role for
   (Mentor, A&H, CW); it opens on the highest usable one. */
export const NAV: Record<Exclude<ViewRole, null>, NavItem[]> = {
  cw: [{ tab: 'home', label: 'Home', icon: 'home' }],
  mentor: [{ tab: 'home', label: 'Home', icon: 'home' }, { tab: 'team', label: 'My Team', icon: 'group' }],
  ah: [
    { tab: 'overview', label: 'Overview', icon: 'dashboard' },
    { tab: 'mentors', label: 'Mentors', icon: 'supervisor_account' },
    { tab: 'util', label: 'Utilisation', icon: 'insights' },
    { tab: 'book', label: 'Book Session', icon: 'event_available' },
    { tab: 'settings', label: 'Settings', icon: 'tune' },
  ],
};

/* Centralised appointments for CW specialists, mentor specialists and the A&H team.
   Plan: specs/plans/2026-09-29-centralised-appointments.md. Hook prefix: sas */
@Component({
  selector: 'app-specialist-appointment-studio',
  imports: [
    MatIconModule, FormsModule, SasLoaderComponent, BookAppointmentComponent, SasHomeComponent, SasTeamComponent,
    SasMentorsComponent, SasUtilisationComponent, SasSettingsComponent,
  ],
  templateUrl: './specialist-appointment-studio.component.html',
  styleUrl: './specialist-appointment-studio.component.css',
  encapsulation: ViewEncapsulation.None,
  providers: [SpecialistAppointmentService],
})
export class SpecialistAppointmentStudioComponent implements OnInit {
  readonly VIEW_LABEL = VIEW_LABEL;
  loading = true;
  viewRole: ViewRole = null;
  views: Exclude<ViewRole, null>[] = [];
  noProduct = false;          // Mentor view, but no product owner assigned
  nav: NavItem[] = [];
  tab: SasTab = 'home';

  constructor(private svc: SpecialistAppointmentService) {}

  async ngOnInit() {
    try {
      await this.svc.init();
      this.views = this.svc.views;
      this.setView(this.svc.viewRole);
    } catch (e) {
      console.error('Specialist appointment studio: init failed', e);
    }
    this.loading = false;
  }

  /* View as: switch to another view the user holds a role for. Tabs re-create, so each view loads fresh. */
  setView(v: ViewRole) {
    this.viewRole = v;
    this.svc.viewRole = v;
    this.noProduct = v === 'mentor' && !ownsProduct(this.svc.roles);
    this.nav = v && !this.noProduct ? NAV[v] : [];
    this.tab = this.nav[0]?.tab ?? 'home';
    window.scrollTo(0, 0);
  }

  get showSide() { return this.nav.length > 1 || this.views.length > 1; }

  go(tab: SasTab) { this.tab = tab; window.scrollTo(0, 0); }
}
