import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { AuthguardService } from '../../authguard.service';

interface DialogData {
  newGroup: boolean;
  groupName?: string;
  userUid?: string;
  userName?: string;
  existingMembers: string[];
  groupRef?: any;
}

interface Profile {
  id: string;
  name: string;
  profile?: string;
  user_ref?: any;
  uid?: string;
}

@Component({
  selector: 'app-add-people-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatToolbarModule,
    MatCheckboxModule,
    MatSnackBarModule,
    FormsModule,
    MatDividerModule
  ],
  templateUrl: './add-people-dialog.component.html',
  styleUrls: ['./add-people-dialog.component.css']
})
export class AddPeopleDialogComponent implements OnInit {
  groupNameForm: FormGroup;
  showGroupNameDialog = true;
  showAddPeopleDialog = false;
  isValidating = false;
  isLoading = false;
  isCreating = false;
  searchMode = false;
  searchText = '';

  profiles: Profile[] = [];
  selectedProfiles: Profile[] = [];
  newMembers: string[] = [];
  loggedinProfile: string | null = null;
  loggedinProfileUserRef: string | null = null;
  loggedinProfileName: string | null = null;

  readonly defaultProfileImage = 'assets/images/profile_default.png';
  readonly groupProfile = 'https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/o/group_profile.png?alt=media&token=10f22ab8-3085-410c-87ca-b8648837c069';

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private guard: AuthguardService,
    public dialogRef: MatDialogRef<AddPeopleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.groupNameForm = this.fb.group({
      groupName: ['', [
        Validators.required,
        Validators.maxLength(25),
        Validators.pattern(/^[a-zA-Z0-9_]+$/)
      ]]
    });

