/** Investibet core math. Pure, zero deps, unit tested. These functions ARE the spec. */

export type Market = 'h2h' | 'spreads' | 'totals' | 'prop';
export type Status = 'pending' | 'won' | 'lost' | 'push' | 'void';

export const implied = (odds: number) =>
  odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);

export const profit = (stake: number, odds: number) =>
  odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds);

/** Points = the American odds on a flat $100 basis. +170 -> 170, -200 -> 50. */
export const basePoints = (odds: number) =>
  odds > 0 ? odds : Math.round(10000 / Math.abs(odds));

export const streakMultiplier = (streak: number) =>
  streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;

export interface GradeInput {
  market: Market;
  selection: string;     // team name | 'Over' | 'Under'
  point: number | null;  // spread (signed, for the selected team) or total
  home: string; away: string;
  homeScore: number; awayScore: number;
}

/** Grade a moneyline, spread or total from a final score. Props return 'void' here; a stats feed settles them. */
export function grade(i: GradeInput): Exclude<Status, 'pending'> {
  const { market, selection, point, home, away, homeScore, awayScore } = i;
  if (market === 'h2h') {
    if (homeScore === awayScore) return 'push';
    const winner = homeScore > awayScore ? home : away;
    return selection === winner ? 'won' : 'lost';
  }
  if (market === 'spreads') {
    if (point == null) return 'void';
    const isHome = selection === home;
    const margin = isHome ? homeScore - awayScore : awayScore - homeScore;
    const adj = margin + point;
    return adj > 0 ? 'won' : adj < 0 ? 'lost' : 'push';
  }
  if (market === 'totals') {
    if (point == null) return 'void';
    const total = homeScore + awayScore;
    if (total === point) return 'push';
    const over = total > point;
    return (selection === 'Over') === over ? 'won' : 'lost';
  }
  return 'void';
}

export interface SettleablePick {
  id: string; odds: number; status: Exclude<Status, 'pending'>; kickoff: string; filled: boolean;
}

/**
 * Walk a user's settled picks in kickoff order, maintaining streak and applying multipliers.
 * Unfilled (uninvested) picks earn 0 but a loss still resets the streak.
 */
export function scoreSequence(picks: SettleablePick[]): { points: Record<string, number>; streak: number } {
  const sorted = [...picks].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  let streak = 0; const points: Record<string, number> = {};
  for (const p of sorted) {
    if (p.status === 'push' || p.status === 'void') { points[p.id] = 0; continue; }
    if (p.status === 'lost') { streak = 0; points[p.id] = 0; continue; }
    if (!p.filled) { points[p.id] = 0; continue; }
    streak += 1;
    points[p.id] = basePoints(p.odds) * streakMultiplier(streak);
  }
  return { points, streak };
}

/** ISO week key, e.g. 2026-W40. */
export function isoWeek(dateIso: string): string {
  const d = new Date(dateIso);
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = u.getUTCDay() || 7; u.setUTCDate(u.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
  return `${u.getUTCFullYear()}-W${String(Math.ceil((((+u - +y) / 864e5) + 1) / 7)).padStart(2, '0')}`;
}

/** Only the best 15 scoring picks per ISO week count. Returns the set of pick ids that count. */
export function bestFifteen(picks: { id: string; kickoff: string; points: number }[]): Set<string> {
  const byWeek = new Map<string, typeof picks>();
  for (const p of picks) {
    const k = isoWeek(p.kickoff);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(p);
  }
  const out = new Set<string>();
  for (const list of byWeek.values())
    list.filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 15).forEach(p => out.add(p.id));
  return out;
}

/** Pot split: 60% pro-rata by points, 40% to the top 10 in descending 10..1 shares. */
export function potSplit(rows: { id: string; points: number }[], pot: number): Record<string, number> {
  const total = rows.reduce((s, r) => s + r.points, 0);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.id] = total ? (pot * 0.6 * r.points) / total : 0;
  const top = [...rows].filter(r => r.points > 0).sort((a, b) => b.points - a.points).slice(0, 10);
  const w = top.map((_, i) => 10 - i); const ws = w.reduce((a, b) => a + b, 0);
  top.forEach((r, i) => { out[r.id] += (pot * 0.4 * w[i]) / ws; });
  return out;
}

/** Sportsbook-timeline delta for one settled pick. Exact, auditable. */
export function counterfactualDelta(stake: number, odds: number, status: Status): number {
  if (status === 'won') return profit(stake, odds);
  if (status === 'lost') return -stake;
  return 0;
}

export const project = (invested: number, avgReturnPct: number, years: number) =>
  invested * Math.pow(1 + avgReturnPct / 100, years);

/** True while the US market is open (9:30 to 16:00 ET, Mon to Fri). Holidays ignored in v1. */
export function marketOpen(at: Date): boolean {
  const et = new Date(at.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); if (day === 0 || day === 6) return false;
  const m = et.getHours() * 60 + et.getMinutes();
  return m >= 570 && m < 960;
}
