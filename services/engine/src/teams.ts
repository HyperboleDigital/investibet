/** Team identity import: ESPN public teams API (abbreviation, short name, colors) mapped to
 *  The Odds API participant names. Colors become UI accents on monogram discs. No logos.
 *  Rationale and legal read: docs/investibet-design-direction.md section 5. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SPORTS } from './oddsapi.js';
import { ESPN_PATH as ESPN } from './espn.js';

/** Odds API name -> ESPN displayName where the two disagree. */
export const OVERRIDES: Record<string, string> = {
  'Los Angeles Clippers': 'LA Clippers',
  'Oakland Athletics': 'Athletics',
  'UMass Minutemen': 'Massachusetts Minutemen',
};
const CARD_SURFACE = '#151A2C'; // --bg2, what the discs sit on

type EspnTeam = { id: string; abbreviation: string; displayName: string; shortDisplayName: string; location: string; name: string; color?: string; alternateColor?: string };
type Participant = { id: string; full_name: string };

function luminance(hex: string) {
  const c = hex.replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(c)) return null;
  const [r, g, b] = [0, 2, 4].map(i => { const v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b); if (la == null || lb == null) return 0;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05);
}
/** WCAG 3:1 for non-text UI. Team color first, then alternate, else null and the client draws a neutral disc. */
export function pickUiColor(color?: string, alt?: string) {
  for (const c of [color, alt]) if (c && contrast('#' + c, CARD_SURFACE) >= 3) return '#' + c.toLowerCase();
  return null;
}

/** Same normalizer on both sides, so "St. John's Red Storm" and "St John's Red Storm" meet in the middle. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/\bst\.?\s/g, 'state ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Same team under an Odds API spelling and an ESPN spelling. */
export const sameTeam = (a: string, b: string) => norm(OVERRIDES[a] ?? a) === norm(OVERRIDES[b] ?? b);

function match(name: string, teams: EspnTeam[]): { t: EspnTeam; how: string } | null {
  const target = norm(OVERRIDES[name] ?? name);
  const exact = teams.find(x => norm(x.displayName) === target) ?? teams.find(x => norm(`${x.location} ${x.name}`) === target);
  if (exact) return { t: exact, how: 'exact' };
  // Fuzzy: shared tokens over the larger token set. 0.6 catches punctuation and ordering drift,
  // rejects "Miami Hurricanes" vs "Miami (OH) RedHawks" (0.5). Every fuzzy hit is logged for review.
  const tok = new Set(target.split(' ')); let best: EspnTeam | null = null, score = 0;
  for (const x of teams) {
    const xt = new Set(norm(x.displayName).split(' '));
    const s = [...tok].filter(w => xt.has(w)).length / Math.max(tok.size, xt.size);
    if (s > score) { score = s; best = x; }
  }
  return best && score >= 0.6 ? { t: best, how: `fuzzy ${score.toFixed(2)}` } : null;
}

export type TeamsReport = Record<string, { teams: number; aliased: number; fuzzy: string[]; unmatched: string[]; participantsError?: string }>;

/** fetchParticipants is only worth its credit when lines come from The Odds API; pass null otherwise. */
export async function importTeams(sb: SupabaseClient, fetchParticipants: ((sport: string) => Promise<Participant[]>) | null): Promise<TeamsReport> {
  const report: TeamsReport = {};
  for (const [sport, league] of Object.entries(SPORTS)) {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN[sport]}/teams?limit=1000`);
    if (!r.ok) { console.log('[teams] espn fail', league, r.status); continue; }
    const j = await r.json() as { sports?: { leagues?: { teams?: { team: EspnTeam }[] }[] }[] };
    const teams: EspnTeam[] = (j.sports?.[0]?.leagues?.[0]?.teams ?? []).map(x => x.team);
    const rows = teams.map(t => ({
      league, espn_id: t.id, abbreviation: t.abbreviation, display_name: t.displayName, short_name: t.shortDisplayName,
      color: t.color ? '#' + t.color.toLowerCase() : null, alt_color: t.alternateColor ? '#' + t.alternateColor.toLowerCase() : null,
      ui_color: pickUiColor(t.color, t.alternateColor), updated_at: new Date().toISOString(),
    }));
    const { data: saved, error } = await sb.from('teams').upsert(rows, { onConflict: 'league,espn_id' }).select('id, espn_id');
    if (error) { console.log('[teams] upsert fail', league, error.message); continue; }
    const idByEspn = new Map((saved ?? []).map(s => [String(s.espn_id), s.id as number]));
    const rep: TeamsReport[string] = { teams: rows.length, aliased: 0, fuzzy: [], unmatched: [] };

    // Names to map: every ESPN display name (what ESPN-sourced games use), every name already on the board
    // (covers legacy Odds API rows), plus the Odds API participant list when lines come from there.
    const names = new Set<string>(teams.map(t => t.displayName));
    const { data: games } = await sb.from('games').select('home, away').eq('sport_key', sport);
    for (const g of games ?? []) { names.add(g.home); names.add(g.away); }
    if (fetchParticipants) {
      try { for (const p of await fetchParticipants(sport)) names.add(p.full_name); }
      catch (e) { rep.participantsError = (e as Error).message.slice(0, 200); console.log('[teams] participants fail', league, rep.participantsError); }
    }

    const aliases: { odds_api_name: string; team_id: number }[] = [];
    for (const t of teams) { const id = idByEspn.get(t.id); if (id) aliases.push({ odds_api_name: t.displayName, team_id: id }); names.delete(t.displayName); }
    for (const name of names) {
      const m = match(name, teams);
      if (!m) { rep.unmatched.push(name); continue; }
      if (m.how !== 'exact') rep.fuzzy.push(`${name} -> ${m.t.displayName} (${m.how})`);
      const id = idByEspn.get(m.t.id); if (id) aliases.push({ odds_api_name: name, team_id: id });
    }
    // ignoreDuplicates: a hand-fixed alias is never overwritten by a rerun
    // ESPN reuses a display name across leagues now and then (NCAAF and NCAAB share schools). First one wins, both map to the same colors.
    const unique = [...new Map(aliases.map(a => [a.odds_api_name, a])).values()];
    if (unique.length) await sb.from('team_aliases').upsert(unique, { onConflict: 'odds_api_name', ignoreDuplicates: true });
    rep.aliased = unique.length; report[league] = rep;
    console.log(`[teams] ${league}: ${rep.teams} teams, ${rep.aliased} aliased, ${rep.fuzzy.length} fuzzy, ${rep.unmatched.length} unmatched`);
    for (const f of rep.fuzzy) console.log('[teams]   fuzzy', f);
    for (const u of rep.unmatched) console.log('[teams]   unmatched', u);
  }
  return report;
}
