// // quiz-dialog.component.ts
// import { Component, Inject, OnInit } from '@angular/core';
// import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
// import { CommonModule } from '@angular/common';
// import { MatDialogModule } from '@angular/material/dialog';
// import { MatButtonModule } from '@angular/material/button';
// import { MatIconModule } from '@angular/material/icon';
// import { MatCardModule } from '@angular/material/card';
// import { MatChipsModule } from '@angular/material/chips';
// import { MatDividerModule } from '@angular/material/divider';
// import { MatListModule } from '@angular/material/list';

// @Component({
//   selector: 'app-quiz-dialog',
//   standalone: true,
//   imports: [
//     CommonModule,
//     MatDialogModule,
//     MatButtonModule,
//     MatIconModule,
//     MatCardModule,
//     MatChipsModule,
//     MatDividerModule,
//     MatListModule
//   ],
//   template: `
//     <div class="quiz-dialog-container">
//       <!-- Header -->
//       <div mat-dialog-title class="quiz-header">
//         <div class="header-content">
//           <mat-icon class="quiz-icon">quiz</mat-icon>
//           <div class="header-text">
//             <h2>{{ quizData?.question || 'Quiz Results' }}</h2>
//             <p class="quiz-subtitle">{{ participantName || 'Participant' }}'s Response</p>
//           </div>
//         </div>
//         <button mat-icon-button (click)="closeDialog()" class="close-button">
//           <mat-icon>close</mat-icon>
//         </button>
//       </div>

//       <!-- Quiz Content -->
//       <div mat-dialog-content class="quiz-content">
        
//         <!-- Quiz Information -->
//         <mat-card class="quiz-info-card" *ngIf="quizData">
//           <mat-card-header>
//             <mat-card-title>Quiz Information</mat-card-title>
//           </mat-card-header>
//           <mat-card-content>
//             <div class="info-grid">
//               <div class="info-item">
//                 <span class="info-label">Submitted:</span>
//                 <span class="info-value">{{ formatDate(quizData.date) }}</span>
//               </div>
//               <div class="info-item">
//                 <span class="info-label">Quiz Name:</span>
//                 <span class="info-value">{{ quizData.quizname || 'N/A' }}</span>
//               </div>
//               <div class="info-item">
//                 <span class="info-label">Quiz ID:</span>
//                 <span class="info-value">{{ quizData.quizId || 'N/A' }}</span>
//               </div>
//               <div class="info-item">
//                 <span class="info-label">Correct:</span>
//                 <mat-chip [class]="quizData.isCorrect ? 'correct-chip' : 'incorrect-chip'">
//                   {{ quizData.isCorrect ? 'Yes' : 'No' }}
//                 </mat-chip>
//               </div>
//             </div>
//           </mat-card-content>
//         </mat-card>

//         <!-- Question Section -->
//         <mat-card class="question-card" *ngIf="quizData?.quizData?.question">
//         <mat-card-header>
//             <mat-card-title>
//             <mat-icon>help_outline</mat-icon>
//             Question
//             </mat-card-title>
//         </mat-card-header>
//         <mat-card-content>
//             <p class="question-text">{{ quizData.quizData.question }}</p>
//         </mat-card-content>
//         </mat-card>


//         <!-- Answer Options -->
//         <mat-card class="options-card" *ngIf="quizData?.quizData?.options">
//           <mat-card-header>
//             <mat-card-title>
//               <mat-icon>list</mat-icon>
//               Answer Options
//             </mat-card-title>
//           </mat-card-header>
//           <mat-card-content>
//             <div class="options-list">
//               <div *ngFor="let option of quizData.quizData.options; let i = index" 
//                    class="option-item"
//                    [class.selected-option]="isSelectedOption(i)"
//                    [class.correct-option]="option.isCorrect"
//                    [class.incorrect-option]="isSelectedOption(i) && !option.isCorrect">
                
//                 <div class="option-header">
//                   <span class="option-number">{{ i + 1 }}</span>
//                   <span class="option-text">{{ option.text }}</span>
                  
