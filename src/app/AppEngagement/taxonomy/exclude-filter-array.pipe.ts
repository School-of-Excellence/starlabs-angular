import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'excludeFilterArrayPipe',
  standalone: true 
})
export class ExcludeFilterArrayPipe implements PipeTransform {
  transform(value: any[] = [], args: any[] = []): any[] {
    return value.filter(e => !args.includes(e['id']));
  }

}
