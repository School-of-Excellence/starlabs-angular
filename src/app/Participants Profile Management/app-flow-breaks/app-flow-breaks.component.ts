import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, query, where, orderBy, limit, startAfter, getDocs, doc, getDoc, Query, DocumentData } from '@angular/fire/firestore';
import { Subject, takeUntil, combineLatest, of, from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { FilterPipe } from './filterpipe';

interface AppFlowBreak {
  id?: string;
  date: any;
  log: string[];
  note: string;
  profileid: string;
  type: string;
  profileName?: string;
  profileEmail?: string;
  profilePhone?: string;
}

interface ProfileData {
  name?: string;
  email?: string;
  phone?: string;
}

@Component({
  selector: 'app-app-flow-breaks',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterPipe],
  templateUrl: './app-flow-breaks.component.html',
  styleUrl: './app-flow-breaks.component.css'
})
export class AppFlowBreaksComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Make Math available in template
  Math = Math;
  
  // Data
  bugs: AppFlowBreak[] = [];
  allBugs: AppFlowBreak[] = [];
  filteredBugs: AppFlowBreak[] = [];
  
  // Available types for chips
  availableTypes: string[] = [];
  selectedTypes: Set<string> = new Set();
  
  // Pagination
  pageSize = 20;
  currentPage = 0;
  totalPages = 0;
  
  // Search filters
  searchProfileName = '';
  searchEmail = '';
  searchPhone = '';
  
  // Loading state
  isLoading = false;
  
  constructor(private firestore: Firestore) {}
  
  ngOnInit(): void {
    this.loadAllBugs();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async loadAllBugs(): Promise<void> {
    this.isLoading = true;
    
    try {
      const bugsCollection = collection(this.firestore, 'appflowbreaks');
      const q = query(bugsCollection, orderBy('date', 'desc'));
      
      const querySnapshot = await getDocs(q);
      
      this.allBugs = await Promise.all(
        querySnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data() as AppFlowBreak;
          const bug: AppFlowBreak = {
            id: docSnapshot.id,
            ...data
          };
          
          // Fetch profile data
          if (data.profileid) {
            const profileData = await this.getProfileData(data.profileid);
            bug.profileName = profileData.name || 'Unknown';
            bug.profileEmail = profileData.email || '';
            bug.profilePhone = profileData.phone || '';
          }
          
          return bug;
        })
      );
      
      // Extract unique types
      this.availableTypes = [...new Set(this.allBugs.map(bug => bug.type))].sort();
      
      // Initial filter
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading bugs:', error);
    } finally {
      this.isLoading = false;
    }
  }
  
  async getProfileData(profileId: string): Promise<ProfileData> {
    try {
      const profileDoc = doc(this.firestore, 'profile_data', profileId);
      const profileSnapshot = await getDoc(profileDoc);
      
      if (profileSnapshot.exists()) {
        return profileSnapshot.data() as ProfileData;
      }
    } catch (error) {
      console.error('Error fetching profile data:', error);
    }
    
    return {};
  }
  
  toggleTypeFilter(type: string): void {
    if (this.selectedTypes.has(type)) {
      this.selectedTypes.delete(type);
    } else {
      this.selectedTypes.add(type);
    }
    this.currentPage = 0;
    this.applyFilters();
  }
  
  isTypeSelected(type: string): boolean {
    return this.selectedTypes.has(type);
  }
  
  clearTypeFilters(): void {
    this.selectedTypes.clear();
    this.currentPage = 0;
    this.applyFilters();
  }
  
  applyFilters(): void {
    let filtered = [...this.allBugs];
    
    // Filter by selected types
    if (this.selectedTypes.size > 0) {
      filtered = filtered.filter(bug => this.selectedTypes.has(bug.type));
    }
    
    // Filter by profile name
    if (this.searchProfileName.trim()) {
      const searchTerm = this.searchProfileName.toLowerCase().trim();
      filtered = filtered.filter(bug => 
        bug.profileName?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Filter by email
    if (this.searchEmail.trim()) {
      const searchTerm = this.searchEmail.toLowerCase().trim();
      filtered = filtered.filter(bug => 
        bug.profileEmail?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Filter by phone
    if (this.searchPhone.trim()) {
      const searchTerm = this.searchPhone.trim();
      filtered = filtered.filter(bug => 
        bug.profilePhone?.includes(searchTerm)
      );
    }
    
    this.filteredBugs = filtered;
    this.totalPages = Math.ceil(this.filteredBugs.length / this.pageSize);
    this.updateDisplayedBugs();
  }
  
  onSearchChange(): void {
    this.currentPage = 0;
    this.applyFilters();
  }
  
  clearAllFilters(): void {
    this.selectedTypes.clear();
    this.searchProfileName = '';
    this.searchEmail = '';
    this.searchPhone = '';
    this.currentPage = 0;
    this.applyFilters();
  }
  
  updateDisplayedBugs(): void {
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.bugs = this.filteredBugs.slice(startIndex, endIndex);
  }
  
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.updateDisplayedBugs();
    }
  }
  
  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.updateDisplayedBugs();
    }
  }
  
  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.updateDisplayedBugs();
    }
  }
  
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    
    if (this.totalPages <= maxPagesToShow) {
      for (let i = 0; i < this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const halfWindow = Math.floor(maxPagesToShow / 2);
      let startPage = Math.max(0, this.currentPage - halfWindow);
      let endPage = Math.min(this.totalPages - 1, startPage + maxPagesToShow - 1);
      
      if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(0, endPage - maxPagesToShow + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }
  
  formatDate(date: any): string {
    if (!date) return 'N/A';
    
    try {
      // Handle Firestore Timestamp
      if (date.toDate) {
        return date.toDate().toLocaleString();
      }
      // Handle regular Date or string
      return new Date(date).toLocaleString();
    } catch (error) {
      return 'Invalid Date';
    }
  }
  
  getActiveFiltersCount(): number {
    let count = this.selectedTypes.size;
    if (this.searchProfileName.trim()) count++;
    if (this.searchEmail.trim()) count++;
    if (this.searchPhone.trim()) count++;
    return count;
  }
}