import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter',
  standalone: true
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], searchValue: string, property: string): any[] {
    if (!items || !searchValue || !property) {
      return items;
    }

    return items.filter(item => {
      return item[property] === searchValue;
    });
  }
}