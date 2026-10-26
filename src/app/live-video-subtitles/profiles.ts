import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  QueryDocumentSnapshot,
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from '@angular/fire/firestore';

import type { Profile } from './speakers';

/** Face vectors written by the AH-CRM app (Face Check → vectorize). Read-only here. */
const COLLECTION = 'face_detection';
const PAGE_SIZE = 100;
const FIELDS = ['profileimg', 'profile'];

/**
 * Every vectorized profile's MobileFaceNet vectors (`<field>_mbf`), loaded in
 * pages of 100 (the collection holds ~2k numbers per profile).
 */
export async function loadProfiles(
  firestore: Firestore,
  injector: EnvironmentInjector,
  onProgress: (loaded: number) => void,
): Promise<Profile[]> {
  return runInInjectionContext(injector, async () => {
    const out: Profile[] = [];
    let last: QueryDocumentSnapshot | null = null;
    for (;;) {
      const base = collection(firestore, COLLECTION);
      const q = last
        ? query(base, orderBy(documentId()), startAfter(last), limit(PAGE_SIZE))
        : query(base, orderBy(documentId()), limit(PAGE_SIZE));
      const page = await getDocs(q);
      for (const d of page.docs) {
        const data = d.data() as Record<string, any>;
        const vectors: Float32Array[] = [];
        for (const f of FIELDS) {
          const v = data[`${f}_mbf`];
          if (Array.isArray(v) && v.length) vectors.push(Float32Array.from(v as number[]));
        }
        if (!vectors.length) continue;
        out.push({
          id: d.id,
          name: String(data['name'] ?? ''),
          imageUrl: (data['profileimg_url'] || data['profile_url'] || null) as string | null,
          vectors,
        });
      }
      onProgress(out.length);
      if (page.docs.length < PAGE_SIZE) break;
      last = page.docs[page.docs.length - 1];
    }
    return out;
  });
}

/** Profiles stay loaded for the browser session (they rarely change). */
let cache: Profile[] | null = null;
let loading: Promise<Profile[]> | null = null;

/** {@link loadProfiles}, once per browser session (shared by upload and camera). */
export function loadProfilesCached(
  firestore: Firestore,
  injector: EnvironmentInjector,
  onProgress: (loaded: number) => void,
): Promise<Profile[]> {
  if (cache) return Promise.resolve(cache);
  loading ??= loadProfiles(firestore, injector, onProgress)
    .then((list) => (cache = list))
    .finally(() => (loading = null));
  return loading;
}
