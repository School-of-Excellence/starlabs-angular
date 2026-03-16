import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
 name: 'custompipe',
 standalone: true
})
export class CustompipePipe implements PipeTransform {
 transform(value: unknown, ...args: unknown[]): unknown {
   return null;
 }
}

@Pipe({
 name: 'excludeFilterString',
 standalone: true
})
export class ExcludeFilterStringPipe implements PipeTransform {
 transform(value: any[], args: String): any[] {
   let filteredarray = value.filter(e => e != args)
   return filteredarray;
 }
}

@Pipe({
 name: 'linebreaks',
 standalone: true
})
export class LinebreaksPipe implements PipeTransform {
 transform(value: string): string {
   return value.replace(/\\n/g, '<br />');
 }

 transform2(value: string, mapData: any, profileid: any): string {
   if (value.includes('{{name}}')) {
     return value.replace('{{name}}', mapData[profileid])
   } else return ""
 }
}

@Pipe({
 name: 'link',
 standalone: true
})
export class LinkPipe implements PipeTransform {
 transform(value: string): string {
   const urlRegex = /(https?:\/\/[^\s]+)/g
   return value.replace(urlRegex, '<a href="$1" target="_blank">Open Link</a>');
 }
}

@Pipe({
 name: 'message',
 standalone: true
})
export class MessagePipe implements PipeTransform {
 transform(value: string, mapData: any, profileid: any): string {
   console.log(value);
   console.log(mapData);
   console.log(profileid);

   if (value.includes('{{name}}')) {
     return value.replace(/{{name}}/g, mapData[profileid]['name']).replace(/{{email}}/g, mapData[profileid]['email']).replace(/{{number}}/g, mapData[profileid]['number'])
   } else return ""
 }
}

@Pipe({
  name: 'enhancedMessage',
  standalone: true
})
export class EnhancedMessagePipe implements PipeTransform {
  transform(value: string, mapData: any, profileid: string, mapProfileuid?: any): string {
    if (!value) return '';
    
    let processedValue = value;
    
    if (mapProfileuid) {
      // Create a mapping from profileid to user data
      const profileIdToUser: any = {};
      Object.values(mapProfileuid).forEach((user: any) => {
        if (user.profileid) {
          profileIdToUser[user.profileid] = user;
        }
      });
      
      // Replace @profileId with @UserName
      Object.keys(profileIdToUser).forEach(profileId => {
        const userProfile = profileIdToUser[profileId];
        if (userProfile && userProfile.name) {
          const mentionRegex = new RegExp(`@${profileId}`, 'g');
          processedValue = processedValue.replace(mentionRegex, `<span class="mention-tag">@${userProfile.name}</span>`);
        }
      });
    }
    
    // Handle template replacements
    if (mapData && profileid && mapData[profileid]) {
      processedValue = processedValue
        .replace(/\{\{name\}\}/g, mapData[profileid]['name'] || '')
        .replace(/\{\{email\}\}/g, mapData[profileid]['email'] || '')
        .replace(/\{\{number\}\}/g, mapData[profileid]['number'] || '');
    }
    
    return processedValue;
  }
  
}
@Pipe({
  name: 'topCompletedDoers',
  standalone: true
})
export class TopCompletedDoersPipe implements PipeTransform {

  transform(value: any[], limit: number = 10): any[] {
    if (!Array.isArray(value)) return [];

    return value
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

}