import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { grade, scoreSequence, bestFifteen, marketOpen } from '@investibet/core';
import { SPORTS, fetchOdds, fetchEventProps, fetchParticipants, consensus } from './oddsapi.js';
import { fetchSlate, etDay, type Slate } from './espn.js';
import { importTeams, sameTeam } from './teams.js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

/** Where lines come from. 'espn' (default): free, one book. 'oddsapi': consensus of ~40 books, needs a paid plan.
 *  Scores always come from ESPN; score polling is what burned the Odds API free quota in a day. */
const LINES_SOURCE = process.env.LINES_SOURCE === 'oddsapi' ? 'oddsapi' : 'espn';
const LOOKAHEAD_DAYS = 8;

/* ---------------- lines ingest ---------------- */
export const ingestOdds = () => (LINES_SOURCE === 'oddsapi' ? ingestOddsApi() : ingestEspnLines());

async function ingestEspnLines() {
  for (const [sport, league] of Object.entries(SPORTS)) {
    let games = 0, lines = 0;
    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
      let slate: Slate;
      try { slate = await fetchSlate(sport, etDay(new Date(Date.now() + i * 86400e3))); } catch (e) { log('espn fail', league, (e as Error).message); continue; }
      await syncSlate(sport, slate);
      if (slate.lines.length) await sb.from('lines').upsert(slate.lines, { onConflict: 'game_id,market,selection' });
      games += slate.games.length; lines += slate.lines.length;
    }
    if (games) log('lines', league, games, 'games', lines, 'lines');
  }
}

/** Upsert ESPN games, then fold in any legacy Odds API row for the same matchup: picks move over with
 *  their team names rewritten to ESPN spelling (grade() compares selection to games.home/away), and the
 *  legacy row is deleted so the board never shows a game twice. Its stale lines go with it (cascade). */
async function syncSlate(sport: string, slate: Slate) {
  if (!slate.games.length) return;
  const { error } = await sb.from('games').upsert(slate.games, { onConflict: 'id', ignoreDuplicates: false });
  if (error) return log('games upsert fail', sport, error.message);
  if (LINES_SOURCE !== 'espn') return;
  const { data: legacy } = await sb.from('games').select('id, home, away, commence_time').eq('sport_key', sport).eq('completed', false).not('id', 'like', 'espn_%');
  for (const old of legacy ?? []) {
    const g = slate.games.find(n => sameTeam(old.home, n.home) && sameTeam(old.away, n.away) && Math.abs(Date.parse(old.commence_time) - Date.parse(n.commence_time)) < 12 * 3600e3);
    if (!g) continue;
    await sb.from('picks').update({ game_id: g.id, selection: g.home }).eq('game_id', old.id).eq('selection', old.home);
    await sb.from('picks').update({ game_id: g.id, selection: g.away }).eq('game_id', old.id).eq('selection', old.away);
    await sb.from('picks').update({ game_id: g.id }).eq('game_id', old.id); // Over / Under / props keep their selection
    const { error: del } = await sb.from('games').delete().eq('id', old.id);
    log('adopted', old.id, '->', g.id, `${g.away} at ${g.home}`, del ? `(delete failed: ${del.message})` : '');
  }
}

/** Legacy path: The Odds API consensus. Only when LINES_SOURCE=oddsapi and the plan has credits. */
async function ingestOddsApi() {
  for (const [sport, league] of Object.entries(SPORTS)) {
    let events;
    try { events = await fetchOdds(sport); } catch (e) { log('odds fail', sport, (e as Error).message); continue; }
    if (!events.length) continue;
    const games = events.map(e => ({ id: e.id, sport_key: sport, league, home: e.home_team, away: e.away_team, commence_time: e.commence_time, updated_at: new Date().toISOString() }));
    await sb.from('games').upsert(games, { onConflict: 'id', ignoreDuplicates: false });
    const lines = events.flatMap(e => consensus(e).map(l => ({ game_id: e.id, ...l, fetched_at: new Date().toISOString() })));
    if (lines.length) await sb.from('lines').upsert(lines, { onConflict: 'game_id,market,selection' });
    log('odds', league, events.length, 'games', lines.length, 'lines');
  }
}