//                   <div class="option-badges">
//                     <!-- Selected badge -->
//                     <mat-chip *ngIf="isSelectedOption(i)" class="selected-badge">
//                       <mat-icon>check</mat-icon>
//                       Selected
//                     </mat-chip>
                    
//                     <!-- Correct answer badge -->
//                     <mat-chip *ngIf="option.isCorrect" class="correct-badge">
//                       <mat-icon>verified</mat-icon>
//                       Correct Answer
//                     </mat-chip>
//                   </div>
//                 </div>

//                 <!-- Option explanation -->
//                 <div *ngIf="option.explanation" class="option-explanation">
//                   <mat-icon>info_outline</mat-icon>
//                   <span>{{ option.explanation }}</span>
//                 </div>
//               </div>
//             </div>
//           </mat-card-content>
//         </mat-card>

//         <!-- Selected Answer Details -->
//         <mat-card class="answer-card" *ngIf="quizData?.selectedAnswer">
//           <mat-card-header>
//             <mat-card-title>
//               <mat-icon>assignment_turned_in</mat-icon>
//               Participant's Answer
//             </mat-card-title>
//           </mat-card-header>
//           <mat-card-content>
//             <div class="answer-details">
//               <div class="answer-text">
//                 <span class="answer-label">Selected:</span>
//                 <span class="answer-value">{{ quizData.selectedAnswer.text }}</span>
//               </div>
              
//               <div class="answer-explanation" *ngIf="quizData.selectedAnswer.explanation">
//                 <span class="explanation-label">Explanation:</span>
//                 <p class="explanation-text">{{ quizData.selectedAnswer.explanation }}</p>
//               </div>

//               <div class="answer-status">
//                 <mat-chip [class]="quizData.selectedAnswer.isCorrect ? 'status-correct' : 'status-incorrect'">
//                   <mat-icon>{{ quizData.selectedAnswer.isCorrect ? 'check_circle' : 'cancel' }}</mat-icon>
//                   {{ quizData.selectedAnswer.isCorrect ? 'Correct' : 'Incorrect' }}
//                 </mat-chip>
//               </div>
//             </div>
//           </mat-card-content>
//         </mat-card>
//       </div>

//       <!-- Actions -->
//       <div mat-dialog-actions class="quiz-actions">
//         <button mat-button (click)="closeDialog()">Close</button>
//         <button mat-raised-button color="primary" (click)="closeDialog()">
//           <mat-icon>check</mat-icon>
//           Done
//         </button>
//       </div>
//     </div>
//   `,
//   styles: [`
//     .quiz-dialog-container {
//       width: 100%;
//       max-width: 800px;
//       max-height: 90vh;
//       display: flex;
//       flex-direction: column;
//     }

//     .quiz-header {
//       display: flex;
//       justify-content: space-between;
//       align-items: center;
//       padding: 24px;
//       border-bottom: 1px solid #e0e0e0;
//       margin: 0;
//     }

//     .header-content {
//       display: flex;
//       align-items: center;
//       gap: 16px;
//     }

//     .quiz-icon {
//       font-size: 32px;
//       width: 32px;
//       height: 32px;
//       color: #1976d2;
//     }

//     .header-text h2 {
//       margin: 0;
//       font-size: 24px;
//       font-weight: 600;
//     }

//     .quiz-subtitle {
//       margin: 4px 0 0 0;
//       color: #666;
//       font-size: 14px;
//     }

//     .close-button {
//       margin-left: auto;
//     }

//     .quiz-content {
//       flex: 1;
//       overflow-y: auto;
//       padding: 24px;
//       display: flex;
//       flex-direction: column;
//       gap: 24px;
//     }

//     .quiz-info-card,
//     .question-card,
//     .options-card,
//     .answer-card,
//     .reference-card {
//       margin: 0;
//     }

//     .info-grid {
//       display: grid;
//       grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
//       gap: 16px;
//       margin-top: 16px;
//     }

