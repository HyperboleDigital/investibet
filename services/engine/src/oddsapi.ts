/** The Odds API v4 client. Docs: https://the-odds-api.com/liveapi/guides/v4/ */
const BASE = 'https://api.the-odds-api.com/v4';

export const SPORTS: Record<string, string> = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  basketball_ncaab: 'NCAAB',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
};

/** Player-prop markets per sport (only used when the props flag is on). */
export const PROP_MARKETS: Record<string, string[]> = {
  americanfootball_nfl: ['player_pass_tds', 'player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_anytime_td'],
  americanfootball_ncaaf: ['player_pass_yds', 'player_rush_yds', 'player_anytime_td'],
  basketball_nba: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  basketball_ncaab: ['player_points', 'player_rebounds', 'player_assists'],
  baseball_mlb: ['batter_home_runs', 'batter_hits', 'pitcher_strikeouts'],
  icehockey_nhl: ['player_points', 'player_shots_on_goal', 'player_goal_scorer_anytime'],
};

export interface OddsEvent {
  id: string; sport_key: string; commence_time: string; home_team: string; away_team: string;
  bookmakers: { key: string; markets: { key: string; outcomes: { name: string; price: number; point?: number; description?: string }[] }[] }[];
}
export interface ScoreEvent {
  id: string; sport_key: string; commence_time: string; completed: boolean; home_team: string; away_team: string;
  scores: { name: string; score: string }[] | null;
}

const key = () => { const k = process.env.ODDS_API_KEY; if (!k) throw new Error('ODDS_API_KEY missing'); return k; };

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(BASE + path);
  Object.entries({ apiKey: key(), ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`odds api ${r.status} ${path}: ${await r.text()}`);
  const remaining = r.headers.get('x-requests-remaining');
  if (remaining) console.log(`[odds] requests remaining: ${remaining}`);
  return r.json() as Promise<T>;
}

export const fetchOdds = (sport: string) =>
  get<OddsEvent[]>(`/sports/${sport}/odds`, { regions: 'us', markets: 'h2h,spreads,totals', oddsFormat: 'american' });

export const fetchEventProps = (sport: string, eventId: string) =>
  get<OddsEvent>(`/sports/${sport}/events/${eventId}/odds`, { regions: 'us', markets: (PROP_MARKETS[sport] ?? []).join(','), oddsFormat: 'american' });

/** Canonical team names per sport (1 credit). Used once by the teams import to build aliases. */
export const fetchParticipants = (sport: string) =>
  get<{ id: string; full_name: string }[]>(`/sports/${sport}/participants`, {});

export const fetchScores = (sport: string, daysFrom = 3) =>
  get<ScoreEvent[]>(`/sports/${sport}/scores`, { daysFrom: String(daysFrom) });

/** Consensus line: median price across books, most common point. */
export function consensus(ev: OddsEvent) {
  const acc = new Map<string, { market: string; selection: string; points: number[]; prices: number[] }>();
  for (const b of ev.bookmakers) for (const m of b.markets) for (const o of m.outcomes) {
    const isProp = m.key.startsWith('player_') || m.key.startsWith('batter_') || m.key.startsWith('pitcher_');
    const market = isProp ? 'prop' : m.key;
    const selection = isProp ? `${o.description ?? ''}|${m.key}|${o.name}` : o.name;
    const k = `${market}|${selection}`;
    const e = acc.get(k) ?? { market, selection, points: [], prices: [] };
    if (o.point != null) e.points.push(o.point);
    e.prices.push(o.price);
    acc.set(k, e);
  }
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const mode = (a: number[]) => { const c = new Map<number, number>(); for (const x of a) c.set(x, (c.get(x) ?? 0) + 1); return [...c.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null; };
  return [...acc.values()].map(e => ({ market: e.market, selection: e.selection, point: e.points.length ? mode(e.points) : null, price: Math.round(median(e.prices)) }));
}
