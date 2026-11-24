import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { NameSearchPipe, nameSearch } from '../journey-coach-health-dashboard/name-search.pipe';

interface CrossoverEntry {
  category: string;
  startpoint: string;
  endpoint: string;
  combination: string;
  count: number;
  profileIds: string[];
}

@Component({
  selector: 'app-cross-over-metrics-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, NameSearchPipe],
  templateUrl: './cross-over-metrics-dialog.component.html',
  styleUrl: './cross-over-metrics-dialog.component.css'
})
export class CrossOverMetricsDialogComponent implements OnInit {

  loading: boolean = true;
  crossoverData: CrossoverEntry[] = [];
  filteredData: CrossoverEntry[] = [];
  searchTerm: string = '';
  
  // For grouping by category
  groupedData: Map<string, CrossoverEntry[]> = new Map();
  
  // For profile panel
  showProfilePanel: boolean = false;
  selectedEntry: CrossoverEntry | null = null;
  
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any, 
    public dialogRef: MatDialogRef<CrossOverMetricsDialogComponent>,
    private firestore: Firestore
  ) {}

  ngOnInit() {
    this.loadCrossoverMetrics();
  }

  async loadCrossoverMetrics() {
    this.loading = true;
    
    try {
      const aelQuery = query(
        collection(this.firestore, "participant AEL"),
        where("created", ">=", this.data.startdate),
        where("created", "<=", this.data.enddate),
      );
      
      const aelSnapshot = await getDocs(aelQuery);
      
      // Map to store combination counts: "category|startpoint|endpoint" -> { count, profileIds }
      const combinationMap = new Map<string, { count: number; profileIds: string[]; category: string; startpoint: string; endpoint: string }>();
      
      aelSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const crossoverMetrics = data['crossovermetric'];
        const profileId = data['profileid'];
        
        if (crossoverMetrics && typeof crossoverMetrics === 'object' && profileId) {
          // Iterate through each category in crossovermetrics
          Object.keys(crossoverMetrics).forEach((category) => {
            const metricData = crossoverMetrics[category];
            
            if (metricData && metricData.startpoint !== undefined && metricData.endpoint !== undefined) {
              const startpoint = String(metricData.startpoint);
              const endpoint = String(metricData.endpoint);
              const combinationKey = `${category}|${startpoint}|${endpoint}`;
              
              if (combinationMap.has(combinationKey)) {
                const existing = combinationMap.get(combinationKey)!;
                if (!existing.profileIds.includes(profileId)) {
                  existing.count++;
                  existing.profileIds.push(profileId);
                }
              } else {
                combinationMap.set(combinationKey, {
                  count: 1,
                  profileIds: [profileId],
                  category: category,
                  startpoint: startpoint,
                  endpoint: endpoint
                });
              }
            }
          });
        }
      });
      
      // Convert map to array
      this.crossoverData = [];
      combinationMap.forEach((value, key) => {
        this.crossoverData.push({
          category: value.category,
          startpoint: value.startpoint,
          endpoint: value.endpoint,
          combination: `${value.startpoint} → ${value.endpoint}`,
          count: value.count,
          profileIds: value.profileIds
        });
      });
      
      // Sort by category, then by count descending
      this.crossoverData.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return b.count - a.count;
      });
      
      // Group by category
      this.groupDataByCategory();
      
      this.filteredData = [...this.crossoverData];
      
    } catch (error) {
      console.error('Error loading crossover metrics:', error);
    } finally {
      this.loading = false;
    }
  }

  groupDataByCategory() {
    this.groupedData = new Map();
    
    this.crossoverData.forEach((entry) => {
      if (!this.groupedData.has(entry.category)) {
        this.groupedData.set(entry.category, []);
      }
      this.groupedData.get(entry.category)!.push(entry);
    });
  }

  filterData() {
    const term = this.searchTerm.toLowerCase().trim();
    
    if (!term) {
      this.filteredData = [...this.crossoverData];
    } else {
      this.filteredData = this.crossoverData.filter((entry) =>
        entry.category.toLowerCase().includes(term) ||
        entry.startpoint.toLowerCase().includes(term) ||
        entry.endpoint.toLowerCase().includes(term) ||
        entry.combination.toLowerCase().includes(term)
      );
    }
    
    // Re-group filtered data
    this.groupedData = new Map();
    this.filteredData.forEach((entry) => {
      if (!this.groupedData.has(entry.category)) {
        this.groupedData.set(entry.category, []);
      }
      this.groupedData.get(entry.category)!.push(entry);
    });
  }

  /** Name search in the participants side panel (2026-11-20); cleared when another combination opens. */
  panelQuery = '';
  readonly panelName = (pid: string): string => this.data?.mapProfile?.[pid] || pid;

  showProfiles(entry: CrossoverEntry) {
    this.panelQuery = '';
    this.selectedEntry = entry;
    this.showProfilePanel = true;
  }

  closeProfilePanel() {
    this.showProfilePanel = false;
    this.selectedEntry = null;
  }

  navigateToProfile(profileId: string) {
    const profileid = profileId;
    const navigationurl = 'userprofile';
    const url = `${navigationurl}/${profileid}`;
    window.open(url, '_blank');
  }

  getTotalCount(): number {
    return this.crossoverData.reduce((sum, entry) => sum + entry.count, 0);
  }

  getCategoryTotal(category: string): number {
    const entries = this.groupedData.get(category);
    return entries ? entries.reduce((sum, entry) => sum + entry.count, 0) : 0;
  }

  closeDialog() {
    this.dialogRef.close();
  }

  /** Export (2026-11-20): the filtered combinations, plus one row per participant behind them. */
  exportCrossover(): void {
    const wb = XLSX.utils.book_new();
    const combos: any[][] = [['Category', 'Startpoint', 'Endpoint', 'Count']];
    const people: any[][] = [['Category', 'Startpoint', 'Endpoint', 'Participant', 'Profile ID']];
    for (const e of this.filteredData) {
      combos.push([e.category, e.startpoint, e.endpoint, e.count]);
      for (const pid of e.profileIds) people.push([e.category, e.startpoint, e.endpoint, this.data?.mapProfile?.[pid] ?? '', pid]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combos), 'Combinations');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(people), 'Participants');
    XLSX.writeFile(wb, `Crossover_metrics_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  /** Export the side panel's participant list for one combination. */
  exportSelectedEntry(): void {
    const e = this.selectedEntry;
    if (!e) return;
    const rows: any[][] = [['S.No', 'Participant', 'Profile ID']];
    nameSearch(e.profileIds, this.panelQuery, this.panelName).forEach((pid, i) => rows.push([i + 1, this.data?.mapProfile?.[pid] ?? '', pid]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Participants');
    const name = `Crossover_${e.category}_${e.startpoint}_to_${e.endpoint}`.replace(/[^a-zA-Z0-9]+/g, '_');
    XLSX.writeFile(wb, `${name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      'Business': 'blue',
      'Career': 'purple',
      'Family': 'pink',
      'Health': 'green',
      'Personal Genius': 'amber'
    };
    return colors[category] || 'gray';
  }
}