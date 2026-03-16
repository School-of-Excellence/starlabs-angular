import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'reduce',
  standalone: true
})
export class ReducePipe implements PipeTransform {
  transform(items: any[], field: string): number {
    if (!items || items.length === 0) return 0;
    return items.reduce((sum, item) => sum + (item[field] || 0), 0);
  }
}