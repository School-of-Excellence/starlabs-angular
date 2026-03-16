import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'cohortsFilter',
  standalone: true
})
export class CohortsFilterPipe implements PipeTransform {
  transform(cohorts: any[], searchText: string): any[] {
    if (!cohorts || !searchText) {
      return cohorts;
    }

    searchText = searchText.toLowerCase();

    return cohorts.filter(cohort => {
      const cohortName = (cohort.cohortname || cohort.name || cohort.id || '').toLowerCase();
      return cohortName.includes(searchText);
    });
  }
}