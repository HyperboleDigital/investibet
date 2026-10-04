import { describe, it, expect } from 'vitest';
import { basePoints, streakMultiplier, grade, scoreSequence, bestFifteen, potSplit, counterfactualDelta, implied, decimalOdds, stackOdds, stackPoints, bookValue, project, projectSmart } from './index';

describe('points', () => {
  it('equals the odds', () => { expect(basePoints(170)).toBe(170); expect(basePoints(-200)).toBe(50); expect(basePoints(-110)).toBe(91); });
  it('implied probability', () => { expect(implied(100)).toBeCloseTo(0.5); expect(implied(-200)).toBeCloseTo(2 / 3); });
});

describe('grading', () => {
  const base = { home: 'Bills', away: 'Jets', homeScore: 24, awayScore: 20 };
  it('moneyline', () => {
    expect(grade({ ...base, market: 'h2h', selection: 'Bills', point: null })).toBe('won');
    expect(grade({ ...base, market: 'h2h', selection: 'Jets', point: null })).toBe('lost');
  });
  it('spread', () => {
    expect(grade({ ...base, market: 'spreads', selection: 'Jets', point: 6.5 })).toBe('won');
    expect(grade({ ...base, market: 'spreads', selection: 'Bills', point: -4 })).toBe('push');
    expect(grade({ ...base, market: 'spreads', selection: 'Bills', point: -3.5 })).toBe('won');
  });
  it('total', () => {
    expect(grade({ ...base, market: 'totals', selection: 'Over', point: 43.5 })).toBe('won');
    expect(grade({ ...base, market: 'totals', selection: 'Under', point: 44 })).toBe('push');
  });
});

describe('streaks and best 15', () => {
  it('compounds 20% per consecutive win, capped at 5x', () => {
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBeCloseTo(1.2);
    expect(streakMultiplier(3)).toBeCloseTo(1.44);
    expect(streakMultiplier(5)).toBeCloseTo(2.0736);
    expect(streakMultiplier(10)).toBe(5);
    expect(streakMultiplier(14)).toBe(5);
  });
  it('applies the compounding streak, resets on loss, ignores unfilled', () => {
    const mk = (i: number, status: any, filled = true) => ({ id: 'p' + i, odds: 100, status, kickoff: `2026-10-0${i}T00:00:00Z`, filled });
    const r = scoreSequence([mk(1, 'won'), mk(2, 'won'), mk(3, 'won'), mk(4, 'won', false), mk(5, 'won'), mk(6, 'lost'), mk(7, 'won')]);
    expect(r.points.p1).toBe(100); expect(r.points.p2).toBeCloseTo(120); expect(r.points.p3).toBeCloseTo(144);
    expect(r.points.p4).toBe(0); expect(r.points.p5).toBeCloseTo(172.8); expect(r.points.p6).toBe(0); expect(r.points.p7).toBe(100);
    expect(r.streak).toBe(1);
  });
  it('keeps only 15 per week', () => {
    const picks = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, kickoff: '2026-10-04T17:00:00Z', points: i + 1 }));
    const s = bestFifteen(picks); expect(s.size).toBe(15); expect(s.has('x0')).toBe(false); expect(s.has('x19')).toBe(true);
  });
});

describe('stacks', () => {
  it('converts american to decimal', () => { expect(decimalOdds(150)).toBeCloseTo(2.5); expect(decimalOdds(-200)).toBeCloseTo(1.5); });
  it('single leg passes through', () => { expect(stackOdds([100])).toBe(100); expect(stackOdds([-110])).toBe(-110); expect(stackOdds([600])).toBe(600); });
  it('combines decimal odds and converts back', () => {
    expect(stackOdds([-110, -110])).toBe(264);
    expect(stackOdds([-110, -110, -110])).toBe(596);
    expect(stackOdds([200, 150])).toBe(650);
  });
  it('stack points ride the flat $100 basis', () => { expect(stackPoints([200, 150])).toBe(650); expect(stackPoints([-110, -110])).toBe(264); });
});

describe('projections', () => {
  it('a market-average stock projects at the market average', () => {
    expect(projectSmart(100, 8, 10)).toBeCloseTo(project(100, 8, 10), 6);
  });
  it('shrinks and fades a hot decade instead of extrapolating it', () => {
    const v15 = projectSmart(120, 70, 15);
    expect(v15).toBeGreaterThan(400);   // still clearly outgrows the market
    expect(v15).toBeLessThan(3500);     // but no eight-digit fantasy
    expect(projectSmart(120, 70, 15)).toBeLessThan(project(120, 70, 15));
  });
  it('fades laggards up toward the market, gently', () => {
    const v = projectSmart(100, 1.5, 10);
    expect(v).toBeGreaterThan(project(100, 1.5, 10));
    expect(v).toBeLessThan(project(100, 8, 10));
  });
  it('is monotonic in years and supports fractions', () => {
    expect(projectSmart(100, 30, 2.5)).toBeGreaterThan(projectSmart(100, 30, 2));
    expect(projectSmart(100, 30, 2.5)).toBeLessThan(projectSmart(100, 30, 3));
    expect(projectSmart(100, 30, 0)).toBeCloseTo(100);
  });
});

describe('pot and counterfactual', () => {
  it('splits the pot to the dollar', () => {
    const s = potSplit([{ id: 'a', points: 300 }, { id: 'b', points: 100 }], 100);
    expect(s.a + s.b).toBeCloseTo(100); expect(s.a).toBeGreaterThan(s.b);
  });
  it('sportsbook timeline', () => {
    expect(counterfactualDelta(20, 170, 'won')).toBeCloseTo(34); expect(counterfactualDelta(20, 170, 'lost')).toBe(-20); expect(counterfactualDelta(20, 170, 'push')).toBe(0);
  });
  it('book value keeps pending stakes in play and settles the rest', () => {
    expect(bookValue([
      { stake: 20, odds: 170, status: 'won' },
      { stake: 20, odds: 170, status: 'lost' },
      { stake: 20, odds: 170, status: 'pending' },
    ])).toBeCloseTo(74);
    expect(bookValue([])).toBe(0);
  });
});