//     .info-item {
//       display: flex;
//       flex-direction: column;
//       gap: 4px;
//     }

//     .info-label {
//       font-weight: 500;
//       color: #666;
//       font-size: 12px;
//       text-transform: uppercase;
//     }

//     .info-value {
//       font-weight: 600;
//     }

//     .correct-chip {
//       background-color: #4caf50 !important;
//       color: white !important;
//     }

//     .incorrect-chip {
//       background-color: #f44336 !important;
//       color: white !important;
//     }

//     .question-text {
//       font-size: 18px;
//       line-height: 1.6;
//       margin: 16px 0;
//       font-weight: 500;
//     }

//     .options-list {
//       display: flex;
//       flex-direction: column;
//       gap: 16px;
//       margin-top: 16px;
//     }

//     .option-item {
//       border: 2px solid #e0e0e0;
//       border-radius: 8px;
//       padding: 16px;
//       transition: all 0.3s ease;
//     }

//     .option-item.selected-option {
//       border-color: #2196f3;
//       background-color: #e3f2fd;
//     }

//     .option-item.correct-option {
//       border-color: #4caf50;
//       background-color: #e8f5e8;
//     }

//     .option-item.incorrect-option {
//       border-color: #f44336;
//       background-color: #ffebee;
//     }

//     .option-header {
//       display: flex;
//       align-items: center;
//       gap: 12px;
//       margin-bottom: 8px;
//     }

//     .option-number {
//       background: #1976d2;
//       color: white;
//       border-radius: 50%;
//       width: 24px;
//       height: 24px;
//       display: flex;
//       align-items: center;
//       justify-content: center;
//       font-size: 12px;
//       font-weight: bold;
//       flex-shrink: 0;
//     }

//     .option-text {
//       flex: 1;
//       font-weight: 500;
//     }

//     .option-badges {
//       display: flex;
//       gap: 8px;
//     }

//     .selected-badge {
//       background-color: #2196f3 !important;
//       color: white !important;
//     }

//     .correct-badge {
//       background-color: #4caf50 !important;
//       color: white !important;
//     }

//     .option-explanation {
//       display: flex;
//       align-items: flex-start;
//       gap: 8px;
//       margin-top: 8px;
//       padding: 8px;
//       background-color: #f5f5f5;
//       border-radius: 4px;
//       font-size: 14px;
//       color: #666;
//     }

//     .answer-details {
//       margin-top: 16px;
//     }

//     .answer-text {
//       display: flex;
//       flex-direction: column;
//       gap: 4px;
//       margin-bottom: 16px;
//     }

//     .answer-label {
//       font-weight: 500;
//       color: #666;
//       font-size: 12px;
//       text-transform: uppercase;
//     }

//     .answer-value {
//       font-weight: 600;
//       font-size: 16px;
//     }

//     .answer-explanation {
//       margin-bottom: 16px;
//     }

//     .explanation-label {
//       font-weight: 500;
//       color: #666;
//       font-size: 12px;
//       text-transform: uppercase;
//       display: block;
//       margin-bottom: 8px;
//     }

//     .explanation-text {
//       margin: 0;
//       line-height: 1.6;
//     }

//     .status-correct {
//       background-color: #4caf50 !important;
//       color: white !important;
//     }

//     .status-incorrect {
//       background-color: #f44336 !important;
//       color: white !important;
//     }

//     .reference-info {
//       display: flex;
//       flex-direction: column;
//       gap: 4px;
//       margin-top: 16px;
//     }

//     .ref-label {
//       font-weight: 500;
//       color: #666;
//       font-size: 12px;
//       text-transform: uppercase;
//     }

//     .ref-value {
//       font-family: monospace;
//       background: #f5f5f5;
//       padding: 4px 8px;
//       border-radius: 4px;
//       font-size: 14px;
//     }

//     .quiz-actions {
//       padding: 16px 24px;
//       border-top: 1px solid #e0e0e0;
//       display: flex;
//       gap: 16px;
//       justify-content: flex-end;
//     }

