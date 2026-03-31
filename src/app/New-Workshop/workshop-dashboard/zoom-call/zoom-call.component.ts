import { Component, Inject, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import * as XLSX from 'xlsx';
import { FormControl, FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ReactiveFormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
interface ExcelRow {
  columnA?: string;
  columnB?: string;
  name?: string;
  email?: string;
  profileid?: string;
  matchPercentage?: number;
  matchColor?: string; 
}

@Component({
  selector: 'app-zoom-call',
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    NgxMatSelectSearchModule,
    MatProgressSpinnerModule

  ],
  templateUrl: './zoom-call.component.html',
  styleUrl: './zoom-call.component.css'
})
export class ZoomCallComponent implements AfterViewInit {
displayedColumns: string[] = ['delete', 'serial', 'columnA', 'name', 'matchPercentage', 'email'];
  dataSource = new MatTableDataSource<ExcelRow>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  editingRowIndex: number | null = null;
  searchControl = new FormControl('');
  allProfilesList: any[] = [];
  isProcessing = false;
  loadingNames: string[] = [];
  currentLoadingIndex = 0;
  loadingInterval: any;
  colorLegend = [
    { range: '100%', color: '#E8F5E8', label: 'Perfect Match' },
    { range: '90-99%', color: '#E1F5E1', label: 'Excellent' },
    { range: '80-89%', color: '#D4EDDA', label: 'Very Good' },
    { range: '70-79%', color: '#C3E6CB', label: 'Good' },
    { range: '60-69%', color: '#B8E6B8', label: 'Fair' },
    { range: '50-59%', color: '#A8D8A8', label: 'Poor' },
    { range: 'Unmatched', color: '#F8D7DA', label: 'No Match' }
  ];
  constructor(
    public dialogRef: MatDialogRef<ZoomCallComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    console.log("Merged profiles list:", this.data.zoomdata['heading']);
    console.log(this.data.zoomdata['challengeid'],'console challenge id');
    const mapProfile = data.mapProfile || {};
    const mapProfileOld = data.mapProfileold || {};

    this.allProfilesList = [
      ...Object.values(mapProfile),
      ...Object.values(mapProfileOld)
    ];
    console.log("Merged profiles list:", data.zoomdata);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item: ExcelRow, property: string) => {
      switch (property) {
        case 'serial':
          return this.dataSource.data.indexOf(item) + 1;
        case 'name':
          return (item.name || '').toLowerCase().trim();
        case 'email':
          return (item.email || '').toLowerCase().trim();
        case 'profileid':
          return item.profileid || '';
        case 'matchPercentage':
          return item.matchPercentage || 0;
        case 'columnA':
          return (item.columnA || '').toLowerCase().trim();
        case 'columnB':
          return (item.columnB || '').toLowerCase().trim();
        default:
          return (item as any)[property] || '';
      }
    };
  }

  async onFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.isProcessing = true;
    this.loadingNames = [];
    this.currentLoadingIndex = 0;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const binaryString = e.target.result;
      const workbook = XLSX.read(binaryString, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      this.loadingNames = data.slice(1, 51).map(row => (row[0]?.toString() || '').trim()).filter(name => name);
      this.startLoadingAnimation();
      await this.simulateProcessing();
      const mapProfile = this.data.mapProfile || {};
      const mapProfileOld = this.data.mapProfileold || {};
      const combinedProfiles = { ...mapProfile, ...mapProfileOld };

      const excelData: ExcelRow[] = [];
      for (let i = 1; i < data.length; i++) {
        const colA = data[i][0]?.toString() || '';
        const colB = data[i][1]?.toString() || '';
        const matched = this.findBestMatch(colA, combinedProfiles);

        const percentage = matched ? matched.score : 0;
        const color = this.getRowColor(percentage);

        excelData.push({
          columnA: colA,
          columnB: colB,
          name: matched?.name || '',
          email: matched?.email || '',
          profileid: matched?.profileid || '',
          matchPercentage: percentage,
          matchColor: color
        });
      }
      this.stopLoadingAnimation();
      this.dataSource.data = excelData;

      setTimeout(() => {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      });
    };

    reader.readAsArrayBuffer(file);
  }

    private startLoadingAnimation() {
    this.loadingInterval = setInterval(() => {
      this.currentLoadingIndex = (this.currentLoadingIndex + 1) % this.loadingNames.length;
    }, 100);
  }

  private stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    this.isProcessing = false;
  }

  private async simulateProcessing() {
    const delay = Math.min(3000, 1000 + this.loadingNames.length * 20);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  getSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 100;
    if (b.includes(a)) return 95;
    if (a.includes(b) || b.includes(a.slice(0, Math.floor(a.length * 0.8)))) {
      return 85;
    }
    const dp = Array(a.length + 1).fill(null).map(() =>
      Array(b.length + 1).fill(null)
    );

    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    const distance = dp[a.length][b.length];
    const maxLen = Math.max(a.length, b.length);
    return ((maxLen - distance) / maxLen) * 100;
  }

  findBestMatch(name: string, profiles: any): any {
    if (!name) return null;
    const cleanedInput = name.replace(/\([^)]*\)/g, '').trim();
    const input = cleanedInput.toLowerCase().trim();
    const inputWords = input.split(/\s+/).filter(w => w.length > 0);

    let bestMatch = null;
    let bestScore = 0;

    Object.values(profiles).forEach((p: any) => {
      const profileName = (p.name || '').toLowerCase().trim();
      if (!profileName) return;
      const profileWords = profileName.split(/\s+/).filter(w => w.length > 0);
      let score = 0;
      
      if (profileName === input || profileName === cleanedInput.toLowerCase()) {
        score = 100;
      }
      else if (this.isAbbreviationMatch(inputWords, profileWords)) {
        score = 99;
      }
      else if (this.isAbbreviationMatch(profileWords, inputWords)) {
        score = 99;
      }
      else if (profileName.includes(input) && input.length >= 5) {
        score = 95;
      }
      else if (input.includes(profileName) && profileName.length >= 5) {
        score = 95;
      }
      else {
        const matchScore = this.calculateWordMatchScore(inputWords, profileWords);
        score = matchScore;
      }
      const lengthRatio = Math.min(input.length, profileName.length) / Math.max(input.length, profileName.length);
      if (score < 100 && lengthRatio < 0.4) {
        score = score * 0.7; 
      }
      if (profileName.length <= 5 && input.length > 10 && score < 99) {
        score = score * 0.5; 
      }
      console.log(`"${name}" vs "${p.name}": ${score.toFixed(1)}% (len ratio: ${lengthRatio.toFixed(2)})`);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { ...p, score };
      }
    });
    console.log(`✅ Best match for "${name}": "${bestMatch?.name}" (${bestScore.toFixed(1)}%)`);
    return bestScore >= 55 ? bestMatch : null;
  }

  private calculateWordMatchScore(inputWords: string[], profileWords: string[]): number {
    let matchedCount = 0;
    let partialMatchCount = 0;
    
    for (const inputWord of inputWords) {
      let foundExact = false;
      let foundPartial = false;
      
      for (const profileWord of profileWords) {
        if (inputWord === profileWord) {
          foundExact = true;
          break;
        } else if (inputWord.length > 2 && profileWord.includes(inputWord)) {
          foundPartial = true;
        } else if (profileWord.length > 2 && inputWord.includes(profileWord)) {
          foundPartial = true;
        } else if (inputWord.length === 1 && profileWord.startsWith(inputWord)) {
          foundPartial = true;
        }
      }
      
      if (foundExact) matchedCount += 1;
      else if (foundPartial) partialMatchCount += 0.5;
    }
    
    const totalMatch = matchedCount + partialMatchCount;
    const matchRatio = totalMatch / inputWords.length;

    if (matchRatio >= 0.95) return 98;
    if (matchRatio >= 0.8) return 90;
    if (matchRatio >= 0.6) return 80;
    if (matchRatio >= 0.4) return 70;

    const inputStr = inputWords.join(' ');
    const profileStr = profileWords.join(' ');
    return this.getSimilarity(inputStr, profileStr);
  }

  private isAbbreviationMatch(shortWords: string[], longWords: string[]): boolean {
    if (shortWords.length !== longWords.length) return false;
    if (shortWords.length === 0) return false;
    return shortWords.every((shortWord, index) => {
      const longWord = longWords[index];
      return shortWord === longWord || 
            (shortWord.length === 1 && longWord.startsWith(shortWord));
    });
  }
  startEdit(index: number) {
    this.editingRowIndex = index;
    this.searchControl.setValue('');
  }

  stopEdit() {
    this.editingRowIndex = null;
  }

  filterProfiles(search: string) {
    if (!search) return this.allProfilesList;
    const term = search.toLowerCase();
    return this.allProfilesList.filter((u: any) =>
      (u.name || '').toLowerCase().includes(term)
    );
  }

  updateSelectedProfile(selected: any, row: any, index: number) {
    if (!selected) return;
    row.name = selected.name || '';
    row.email = selected.email || '';
    row.profileid = selected.profileid || '';
    const data = [...this.dataSource.data];
    this.dataSource.data = data;
    this.stopEdit();
  }

  getRowColor(percentage: number): string {
    if (percentage === 0) return '#F8D7DA';
    if (percentage === 100) return '#E8F5E8';
    if (percentage >= 90) return '#E1F5E1';
    if (percentage >= 80) return '#D4EDDA';
    if (percentage >= 70) return '#C3E6CB';
    if (percentage >= 60) return '#B8E6B8';
    return '#A8D8A8'; // 50-59%
  }
  get totalRows(): number {
    return this.dataSource.data.length;
  }

  get matchedCount(): number {
    return this.dataSource.data.filter(row => row.matchPercentage && row.matchPercentage >= 55).length;
  }

  get unmatchedCount(): number {
    return this.dataSource.data.filter(row => !row.matchPercentage || row.matchPercentage < 55).length;
  }


  exportToCSV(): void {
    if (this.dataSource.data.length === 0) {
      console.warn('No data to export');
      return;
    }

    const headers = ['Column A', 'Column B', 'Name', 'Email', 'Profile ID'];
    const csvContent = [
      headers.join(','),
      ...this.dataSource.data.map(row => [
        `"${row.columnA || ''}"`,
        `"${row.columnB || ''}"`,
        `"${row.name || ''}"`,
        `"${row.email || ''}"`,
        `"${row.profileid || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.data.zoomdata['heading']}-zoom-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // this.dialogRef.close({
    //   profileIds: this.dataSource.data
    //     .filter(row => row.profileid)
    //     .map(row => row.profileid)
    // });
  }
  onUpdate() {
    const profileIds = this.dataSource.data
      .filter(row => row.profileid)
      .map(row => row.profileid);

    this.dialogRef.close({
      profileIds: profileIds
    });
  }

  onClose() {
    this.dialogRef.close()
  }
  deleteRow(index:number){
    const data = [...this.dataSource.data];
    data.splice(index,1)
    this.dataSource.data = data;
  }
}