    // If group name is provided, skip to add people
    if (this.data?.groupName) {
      this.showGroupNameDialog = false;
      this.showAddPeopleDialog = true;
      this.groupNameForm.patchValue({ groupName: this.data.groupName });
    }
  }

  async ngOnInit() {
    // ✅ Step 1: Fetch logged-in user data directly here
    try {
      const roles = await this.guard.getRoles();
      this.data = {
        ...this.data,
        newGroup: true,
        groupName: this.data?.groupName || null,
        userUid: roles["user_ref"]?.id || null,
        userName: roles["name"] || null,
        existingMembers: [],
      };
      this.loggedinProfile = roles["profile_ref"]?.id || null;
      this.loggedinProfileUserRef = roles["user_ref"]?.id || null;
      this.loggedinProfileName = roles["name"] || null;
    } catch (error) {
      console.error("Error fetching logged-in profile:", error);
      this.showErrorDialog("Error", "Unable to fetch your profile details.");
    }

    // ✅ Step 2: Continue with normal flow
    if (!this.data.newGroup || this.data.groupName) {
      this.fetchProfiles();
    }
  }


  // Group name validation and submission
  async onGroupNameSubmit() {
    if (this.groupNameForm.valid && !this.isValidating) {
      this.isValidating = true;
      const groupName = this.groupNameForm.value.groupName.toLowerCase();

      try {
        // Simulate checking if group name exists (replace with your actual API call)
        const groupExists = await this.checkGroupExists(groupName);
        
        if (!groupExists) {
          this.data.groupName = groupName;
          this.showGroupNameDialog = false;
          this.showAddPeopleDialog = true;
          this.fetchProfiles();
        } else {
          this.showToast('Group name already exists. Try another.');
        }
      } catch (error) {
        this.showToast(`Error checking group name: ${error}`);
      } finally {
        this.isValidating = false;
      }
    }
  }

  // Fetch profiles from Firestore
  async fetchProfiles() {
    this.isLoading = true;
    try {
      // Replace with your actual Firestore calls
      const [profileData, newUserData] = await Promise.all([
        this.getProfileData(),
        this.getNewUserData()
      ]);

      const combinedProfiles = [...profileData, ...newUserData];
      this.profiles = combinedProfiles
        .filter(profile => !this.data.existingMembers.includes(this.getProfileUid(profile)))
        .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));

    } catch (error) {
      this.showErrorDialog('Error', `Failed to load users: ${error}`);
    } finally {
      this.isLoading = false;
    }
  }

  // Get filtered profiles based on search
  get filteredProfiles(): Profile[] {
    if (!this.searchText) return this.profiles;
    return this.profiles.filter(profile => 
      (profile.name || '').toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  // Toggle member selection
  toggleMember(profile: Profile) {
    const uid = this.getProfileUid(profile);
    if (!uid) return;

    const isSelected = this.newMembers.includes(uid);
    
    if (isSelected) {
      this.newMembers = this.newMembers.filter(id => id !== uid);
      this.selectedProfiles = this.selectedProfiles.filter(p => this.getProfileUid(p) !== uid);
    } else {
      this.newMembers.push(uid);
      this.selectedProfiles.push(profile);
    }
  }

  // Check if profile is selected
  isProfileSelected(profile: Profile): boolean {
    const uid = this.getProfileUid(profile);
    return uid ? this.newMembers.includes(uid) : false;
  }

  // Get profile UID (handles both user_ref and direct uid)
  getProfileUid(profile: Profile): string | null {
    if (profile.user_ref?.id) return profile.user_ref.id;
    if (profile.uid) return profile.uid;
    return null;
  }

  // Get profile image URL
  getProfileImage(profile: Profile): string {
    return profile.profile || this.defaultProfileImage;
  }

  // Toggle search mode
  toggleSearch() {
    this.searchMode = !this.searchMode;
    if (!this.searchMode) {
      this.searchText = '';
    }
  }

  // Create group or add members
  async onSubmit() {
    if (this.data.newGroup) {
      await this.buildGroup();
    } else {
      await this.addNewMembers();
    }
  }

  // Build new group
  async buildGroup() {
    if (this.newMembers.length < 1) {
      this.showErrorDialog(
        'Unable To Create Group',
        'Select at least 1 other member to create a group'
      );
      return;
    }

    this.isCreating = true;
    this.showLoadingDialog();

    try {
      // Build final members list
      let finalMembers = [...this.newMembers];
      if (this.data.userUid && !finalMembers.includes(this.data.userUid)) {
        finalMembers.push(this.data.userUid);
      }

      if (finalMembers.length < 2) {
        this.hideLoadingDialog();
        this.showErrorDialog(
          'Unable To Create Group',
          'A group must have at least 2 members'
        );
        return;
      }

      // Replace with your actual group creation logic
      await this.createGroupInFirestore({
        groupName: this.data.groupName,
        members: finalMembers,
        creatorUid: this.data.userUid,
        groupProfile: this.groupProfile
      });

      this.hideLoadingDialog();
      this.dialogRef.close({ success: true, groupCreated: true });

    } catch (error) {
      this.hideLoadingDialog();
      this.showErrorDialog('Error', `Failed to create group: ${error}`);
    } finally {
      this.isCreating = false;
    }
  }

  // Add members to existing group
  async addNewMembers() {
    if (this.newMembers.length === 0) {
      this.showErrorDialog(
        'No Member Selected',
        'At least select one person to add'
      );
      return;
    }

    try {
      // Replace with your actual add members logic
      await this.addMembersToGroup(this.data.groupRef, this.newMembers);
      this.dialogRef.close({ success: true, membersAdded: true });
    } catch (error) {
      this.showErrorDialog('Error', `Failed to add members: ${error}`);
    }
  }

  // Helper methods for API calls (replace with your actual implementations)
  private async checkGroupExists(groupName: string): Promise<boolean> {
    // Replace with your Firestore query
    return false; // Placeholder
  }

  private async getProfileData(): Promise<Profile[]> {
    // Replace with your Firestore query for profile_data collection
    return []; // Placeholder
  }

  private async getNewUserData(): Promise<Profile[]> {
    // Replace with your Firestore query for new_user_data collection
    return []; // Placeholder
  }

  private async createGroupInFirestore(groupData: any): Promise<void> {
    // Replace with your Firestore group creation logic
    console.log('Creating group:', groupData);
  }

  private async addMembersToGroup(groupRef: any, members: string[]): Promise<void> {
    // Replace with your Firestore add members logic
    console.log('Adding members:', members);
  }

  // UI helper methods
  private showToast(message: string) {
    this.snackBar.open(message, 'Close', { duration: 3000 });
  }

  private showErrorDialog(title: string, message: string) {
    // You can implement a separate error dialog or use snackbar
    this.snackBar.open(`${title}: ${message}`, 'Close', { duration: 5000 });
  }

  private showLoadingDialog() {
    // You can implement a loading dialog or use the component's loading state
  }

  private hideLoadingDialog() {
    // Hide loading dialog
  }

  // Dialog actions
  onCancel() {
    if (this.showAddPeopleDialog && this.data.newGroup) {
      // Go back to group name dialog
      this.showAddPeopleDialog = false;
      this.showGroupNameDialog = true;
    } else {
      this.dialogRef.close();
    }
  }

  get groupNameErrors() {
    const control = this.groupNameForm.get('groupName');
    if (control?.errors && control.touched) {
      if (control.errors['required']) return 'Please enter a group name';
      if (control.errors['pattern']) return 'No special characters except underscore _';
      if (control.errors['maxlength']) return 'Group name must be 25 characters or less';
    }
    return null;
  }
  // Add this method to handle image errors
  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.defaultProfileImage;
  }

}
