import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { grade, scoreSequence, bestFifteen, marketOpen } from '@investibet/core';
import { SPORTS, fetchOdds, fetchScores, fetchEventProps, consensus } from './oddsapi.js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

/* ---------------- odds ingest (cached: once per run, 4x/day per sport) ---------------- */
export async function ingestOdds() {
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
  const { data: fresh } = await sb.from('lines').select('fetched_at').eq('game_id', eventId).eq('market', 'prop').gt('fetched_at', new Date(Date.now() - 30 * 60e3).toISOString()).limit(1);
  if (fresh?.length) return { cached: true };
  const ev = await fetchEventProps(sport, eventId);
  const lines = consensus(ev).filter(l => l.market === 'prop').map(l => ({ game_id: eventId, ...l, fetched_at: new Date().toISOString() }));
  if (lines.length) await sb.from('lines').upsert(lines, { onConflict: 'game_id,market,selection' });
  return { lines: lines.length };
}

/* ---------------- scores ingest ---------------- */
export async function ingestScores() {
  let touched = 0;
  for (const sport of Object.keys(SPORTS)) {
    let events; try { events = await fetchScores(sport); } catch (e) { log('scores fail', sport, (e as Error).message); continue; }
    for (const e of events) {
      if (!e.completed || !e.scores) continue;
      const hs = Number(e.scores.find(s => s.name === e.home_team)?.score);
      const as = Number(e.scores.find(s => s.name === e.away_team)?.score);
      if (Number.isNaN(hs) || Number.isNaN(as)) continue;
      const { error } = await sb.from('games').update({ completed: true, home_score: hs, away_score: as, updated_at: new Date().toISOString() }).eq('id', e.id).eq('completed', false);
      if (!error) touched++;
    }
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
  for (const uid of users) {
    const { data: all } = await sb.from('picks').select('id, odds, status, filled_at, stake, games!inner(commence_time)').eq('user_id', uid).neq('status', 'pending');
    const seq = scoreSequence((all ?? []).map(p => ({ id: p.id, odds: p.odds, status: p.status as any, kickoff: (p as any).games.commence_time, filled: !!p.filled_at })));
    const counted = bestFifteen((all ?? []).map(p => ({ id: p.id, kickoff: (p as any).games.commence_time, points: seq.points[p.id] ?? 0 })));
    for (const p of all ?? []) await sb.from('picks').update({ points: seq.points[p.id] ?? 0, counted: counted.has(p.id) }).eq('id', p.id);
    await sb.from('profiles').update({ streak: seq.streak }).eq('id', uid);
  }
  await sb.from('settlement_runs').insert({ games_settled: 0, picks_settled: graded });
  if (graded) log('settled', graded, 'picks for', users.size, 'users');
  return graded;
}

/* ---------------- http + schedule ---------------- */
const app = express();
app.get('/health', (_, res) => res.json({ ok: true, at: new Date().toISOString() }));
app.post('/jobs/odds', async (_, res) => { await ingestOdds(); res.json({ ok: true }); });
app.post('/jobs/scores', async (_, res) => { const n = await ingestScores(); const s = await settle(); res.json({ finalized: n, settled: s }); });
app.post('/jobs/prices', async (_, res) => { await refreshPrices(); await fillPending(); res.json({ ok: true }); });
app.post('/jobs/settle', async (_, res) => res.json({ settled: await settle() }));
app.get('/props/:sport/:eventId', async (req, res) => {
  try { res.json(await ingestProps(req.params.sport, req.params.eventId)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

cron.schedule('0 */6 * * *', ingestOdds);                                   // 4x/day: ~24 req/day/sport, fits the free tier during beta
cron.schedule('*/10 * * * *', async () => { await ingestScores(); await settle(); }); // every 10 min
cron.schedule('*/15 13-21 * * 1-5', fillPending);                           // during market hours (UTC), fill queued buys
cron.schedule('5 21 * * 1-5', refreshPrices);                               // after close

app.listen(Number(process.env.PORT ?? 8787), async () => {
  log('engine up');
  const { count } = await sb.from('games').select('*', { count: 'exact', head: true });
  if (!count) { await refreshPrices(); await ingestOdds(); }
});
