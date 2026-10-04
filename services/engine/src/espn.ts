/** ESPN public scoreboard: games, lines and final scores in one free call per league per day.
 *  Unofficial and undocumented: no key, no quota, no SLA. Lines are one book (DraftKings, as ESPN shows them).
 *  Date ranges are rejected (400), so callers ask one day at a time. */
import { SPORTS } from './oddsapi.js';

/** Odds API sport key (still the value stored in games.sport_key) -> ESPN path and query extras. */
export const ESPN_PATH: Record<string, string> = {
  americanfootball_nfl: 'football/nfl',
  americanfootball_ncaaf: 'football/college-football',
  basketball_nba: 'basketball/nba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
};
// Without a group, college scoreboards return only featured games. 80 = FBS, 50 = Division I.
const GROUPS: Record<string, string> = { americanfootball_ncaaf: '80', basketball_ncaab: '50' };

type Side = { close?: { line?: string; odds?: string } };
type EspnOdds = { provider?: { name?: string }; moneyline?: { home?: Side; away?: Side }; pointSpread?: { home?: Side; away?: Side }; total?: { over?: Side; under?: Side } };
type EspnEvent = {
  id: string; date: string;
  competitions: { status: { type: { name: string; state: 'pre' | 'in' | 'post'; completed: boolean }; period?: number; displayClock?: string }; situation?: { lastPlay?: { text?: string } };
    competitors: { homeAway: 'home' | 'away'; score?: string; team: { displayName: string } }[]; odds?: EspnOdds[] }[];
};

export type Game = { id: string; sport_key: string; league: string; home: string; away: string; commence_time: string; updated_at: string };
export type LineRow = { game_id: string; market: 'h2h' | 'spreads' | 'totals'; selection: string; point: number | null; price: number; book: string; fetched_at: string };
export type Final = { id: string; home: string; away: string; homeScore: number; awayScore: number };
export type LiveScore = { id: string; homeScore: number; awayScore: number; period: number | null; clock: string | null; lastPlay: string | null };
export type Slate = { games: Game[]; lines: LineRow[]; finals: Final[]; canceled: string[]; live: LiveScore[] };

/** ESPN event ids live in their own namespace so they never collide with legacy Odds API ids (32 hex chars). */
export const gameId = (espnId: string) => `espn_${espnId}`;

/** ESPN files games under the US Eastern calendar day, so a 00:15Z kickoff belongs to the previous ET date. */
export const etDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');

const price = (s?: string) => { if (!s) return null; if (/^even$/i.test(s)) return 100; const n = Number(s); return Number.isFinite(n) && n !== 0 ? Math.round(n) : null; };
const num = (s?: string) => { if (!s) return null; const n = Number(s.replace(/^[ou]/i, '')); return Number.isFinite(n) ? n : null; };

export async function fetchSlate(sport: string, day: string): Promise<Slate> {
  const q = new URLSearchParams({ dates: day, limit: '300' }); if (GROUPS[sport]) q.set('groups', GROUPS[sport]);
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/scoreboard?${q}`);
  if (!r.ok) throw new Error(`espn ${r.status} ${sport} ${day}`);
  const events = ((await r.json()) as { events?: EspnEvent[] }).events ?? [];
  const now = new Date().toISOString(); const out: Slate = { games: [], lines: [], finals: [], canceled: [], live: [] };
  for (const e of events) {
    const c = e.competitions[0]; const home = c.competitors.find(x => x.homeAway === 'home'); const away = c.competitors.find(x => x.homeAway === 'away');
    if (!home || !away) continue;
    // Postseason placeholders ("Padres/Cubs" = winner of that series) are not games yet
    if (home.team.displayName.includes('/') || away.team.displayName.includes('/')) continue;
    const id = gameId(e.id); const st = c.status.type;
    out.games.push({ id, sport_key: sport, league: SPORTS[sport], home: home.team.displayName, away: away.team.displayName, commence_time: e.date, updated_at: now });
    // Only a real final settles. Canceled and postponed games also report state "post", with 0-0.
    if (/CANCEL|POSTPON|SUSPEND|FORFEIT/.test(st.name)) out.canceled.push(id);
    else if (st.state === 'post' && st.completed) {
      const hs = Number(home.score), as = Number(away.score);
      if (Number.isFinite(hs) && Number.isFinite(as)) out.finals.push({ id, home: home.team.displayName, away: away.team.displayName, homeScore: hs, awayScore: as });
    }
    else if (st.state === 'in') {
      const hs = Number(home.score), as = Number(away.score);
      if (Number.isFinite(hs) && Number.isFinite(as)) out.live.push({ id, homeScore: hs, awayScore: as, period: c.status.period ?? null, clock: c.status.displayClock ?? null, lastPlay: c.situation?.lastPlay?.text?.slice(0, 160) ?? null });
    }
    // Lines only before kickoff: ESPN's in-play "odds" are closing numbers, never live prices.
    const o = c.odds?.[0]; if (!o || st.state !== 'pre') continue;
    const book = (o.provider?.name ?? 'espn').toLowerCase(); const add = (market: LineRow['market'], selection: string, point: number | null, p: number | null) => {
      if (p != null && (market === 'h2h' || point != null)) out.lines.push({ game_id: id, market, selection, point, price: p, book, fetched_at: now });
    };
    add('h2h', home.team.displayName, null, price(o.moneyline?.home?.close?.odds));
    add('h2h', away.team.displayName, null, price(o.moneyline?.away?.close?.odds));
    add('spreads', home.team.displayName, num(o.pointSpread?.home?.close?.line), price(o.pointSpread?.home?.close?.odds));
    add('spreads', away.team.displayName, num(o.pointSpread?.away?.close?.line), price(o.pointSpread?.away?.close?.odds));
    add('totals', 'Over', num(o.total?.over?.close?.line), price(o.total?.over?.close?.odds));
    add('totals', 'Under', num(o.total?.under?.close?.line), price(o.total?.under?.close?.odds));
  }
  return out;
}
