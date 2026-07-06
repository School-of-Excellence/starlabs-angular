import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SalesNumbersService } from '../sales-numbers/sales-numbers.service';
import { SalesTeam } from '../sales-numbers/sales-numbers.models';

const UNASSIGNED = '';

@Component({
  selector: 'app-sales-teams',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatButtonModule, MatIconModule, MatChipsModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './sales-teams.component.html',
  styleUrl: './sales-teams.component.css',
})
export class SalesTeamsComponent implements OnInit {
  loading = true;
  saving = false;
  teams: SalesTeam[] = [];
  salespeople: string[] = [];
  newTeamName = '';

  constructor(private svc: SalesNumbersService, private snack: MatSnackBar) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    [this.teams, this.salespeople] = await Promise.all([
      this.svc.loadTeams(),
      this.svc.loadAllSalespeople(),
    ]);
    this.teams.sort((a, b) => a.team.localeCompare(b.team));
    this.loading = false;
  }

  // current team id for a person ('' = unassigned)
  teamIdOf(person: string): string {
    return this.teams.find((t) => t.members.includes(person))?.id ?? UNASSIGNED;
  }

  unassigned(): string[] {
    return this.salespeople.filter((p) => this.teamIdOf(p) === UNASSIGNED);
  }

  membersOf(teamId: string): string[] {
    return this.teams.find((t) => t.id === teamId)?.members ?? [];
  }

  async assign(person: string, newTeamId: string): Promise<void> {
    const oldTeamId = this.teamIdOf(person);
    if (oldTeamId === newTeamId) return;
    this.saving = true;
    try {
      const writes: Promise<void>[] = [];
      if (oldTeamId) {
        const old = this.teams.find((t) => t.id === oldTeamId)!;
        old.members = old.members.filter((m) => m !== person);
        writes.push(this.svc.saveTeamMembers(old.id, old.members));
      }
      if (newTeamId) {
        const next = this.teams.find((t) => t.id === newTeamId)!;
        if (!next.members.includes(person)) next.members = [...next.members, person];
        writes.push(this.svc.saveTeamMembers(next.id, next.members));
      }
      await Promise.all(writes);
      this.snack.open(`${person} → ${newTeamId ? this.teams.find((t) => t.id === newTeamId)!.team : 'Unassigned'}`, 'OK', { duration: 2000 });
    } finally {
      this.saving = false;
    }
  }

  async createTeam(): Promise<void> {
    const name = this.newTeamName.trim();
    if (!name) return;
    if (this.teams.some((t) => t.team.toLowerCase() === name.toLowerCase())) {
      this.snack.open('A team with that name already exists.', 'OK', { duration: 2500 });
      return;
    }
    this.saving = true;
    try {
      const id = await this.svc.createTeam(name);
      this.teams = [...this.teams, { id, team: name, members: [] }].sort((a, b) => a.team.localeCompare(b.team));
      this.newTeamName = '';
    } finally {
      this.saving = false;
    }
  }

  async removeMember(teamId: string, person: string): Promise<void> {
    await this.assign(person, UNASSIGNED);
  }

  async deleteTeam(team: SalesTeam): Promise<void> {
    this.saving = true;
    try {
      await this.svc.deleteTeam(team.id);
      this.teams = this.teams.filter((t) => t.id !== team.id);
      this.snack.open(`Deleted ${team.team}`, 'OK', { duration: 2000 });
    } finally {
      this.saving = false;
    }
  }
}
