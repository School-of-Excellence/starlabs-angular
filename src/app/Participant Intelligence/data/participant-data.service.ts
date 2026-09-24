import { Observable } from 'rxjs';
import { Audience, CommsAnalytics, Participant, ReferenceData, Remark, Tag } from '../models/participant.model';

// Implementation-agnostic contract the store depends on.
// MockParticipantDataService serves generated data; FirestoreParticipantDataService serves
// live starlabs-test data. Writes default to no-ops so read-only backends still satisfy the type.
export abstract class ParticipantDataService {
  abstract getReferenceData(): Observable<ReferenceData>;
  abstract getParticipants(): Observable<Participant[]>;
  abstract getAudiences(): Observable<Audience[]>;
  abstract getCommsAnalytics(): Observable<CommsAnalytics>;

  persistRemark(_profileIds: string[], _remark: Remark): Promise<void> {
    return Promise.resolve();
  }
  persistTags(_profileIds: string[], _tagIds: string[], _mode: 'add' | 'remove'): Promise<void> {
    return Promise.resolve();
  }
  persistNewTag(_tag: Tag): Promise<void> {
    return Promise.resolve();
  }
  persistAudience(_audience: Audience): Promise<void> {
    return Promise.resolve();
  }
  persistList(_audience: Audience): Promise<void> {
    return Promise.resolve();
  }
}
