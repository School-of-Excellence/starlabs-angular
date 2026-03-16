import { Component, ViewChild, AfterViewInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { QuizComponent } from '../New-Workshop/quiz/quiz.component';

import { Firestore, collection, collectionData, query } from '@angular/fire/firestore';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-quizscreen',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './quizscreen.component.html',
  styleUrl: './quizscreen.component.css'
})
export class QuizScreenComponent implements AfterViewInit {

  private firestore = inject(Firestore);
  private dialog = inject(MatDialog);

  displayedColumns: string[] = [
    'question',
    'type',
    'active',
    // 'options',
    'actions'
  ];

  dataSource = new MatTableDataSource<any>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private router:Router) {
    this.loadQuizzes();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  viewQuiz(){
    this.router.navigate(['/viewquiz']);    
  }
  openQuizDialog() {
    this.dialog.open(QuizComponent, {
      disableClose: true,
      width: '90vw',
      height: '90vh',
      maxWidth: '1200px'
    });
  }

  loadQuizzes() {
    const quizRef = collection(this.firestore, 'quiz');
    collectionData(quizRef, { idField: 'id' }).subscribe(data => {
      const sortedData = [...data].sort((a: any, b: any) => {
        return (b.active === true ? 1 : 0) - (a.active === true ? 1 : 0);
      });
      this.dataSource.data = sortedData;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }


  openEditDialog(quiz: any) {
    const dialogRef = this.dialog.open(QuizComponent, {
      width: '90vw',
      height: '90vh',
      maxWidth: '1200px',
      disableClose: true,
      data: quiz
    });

    dialogRef.afterClosed().subscribe(() => {
      this.loadQuizzes();
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
}