/** Props on demand: called by the web app via /props/:sport/:eventId. Cached 30 min in `lines`. */
export async function ingestProps(sport: string, eventId: string) {
  const { data: flag } = await sb.from('flags').select('enabled').eq('key', 'props').single();
  if (!flag?.enabled) return { skipped: 'props flag off' };
  if (eventId.startsWith('espn_')) return { skipped: 'props need The Odds API (LINES_SOURCE=oddsapi)' };
  const { data: fresh } = await sb.from('lines').select('fetched_at').eq('game_id', eventId).eq('market', 'prop').gt('fetched_at', new Date(Date.now() - 30 * 60e3).toISOString()).limit(1);
  if (fresh?.length) return { cached: true };
  const ev = await fetchEventProps(sport, eventId);
  const lines = consensus(ev).filter(l => l.market === 'prop').map(l => ({ game_id: eventId, ...l, fetched_at: new Date().toISOString() }));
  if (lines.length) await sb.from('lines').upsert(lines, { onConflict: 'game_id,market,selection' });
  return { lines: lines.length };
}

/* ---------------- scores ingest (ESPN, free) ---------------- */
/** Only asks ESPN about league-days that have a started, unfinished game. Quiet days cost zero calls. */
export async function ingestScores() {
  const { data: open } = await sb.from('games').select('id, sport_key, home, away, commence_time').eq('completed', false)
    .lte('commence_time', new Date().toISOString()).gte('commence_time', new Date(Date.now() - 3 * 86400e3).toISOString());
  const byDay = new Map<string, { sport: string; day: string }>();
  for (const g of open ?? []) { const day = etDay(new Date(g.commence_time)); byDay.set(`${g.sport_key}|${day}`, { sport: g.sport_key, day }); }
  let touched = 0;
  for (const { sport, day } of byDay.values()) {
    let slate: Slate; try { slate = await fetchSlate(sport, day); } catch (e) { log('scores fail', sport, day, (e as Error).message); continue; }
    await syncSlate(sport, slate);
    for (const f of slate.finals) {
      // ESPN id first; otherwise a legacy row for the same matchup (Odds API lines mode keeps those ids)
      const legacy = (open ?? []).find(g => g.sport_key === sport && !g.id.startsWith('espn_') && sameTeam(g.home, f.home) && sameTeam(g.away, f.away));
      for (const id of legacy ? [f.id, legacy.id] : [f.id]) {
        const { data } = await sb.from('games').update({ completed: true, home_score: f.homeScore, away_score: f.awayScore, updated_at: new Date().toISOString() }).eq('id', id).eq('completed', false).select('id');
        touched += data?.length ?? 0;
      }
    }
    for (const id of slate.canceled) if ((open ?? []).some(g => g.id === id)) log('canceled or postponed, picks left pending:', id);
  }
  if (touched) log('scores: finalized', touched);
  return touched;
}

/* ---------------- simulated fills (beta: no broker, price at next open) ---------------- */
export async function fillPending() {
  if (!marketOpen(new Date())) return 0;
  const { data: picks } = await sb.from('picks').select('id, stake, ticker').is('filled_at', null);
  if (!picks?.length) return 0;
  const { data: prices } = await sb.from('prices').select('ticker, price');
  const px = new Map((prices ?? []).map(p => [p.ticker, Number(p.price)]));
  let n = 0;
  for (const p of picks) {
    const price = px.get(p.ticker); if (!price) continue;
    await sb.from('picks').update({ fill_price: price, shares: Number(p.stake) / price, filled_at: new Date().toISOString() }).eq('id', p.id);
    n++;
  }
  if (n) log('filled', n, 'simulated buys');
  return n;
}

/** Daily prices from Stooq (free, no key). Good enough for a simulated portfolio. */
export async function refreshPrices() {
  const { data: tickers } = await sb.from('stock_lines').select('ticker');
  for (const { ticker } of tickers ?? []) {
    try {
      const r = await fetch(`https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`);
      const rows = (await r.text()).trim().split('\n'); const cols = rows[1]?.split(',');
      const close = Number(cols?.[6]); if (!close) continue;
      await sb.from('prices').upsert({ ticker, price: close, as_of: new Date().toISOString() });
    } catch (e) { log('price fail', ticker); }
  }
  log('prices refreshed');
}

/* ---------------- settlement: idempotent, replayable ---------------- */
/** Full replay of one user's points, streak and best-15 from their settled picks.
 *  Beta: every locked pick counts as invested (filled: true). The simulated buy is committed at lock and
 *  cannot fail; it is only priced at the next market open. Games often end before that open (every weekend
 *  slate), and core's unfilled-earns-0 rule was zeroing legitimate wins. That rule returns with real orders. */
