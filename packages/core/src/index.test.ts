import { describe, it, expect } from 'vitest';
import { basePoints, grade, scoreSequence, bestFifteen, potSplit, counterfactualDelta, implied } from './index';

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
  it('multiplies at 3 and 5, resets on loss, ignores unfilled', () => {
    const mk = (i: number, status: any, filled = true) => ({ id: 'p' + i, odds: 100, status, kickoff: `2026-10-0${i}T00:00:00Z`, filled });
    const r = scoreSequence([mk(1, 'won'), mk(2, 'won'), mk(3, 'won'), mk(4, 'won', false), mk(5, 'won'), mk(6, 'lost'), mk(7, 'won')]);
    expect(r.points.p1).toBe(100); expect(r.points.p3).toBe(150); expect(r.points.p4).toBe(0); expect(r.points.p5).toBe(150); expect(r.points.p6).toBe(0); expect(r.points.p7).toBe(100);
    expect(r.streak).toBe(1);
  });
  it('keeps only 15 per week', () => {
    const picks = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, kickoff: '2026-10-04T17:00:00Z', points: i + 1 }));
    const s = bestFifteen(picks); expect(s.size).toBe(15); expect(s.has('x0')).toBe(false); expect(s.has('x19')).toBe(true);
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
});
