import { Component, OnInit } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { MatTabsModule } from '@angular/material/tabs';
import { ViewArenaSpaceComponent } from '../view-arena-space/view-arena-space.component';
import { CreateArenaSpaceComponent } from '../create-arena-space/create-arena-space.component';
import { CreateSpaceComponent } from '../create-space/create-space.component';
import { CreateSpaceTypeComponent } from '../create-space-type/create-space-type.component';

@Component({
  selector: 'app-arena-space',
  imports: [
    MatTabsModule,
    ViewArenaSpaceComponent,
    CreateArenaSpaceComponent,
    CreateSpaceComponent,
    CreateSpaceTypeComponent
  ],
  templateUrl: './arena-space.component.html',
  styleUrl: './arena-space.component.css'
})
export class ArenaSpaceComponent {
  // Array declarations
  tabs = ['View Arena Space','Create Arena Space', 'Create/Edit Space', 'Create/Edit Type']

  // Numeric declarations
  selectedTabIndex: number = 0;

  constructor(private firestore : Firestore) {

  }

  ngOnInit(): void {
  }

}