export async function rescoreUser(uid: string) {
  const { data: all } = await sb.from('picks').select('id, odds, status, stake, games!inner(commence_time)').eq('user_id', uid).neq('status', 'pending');
  const seq = scoreSequence((all ?? []).map(p => ({ id: p.id, odds: p.odds, status: p.status as any, kickoff: (p as any).games.commence_time, filled: true })));
  const counted = bestFifteen((all ?? []).map(p => ({ id: p.id, kickoff: (p as any).games.commence_time, points: seq.points[p.id] ?? 0 })));
  for (const p of all ?? []) await sb.from('picks').update({ points: seq.points[p.id] ?? 0, counted: counted.has(p.id) }).eq('id', p.id);
  await sb.from('profiles').update({ streak: seq.streak }).eq('id', uid);
}

/** Replay everyone. Run after a scoring rule changes; settlement stays idempotent so this is always safe. */
export async function rescoreAll() {
  const { data } = await sb.from('picks').select('user_id').neq('status', 'pending');
  const uids = [...new Set((data ?? []).map(p => p.user_id))];
  for (const uid of uids) await rescoreUser(uid);
  log('rescored', uids.length, 'users');
  return uids.length;
}

export async function settle() {
  // 1. grade pending picks on completed games
  const { data: pending } = await sb.from('picks')
    .select('id, user_id, market, selection, point, games!inner(home, away, home_score, away_score, completed)')
    .eq('status', 'pending').eq('games.completed', true);
  let graded = 0; const users = new Set<string>();
  for (const p of pending ?? []) {
    const g = (p as any).games;
    const status = grade({ market: p.market, selection: p.selection, point: p.point == null ? null : Number(p.point), home: g.home, away: g.away, homeScore: g.home_score, awayScore: g.away_score });
    if (p.market === 'prop' && status === 'void') continue; // props wait for a stats feed
    await sb.from('picks').update({ status, settled_at: new Date().toISOString() }).eq('id', p.id);
    users.add(p.user_id); graded++;
  }
  // 2. recompute points, streaks, best-15 for affected users (full replay per user: cheap, and always correct)
  for (const uid of users) await rescoreUser(uid);
  await sb.from('settlement_runs').insert({ games_settled: 0, picks_settled: graded });
  if (graded) log('settled', graded, 'picks for', users.size, 'users');
  return graded;
}

/* ---------------- http + schedule ---------------- */
const app = express();
app.get('/health', (_, res) => res.json({ ok: true, at: new Date().toISOString(), rev: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local' }));
app.post('/jobs/odds', async (_, res) => { await ingestOdds(); res.json({ ok: true }); });
app.post('/jobs/scores', async (_, res) => { const n = await ingestScores(); const s = await settle(); res.json({ finalized: n, settled: s }); });
app.post('/jobs/prices', async (_, res) => { await refreshPrices(); await fillPending(); res.json({ ok: true }); });
app.post('/jobs/settle', async (_, res) => res.json({ settled: await settle() }));
app.post('/jobs/rescore', async (_, res) => res.json({ users: await rescoreAll() }));
app.post('/jobs/teams', async (_, res) => res.json(await importTeams(sb, LINES_SOURCE === 'oddsapi' ? fetchParticipants : null)));
app.get('/props/:sport/:eventId', async (req, res) => {
  try { res.json(await ingestProps(req.params.sport, req.params.eventId)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ESPN lines: 6 leagues x 8 days = 48 free calls per run. Odds API lines: 3 credits per league per run.
cron.schedule(LINES_SOURCE === 'espn' ? '20 * * * *' : '0 */6 * * *', ingestOdds);
cron.schedule('*/5 * * * *', async () => { await ingestScores(); await settle(); }); // only calls ESPN when a game is live
cron.schedule('*/15 13-21 * * 1-5', fillPending);                           // during market hours (UTC), fill queued buys
cron.schedule('5 21 * * 1-5', refreshPrices);                               // after close
const teamsJob = () => importTeams(sb, LINES_SOURCE === 'oddsapi' ? fetchParticipants : null);
cron.schedule('0 4 * * 1', teamsJob);                                        // weekly: new aliases only

app.listen(Number(process.env.PORT ?? 8787), async () => {
  log('engine up, lines from', LINES_SOURCE);
  const { count } = await sb.from('games').select('*', { count: 'exact', head: true });
  if (!count) await refreshPrices();
  // Pull lines on every boot: a deploy should never leave the board waiting up to an hour
  ingestOdds().catch(e => log('lines fail', (e as Error).message));
  const { count: teams } = await sb.from('teams').select('*', { count: 'exact', head: true });
  if (!teams) teamsJob().catch(e => log('teams import fail', (e as Error).message));
});
