/**
 * AnalyticsService — Phase A
 *
 * Returns mock data shaped exactly like the runAnalytics Cloud Function will
 * return in Phase B. When you flip to live, the public method signatures stay
 * the same; only the internal data source changes.
 *
 * Mock contract notes:
 *   - completion-velocity:    { week: 'YYYY-MM-DD' (Monday), product_id, completions }[]
 *   - funnel-dropoff:         { product_id, stage, count }[]
 *   - specialist-utilization: { specialist_id, profile_ref, week, booked, available, utilization }[]
 */
import { Injectable } from '@angular/core';

export interface VelocityRow {
  week: string;
  product_id: string;
  completions: number;
}

export interface FunnelRow {
  product_id: string;
  stage: 'initiated' | 'awaiting' | 'started' | 'ongoing' | 'completed';
  count: number;
}

export interface UtilizationRow {
  specialist_id: string;
  profile_ref: string;
  week: string;
  booked: number;
  available: number;
  utilization: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {

  // ---------- Public API (matches Cloud Function dispatcher) ----------

  async completionVelocity(opts: { weeks: number; productIds?: string[] | null } = { weeks: 12 }): Promise<VelocityRow[]> {
    await this.simulateLatency();
    return this.mockVelocity(opts.weeks, opts.productIds ?? null);
  }

  async funnelDropoff(opts: { fromDate?: string; productIds?: string[] | null } = {}): Promise<FunnelRow[]> {
    await this.simulateLatency();
    return this.mockFunnel(opts.productIds ?? null);
  }

  async specialistUtilization(opts: { weeks: number } = { weeks: 8 }): Promise<UtilizationRow[]> {
    await this.simulateLatency();
    return this.mockUtilization(opts.weeks);
  }

  // ---------- Mocks ----------

  private products = ['Critical Support', 'EI Starter Pack', 'EI Solution', 'WiSH'];

  private specialists = [
    { id: 'spec-1', name: 'Saravanan Aruljothi' },
    { id: 'spec-2', name: 'Prakash Saravanan' },
    { id: 'spec-3', name: 'Lakshmi Narayanan' },
    { id: 'spec-4', name: 'Divya Ramaswamy' },
  ];

  private mockVelocity(weeks: number, productIds: string[] | null): VelocityRow[] {
    const rows: VelocityRow[] = [];
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const ids = productIds && productIds.length > 0 ? productIds : this.products;
    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = new Date(monday);
      weekStart.setDate(monday.getDate() - w * 7);
      const weekStr = weekStart.toISOString().slice(0, 10);
      for (const p of ids) {
        // Slightly different base + jitter per product. Mild upward trend.
        const base =
          p === 'Critical Support' ? 5 :
          p === 'EI Starter Pack' ? 3 :
          p === 'EI Solution' ? 2 : 1;
        const trend = (weeks - 1 - w) * 0.18; // gentle upward over time
        const jitter = (this.seeded(weekStr + p) % 5) - 2;
        const completions = Math.max(0, Math.round(base + trend + jitter));
        if (completions > 0) {
          rows.push({ week: weekStr, product_id: p, completions });
        }
      }
    }
    return rows;
  }

  private mockFunnel(productIds: string[] | null): FunnelRow[] {
    const stages: FunnelRow['stage'][] = ['initiated', 'awaiting', 'started', 'ongoing', 'completed'];
    const ids = productIds && productIds.length > 0 ? productIds : this.products;
    const rows: FunnelRow[] = [];
    for (const p of ids) {
      // Per-product totals at the wide end of the funnel
      const init =
        p === 'Critical Support' ? 142 :
        p === 'EI Starter Pack' ? 98 :
        p === 'EI Solution' ? 67 : 41;
      // Decreasing through the funnel with realistic drop-off
      const stageCounts: Record<FunnelRow['stage'], number> = {
        initiated: init,
        awaiting:  Math.round(init * 0.78),
        started:   Math.round(init * 0.61),
        ongoing:   Math.round(init * 0.44),
        completed: Math.round(init * 0.27),
      };
      for (const s of stages) {
        rows.push({ product_id: p, stage: s, count: stageCounts[s] });
      }
    }
    return rows;
  }

  private mockUtilization(weeks: number): UtilizationRow[] {
    const rows: UtilizationRow[] = [];
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    for (const sp of this.specialists) {
      for (let w = weeks - 1; w >= 0; w--) {
        const weekStart = new Date(monday);
        weekStart.setDate(monday.getDate() - w * 7);
        const weekStr = weekStart.toISOString().slice(0, 10);
        const seed = this.seeded(weekStr + sp.id);
        const booked = 12 + (seed % 14);                  // 12..25
        const available = 4 + ((seed >> 3) % 12);         // 4..15
        const utilization = booked / (booked + available);
        rows.push({
          specialist_id: sp.id,
          profile_ref: sp.name,
          week: weekStr,
          booked,
          available,
          utilization: Math.round(utilization * 1000) / 1000,
        });
      }
    }
    return rows;
  }

  // Deterministic pseudo-random for stable mocks across reloads
  private seeded(key: string): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  private simulateLatency(): Promise<void> {
    return new Promise((res) => setTimeout(res, 120));
  }
}