//     mat-card-title {
//       display: flex;
//       align-items: center;
//       gap: 8px;
//     }

//     /* Responsive design */
//     @media (max-width: 600px) {
//       .quiz-dialog-container {
//         max-width: 100vw;
//         max-height: 100vh;
//       }

//       .info-grid {
//         grid-template-columns: 1fr;
//       }

//       .option-header {
//         flex-wrap: wrap;
//       }

//       .option-badges {
//         width: 100%;
//         justify-content: flex-start;
//       }
//     }
//   `]
// })
// export class QuizDialogComponent implements OnInit {
//   quizData: any = null;
//   participantName: string = '';

//   constructor(
//     public dialogRef: MatDialogRef<QuizDialogComponent>,
//     @Inject(MAT_DIALOG_DATA) public data: any
//   ) {}

//     ngOnInit() {
//     this.quizData = this.data.quizData;
//     this.participantName = this.data.participantName || 'Participant';

//     // Flatten question to root for easier binding
//     if (this.quizData?.quizData?.question) {
//         this.quizData.question = this.quizData.quizData.question;
//     }

//     console.log('Quiz Dialog Data:', this.quizData);
//     }


//   closeDialog(): void {
//     this.dialogRef.close();
//   }

//   formatDate(timestamp: any): string {
//     if (!timestamp) return 'N/A';
//     const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
//     return date.toLocaleDateString('en-US', {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   }

