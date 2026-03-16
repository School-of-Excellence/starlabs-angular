import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'segmentName',
  standalone: true
})
export class SegmentNamePipe implements PipeTransform {
  transform(segments: any[], segmentId: string): string {
    if (!segments || !segmentId) return segmentId;
    
    const segment = segments.find(s => s.id === segmentId);
    return segment ? (segment.segmentname || segment.name || segment.id) : segmentId;
  }
}