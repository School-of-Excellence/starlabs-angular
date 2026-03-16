import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, FormsModule],
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

  showProfiles(entry: CrossoverEntry) {
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