//   isSelectedOption(index: number): boolean {
//     return this.quizData?.selectedAnswer && 
//            this.quizData.quizData?.options?.[index]?.text === this.quizData.selectedAnswer.text;
//   }
// }
// quiz-dialog.component.ts
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-quiz-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatListModule,
    MatTabsModule
  ],
  template: `
    <div class="quiz-dialog-container">
      <!-- Header -->
      <div mat-dialog-title class="quiz-header">
        <div class="header-content">
          <mat-icon class="quiz-icon">quiz</mat-icon>
          <div class="header-text">
            <h2>Quiz Results</h2>
            <p class="quiz-subtitle">{{ participantName || 'Participant' }}'s Responses ({{ quizResults.length }} Quiz{{ quizResults.length > 1 ? 'es' : '' }})</p>
          </div>
        </div>
        <button mat-icon-button (click)="closeDialog()" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Quiz Content -->
      <div mat-dialog-content class="quiz-content">
        
        <!-- Multiple Quiz Tabs -->
        <mat-tab-group *ngIf="quizResults.length > 1" class="quiz-tabs">
          <mat-tab *ngFor="let quizResult of quizResults; let i = index" 
                   [label]="getTabLabel(quizResult, i)">
            <div class="tab-content">
              <ng-container [ngTemplateOutlet]="quizTemplate" 
                           [ngTemplateOutletContext]="{ $implicit: quizResult.data, index: i }">
              </ng-container>
            </div>
          </mat-tab>
        </mat-tab-group>

        <!-- Single Quiz -->
        <div *ngIf="quizResults.length === 1">
          <ng-container [ngTemplateOutlet]="quizTemplate" 
                       [ngTemplateOutletContext]="{ $implicit: quizResults[0].data, index: 0 }">
          </ng-container>
        </div>

        <!-- Quiz Template -->
        <ng-template #quizTemplate let-quizData let-index="index">
          <div class="single-quiz-container">
            
            <!-- Quiz Information -->
            <mat-card class="quiz-info-card" *ngIf="quizData">
              <mat-card-header>
                <mat-card-title>Quiz Information</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">Submitted:</span>
                    <span class="info-value">{{ formatDate(quizData.date) }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Quiz Name:</span>
                    <span class="info-value">{{ quizData.quizname || 'N/A' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Quiz ID:</span>
                    <span class="info-value">{{ quizData.quizId || 'N/A' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Correct:</span>
                    <mat-chip [class]="quizData.isCorrect ? 'correct-chip' : 'incorrect-chip'">
                      {{ quizData.isCorrect ? 'Yes' : 'No' }}
                    </mat-chip>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Question Section -->
            <mat-card class="question-card" *ngIf="quizData?.quizData?.question">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>help_outline</mat-icon>
                  Question
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <p class="question-text">{{ quizData.quizData.question }}</p>
              </mat-card-content>
            </mat-card>

            <!-- Answer Options -->
            <mat-card class="options-card" *ngIf="quizData?.quizData?.options">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>list</mat-icon>
                  Answer Options
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="options-list">
                  <div *ngFor="let option of quizData.quizData.options; let i = index" 
                       class="option-item"
                       [class.selected-option]="isSelectedOption(quizData, i)"
                       [class.correct-option]="option.isCorrect"
                       [class.incorrect-option]="isSelectedOption(quizData, i) && !option.isCorrect">
                    
                    <div class="option-header">
                      <span class="option-number">{{ i + 1 }}</span>
                      <span class="option-text">{{ option.text }}</span>
                      
                      <div class="option-badges">
                        <!-- Selected badge -->
                        <mat-chip *ngIf="isSelectedOption(quizData, i)" class="selected-badge">
                          <mat-icon>check</mat-icon>
                          Selected
                        </mat-chip>
                        
                        <!-- Correct answer badge -->
                        <mat-chip *ngIf="option.isCorrect" class="correct-badge">
                          <mat-icon>verified</mat-icon>
                          Correct Answer
                        </mat-chip>
                      </div>
                    </div>

                    <!-- Option explanation -->
                    <div *ngIf="option.explanation" class="option-explanation">
                      <mat-icon>info_outline</mat-icon>
                      <span>{{ option.explanation }}</span>
                    </div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Selected Answer Details -->
            <mat-card class="answer-card" *ngIf="quizData?.selectedAnswer">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>assignment_turned_in</mat-icon>
                  Participant's Answer
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="answer-details">
                  <div class="answer-text">
                    <span class="answer-label">Selected:</span>
                    <span class="answer-value">{{ quizData.selectedAnswer.text }}</span>
                  </div>
                  
                  <div class="answer-explanation" *ngIf="quizData.selectedAnswer.explanation">
                    <span class="explanation-label">Explanation:</span>
                    <p class="explanation-text">{{ quizData.selectedAnswer.explanation }}</p>
                  </div>

                  <div class="answer-status">
                    <mat-chip [class]="quizData.selectedAnswer.isCorrect ? 'status-correct' : 'status-incorrect'">
                      <mat-icon>{{ quizData.selectedAnswer.isCorrect ? 'check_circle' : 'cancel' }}</mat-icon>
                      {{ quizData.selectedAnswer.isCorrect ? 'Correct' : 'Incorrect' }}
                    </mat-chip>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

          </div>
        </ng-template>

        <!-- Quiz Summary (for multiple quizzes) -->
        <mat-card class="summary-card" *ngIf="quizResults.length > 1">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>assessment</mat-icon>
              Overall Summary
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="summary-stats">
              <div class="stat-item">
                <span class="stat-label">Total Quizzes:</span>
                <span class="stat-value">{{ quizResults.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Correct Answers:</span>
                <span class="stat-value">{{ getCorrectCount() }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Success Rate:</span>
                <span class="stat-value">{{ getSuccessRate() }}%</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

      </div>

      <!-- Actions -->
      <div mat-dialog-actions class="quiz-actions">
        <button mat-button (click)="closeDialog()">Close</button>
        <button mat-raised-button color="primary" (click)="closeDialog()">
          <mat-icon>check</mat-icon>
          Done
        </button>
      </div>
    </div>
  `,
  styles: [`
    .quiz-dialog-container {
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .quiz-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px;
      border-bottom: 1px solid #e0e0e0;
      margin: 0;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .quiz-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    .header-text h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }

    .quiz-subtitle {
      margin: 4px 0 0 0;
      color: #666;
      font-size: 14px;
    }

    .close-button {
      margin-left: auto;
    }

    .quiz-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .quiz-tabs {
      margin-bottom: 24px;
    }

    .tab-content {
      padding-top: 24px;
    }

    .single-quiz-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .quiz-info-card,
    .question-card,
    .options-card,
    .answer-card,
    .summary-card {
      margin: 0;
    }

    .info-grid,
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }

    .info-item,
    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .info-label,
    .stat-label {
      font-weight: 500;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
    }

    .info-value,
    .stat-value {
      font-weight: 600;
    }

    .correct-chip {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .incorrect-chip {
      background-color: #f44336 !important;
      color: white !important;
    }

    .question-text {
      font-size: 18px;
      line-height: 1.6;
      margin: 16px 0;
      font-weight: 500;
    }

    .options-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 16px;
    }

    .option-item {
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.3s ease;
    }

    .option-item.selected-option {
      border-color: #2196f3;
      background-color: #e3f2fd;
    }

    .option-item.correct-option {
      border-color: #4caf50;
      background-color: #e8f5e8;
    }

    .option-item.incorrect-option {
      border-color: #f44336;
      background-color: #ffebee;
    }

    .option-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .option-number {
      background: #1976d2;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }

    .option-text {
      flex: 1;
      font-weight: 500;
    }

    .option-badges {
      display: flex;
      gap: 8px;
    }

    .selected-badge {
      background-color: #2196f3 !important;
      color: white !important;
    }

    .correct-badge {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .option-explanation {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 8px;
      padding: 8px;
      background-color: #f5f5f5;
      border-radius: 4px;
      font-size: 14px;
      color: #666;
    }

    .answer-details {
      margin-top: 16px;
    }

    .answer-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }

    .answer-label {
      font-weight: 500;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
    }

    .answer-value {
      font-weight: 600;
      font-size: 16px;
    }

    .answer-explanation {
      margin-bottom: 16px;
    }

    .explanation-label {
      font-weight: 500;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      display: block;
      margin-bottom: 8px;
    }

    .explanation-text {
      margin: 0;
      line-height: 1.6;
    }

    .status-correct {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .status-incorrect {
      background-color: #f44336 !important;
      color: white !important;
    }

    .quiz-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 16px;
      justify-content: flex-end;
    }

    mat-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Responsive design */
    @media (max-width: 600px) {
      .quiz-dialog-container {
        max-width: 100vw;
        max-height: 100vh;
      }

      .info-grid,
      .summary-stats {
        grid-template-columns: 1fr;
      }

      .option-header {
        flex-wrap: wrap;
      }

      .option-badges {
        width: 100%;
        justify-content: flex-start;
      }
    }
  `]
})
export class QuizDialogComponent implements OnInit {
  quizResults: any[] = [];
  participantName: string = '';

  constructor(
    public dialogRef: MatDialogRef<QuizDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    this.quizResults = this.data.quizResults || [];
    this.participantName = this.data.participantName || 'Participant';

    // Process each quiz data for easier binding
    this.quizResults.forEach(result => {
      if (result.data?.quizData?.question) {
        result.data.question = result.data.quizData.question;
      }
    });

    console.log('Quiz Dialog Data:', this.quizResults);
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isSelectedOption(quizData: any, index: number): boolean {
    return quizData?.selectedAnswer && 
           quizData.quizData?.options?.[index]?.text === quizData.selectedAnswer.text;
  }

  getTabLabel(quizResult: any, index: number): string {
    const quizName = quizResult.data?.quizname || `Quiz ${index + 1}`;
    const status = quizResult.data?.isCorrect ? '✓' : '✗';
    return `${status} ${quizName}`;
  }

  getCorrectCount(): number {
    return this.quizResults.filter(result => result.data?.isCorrect).length;
  }

  getSuccessRate(): number {
    if (this.quizResults.length === 0) return 0;
    return Math.round((this.getCorrectCount() / this.quizResults.length) * 100);
  }
}