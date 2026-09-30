import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, ENABLE_PROPS } from './lib/supabase';
import Symbol from './Symbol';
import { implied, basePoints, profit, potSplit, counterfactualDelta, project, marketOpen } from '@investibet/core';

/* ---------- types ---------- */
type Game = { id: string; sport_key: string; league: string; home: string; away: string; commence_time: string; completed: boolean; home_score: number | null; away_score: number | null };
type Line = { game_id: string; market: string; selection: string; point: number | null; price: number };
type TeamInfo = { abbreviation: string; short_name: string; ui_color: string | null };
type Pick = { id: string; game_id: string; market: string; selection: string; point: number | null; odds: number; stake: number; ticker: string; locked_at: string; fill_price: number | null; shares: number | null; filled_at: string | null; status: string; points: number; counted: boolean };
type Stock = { ticker: string; name: string; tier: number; avg_return_10y: number; max_drawdown: number };
type Profile = { id: string; display_name: string; streak: number; weekly_cap: number | null };
type LB = { user_id: string; display_name: string; streak: number; month: string; points: number | null; wins: number; losses: number };
type Broker = { provider: string; connected: boolean } | null;

const fmt = (n: number, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (n: number) => fmt(n, 0);
const oddsTxt = (o: number) => (o > 0 ? '+' : '') + o;
const pt = (p: number | null) => (p == null ? '' : (p > 0 ? '+' : '') + p);
const TIERS = ['Favorites', 'Value', 'Longshots'];
const LEAGUES = ['All', 'NFL', 'NCAAF', 'NBA', 'NCAAB', 'MLB', 'NHL'];
const BROKERS = [['webull', 'Webull'], ['public', 'Public'], ['moomoo', 'Moomoo']];
const month = () => new Date().toISOString().slice(0, 7);

/* ---------- data hook ---------- */
function useData(session: Session | null) {
  const [games, setGames] = useState<Game[]>([]); const [lines, setLines] = useState<Line[]>([]); const [picks, setPicks] = useState<Pick[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]); const [prices, setPrices] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile | null>(null); const [lb, setLb] = useState<LB[]>([]); const [pot, setPot] = useState(100); const [broker, setBroker] = useState<Broker>(null);
  const [teams, setTeams] = useState<Record<string, TeamInfo>>({});
  const load = useCallback(async () => {
    if (!session) return;
    const since = new Date(Date.now() - 6 * 3600e3).toISOString();
    const [g, s, p, pr, pk, l, pc, bc, tm] = await Promise.all([
      sb.from('games').select('*').gt('commence_time', since).order('commence_time').limit(400),
      sb.from('stock_lines').select('*'),
      sb.from('prices').select('ticker, price'),
      sb.from('profiles').select('*').eq('id', session.user.id).single(),
      sb.from('picks').select('*').eq('user_id', session.user.id).order('locked_at', { ascending: false }),
      sb.from('leaderboard').select('*').eq('month', month()),
      sb.from('pool_config').select('pot').eq('month', month()).maybeSingle(),
      sb.from('brokerage_connections').select('provider, connected').eq('user_id', session.user.id).maybeSingle(),
      sb.from('team_lookup').select('odds_api_name, abbreviation, short_name, ui_color'),
    ]);
    setGames(g.data ?? []); setStocks(s.data ?? []); setPrices(Object.fromEntries((p.data ?? []).map(x => [x.ticker, Number(x.price)])));
    setTeams(Object.fromEntries((tm.data ?? []).map(t => [t.odds_api_name, t as TeamInfo])));
    setProfile(pr.error ? null : (pr.data as Profile)); setPicks((pk.data ?? []) as Pick[]); setLb((l.data ?? []) as LB[]); setPot(Number(pc.data?.pot ?? 100)); setBroker(bc.data as Broker);
    const ids = (g.data ?? []).map(x => x.id);
    // Supabase caps responses at 1000 rows, so pull lines in chunks of 60 games
    const chunks: string[][] = []; for (let i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
    const lineSets = await Promise.all(chunks.map(c => sb.from('lines').select('game_id, market, selection, point, price').in('game_id', c).limit(1000)));
    setLines(lineSets.flatMap(r => (r.data ?? []) as Line[]));
    // games for my picks that fell out of the window (settled)
    const missing = (pk.data ?? []).map(x => x.game_id).filter(id => !ids.includes(id));
    if (missing.length) { const mg = await sb.from('games').select('*').in('id', missing); setGames(prev => [...prev, ...(mg.data ?? [])]); }
  }, [session]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!session) return;
    const ch = sb.channel('live').on('postgres_changes', { event: '*', schema: 'public', table: 'picks', filter: `user_id=eq.${session.user.id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, load).subscribe();
    const t = setInterval(load, 120e3);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [session, load]);
  return { games, lines, picks, stocks, prices, profile, lb, pot, broker, teams, reload: load };
}

/* ---------- app ---------- */
export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }); const { data } = sb.auth.onAuthStateChange((_, s) => setSession(s)); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return null;
  if (!session) return <Gate />;
  return <Shell session={session} />;
}

function Gate() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  const go = async () => { if (!email) return; const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); if (!error) setSent(true); };
  return <div className="gate"><div className="box">
    <div className="brand" style={{ fontSize: 28 }}>Investi<span>bet</span></div>
    <p className="hint">Sports picks where the stake buys stock you keep. Losing loses nothing.</p>
    {sent ? <p className="hint">Check your email for the sign-in link.</p> : <>
      <input placeholder="Email" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} />
      <button className="btn" onClick={go}>Send me a sign-in link</button></>}
    <div className="disc">Free, private beta. No money moves through this app. Brokerage connection is simulated during beta.</div>
  </div></div>;
}

function Shell({ session }: { session: Session }) {
  const d = useData(session); const [tab, setTab] = useState<'board' | 'picks' | 'cup' | 'home'>('board');
  const [slip, setSlip] = useState<{ game: Game; line: Line } | null>(null); const [brokerOpen, setBrokerOpen] = useState(false);
  const [toast, setToast] = useState(''); const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const gm = useMemo(() => Object.fromEntries(d.games.map(g => [g.id, g])), [d.games]);
  return <>
    <header><div className="brand">Investi<span>bet</span></div>
      <button className={'pill ' + (d.broker?.connected ? 'mint' : '')} onClick={() => setBrokerOpen(true)}>{d.broker?.connected ? `${BROKERS.find(b => b[0] === d.broker!.provider)?.[1]} connected` : 'Connect brokerage'}</button></header>
    {tab === 'board' && <Board d={d} gm={gm} onPick={(game, line) => d.broker?.connected ? setSlip({ game, line }) : setBrokerOpen(true)} />}
    {tab === 'picks' && <Picks d={d} gm={gm} say={say} />}
    {tab === 'cup' && <Cup d={d} uid={session.user.id} />}
    {tab === 'home' && <Home d={d} gm={gm} say={say} onBroker={() => setBrokerOpen(true)} />}
    <nav>
      {([['board', 'Lines', 'lines'], ['picks', 'Picks', 'picks'], ['cup', 'Cup', 'trophy'], ['home', 'Home', 'home']] as const).map(([k, l, ic]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); scrollTo(0, 0); }}><Symbol name={ic} size={24} />{l}</button>)}
    </nav>
    <button className="fb" onClick={async () => { const t = prompt('What sucked? Be blunt.'); if (!t) return; await sb.from('feedback').insert({ user_id: session.user.id, text: t.slice(0, 500), screen: tab }); say('Sent. Thanks.'); }}>What sucked?</button>
    <div className={'toast ' + (toast ? 'on' : '')}>{toast}</div>
    <Slip d={d} slip={slip} onClose={() => setSlip(null)} say={say} />
    <BrokerSheet open={brokerOpen} current={d.broker} uid={session.user.id} onClose={() => setBrokerOpen(false)} onDone={() => { d.reload(); say('Connected (simulated)'); }} />
    <Reveals d={d} gm={gm} />
  </>;
}

/* ---------- board ---------- */
const MKS: [string, string][] = [['spreads', 'Spread'], ['totals', 'Total'], ['h2h', 'ML']];
const LEAGUE_ICONS: Record<string, string> = { All: 'sportscourt', NFL: 'football', NCAAF: 'football', NBA: 'basketball', NCAAB: 'basketball', MLB: 'baseball', NHL: 'puck' };
const shortName = (t: string) => t.split(' ').slice(-1)[0];
const spoken = (n: number) => (n > 0 ? 'plus ' : 'minus ') + Math.abs(n);
// Team color sits behind a 2 or 3 letter monogram: dark ink on light colors, white on dark
const inkOn = (hex: string) => { const c = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#08130E' : '#FFFFFF'; };
// Unmapped team (alias missing): neutral disc, first three letters, mascot as short name. Never breaks a card.
const fallbackTeam = (name: string): TeamInfo => ({ abbreviation: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), short_name: shortName(name), ui_color: null });
function Mono({ t }: { t: TeamInfo }) {
  return <span className="mono" style={t.ui_color ? { background: t.ui_color, color: inkOn(t.ui_color) } : undefined} aria-hidden="true">{t.abbreviation}</span>;
}
const kickoffLabel = (k: Date) => {
  const now = new Date(); const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const day = k.toDateString() === now.toDateString() ? (k.getHours() >= 17 ? 'Tonight' : 'Today')
    : k.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : k.toLocaleDateString(undefined, { weekday: 'short' });
  return { day, time: k.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) };
};

function Board({ d, gm, onPick }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; onPick: (g: Game, l: Line) => void }) {
  const [league, setLeague] = useState('All'); const [q, setQ] = useState(''); const [propsFor, setPropsFor] = useState<string | null>(null); const [propLines, setPropLines] = useState<Line[]>([]);
  const now = Date.now();
  const query = q.trim().toLowerCase();
  const upcoming = d.games.filter(g => !g.completed && new Date(g.commence_time).getTime() > now - 4 * 3600e3);
  const list = (query ? upcoming.filter(g => `${g.away} ${g.home} ${g.league}`.toLowerCase().includes(query)) : upcoming.filter(g => league === 'All' || g.league === league)).slice(0, 60);
  const team = (name: string): TeamInfo => d.teams[name] ?? fallbackTeam(name);
  const lineFor = (g: Game, market: string, sel: string) => d.lines.find(l => l.game_id === g.id && l.market === market && l.selection === sel);
  const openProps = async (g: Game) => {
    if (propsFor === g.id) return setPropsFor(null);
    setPropsFor(g.id); setPropLines([]);
    await fetch(`${import.meta.env.VITE_ENGINE_URL ?? ''}/props/${g.sport_key}/${g.id}`).catch(() => null);
    const { data } = await sb.from('lines').select('game_id, market, selection, point, price').eq('game_id', g.id).eq('market', 'prop');
    setPropLines((data ?? []) as Line[]);
  };
  const weekStaked = d.picks.filter(p => gm[p.game_id] && sameWeek(gm[p.game_id].commence_time)).reduce((s, p) => s + Number(p.stake), 0);

  // Market grid: one row per side, Spread / Total / ML. Shared by the Tonight ticket and plain cards.
  const grid = (g: Game, locked: boolean) => {
    const mine = d.picks.filter(p => p.game_id === g.id);
    return <>
      <div className="mhead" aria-hidden="true"><span />{MKS.map(([k, l]) => <span key={k}>{l}</span>)}</div>
      {[g.away, g.home].map((name, i) => { const t = team(name); return <div className="mrow" key={name}>
        <div className="tname" title={name}><Mono t={t} /><div className="tt"><span className="ab">{t.abbreviation}</span><span className="sn">{t.short_name}</span><span className="tbar" style={t.ui_color ? { background: t.ui_color } : undefined} /></div></div>
        {MKS.map(([mk]) => {
          const sel = mk === 'totals' ? (i === 0 ? 'Over' : 'Under') : name;
          const l = lineFor(g, mk, sel);
          const has = mine.find(p => p.market === mk && p.selection === sel); const opp = mine.find(p => p.market === mk && p.selection !== sel);
          const tail = l ? `${basePoints(l.price)} points, ${spoken(l.price)}, ${Math.round(implied(l.price) * 100)} percent implied` : '';
          const label = !l ? `${mk === 'totals' ? sel : name}, no line`
            : mk === 'h2h' ? `${name}, ${tail}`
            : mk === 'spreads' ? `${name} ${spoken(l.point ?? 0)}, ${tail}`
            : `${sel} ${l.point}, ${tail}`;
          // Points lead, the line stays legible underneath: our currency up front, the sportsbook number for reference
          return <button key={mk} className={'mpill ' + (has ? 'sel' : '')} disabled={locked || !l || !!opp} aria-label={label} aria-pressed={!!has} onClick={() => l && onPick(g, l)}>
            {l ? <>
              {mk !== 'h2h' && <span className="ln">{mk === 'totals' ? `${i === 0 ? 'O' : 'U'} ${l.point}` : pt(l.point)}</span>}
              <span className="od">{basePoints(l.price)}<i className="u">pts</i></span>
              <span className="sb">{oddsTxt(l.price)} · {Math.round(implied(l.price) * 100)}%</span>
            </> : <span className="sb">—</span>}
          </button>;
        })}
      </div>; })}
    </>;
  };
  const propsUi = (g: Game, locked: boolean) => <>
    {ENABLE_PROPS && !locked && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => openProps(g)}>{propsFor === g.id ? 'Hide props' : 'Player props'}</button>}
    {propsFor === g.id && <div style={{ marginTop: 8 }}>{propLines.length ? propLines.map(l => { const [player, stat, side] = l.selection.split('|'); const has = d.picks.find(p => p.game_id === g.id && p.selection === l.selection);
      return <button key={l.selection} className={'prop ' + (has ? 'sel' : '')} onClick={() => onPick(g, l)}><div><div className="n">{player}</div><div className="s">{stat.replace(/^(player|batter|pitcher)_/, '').replace(/_/g, ' ')}</div></div><div className="s">{side} {l.point ?? ''}</div><div className="o">{oddsTxt(l.price)}</div></button>; })
      : <p className="hint">Loading props…</p>}</div>}
  </>;

  // Uniform cards under Starting soon / Upcoming / In play. No hero treatment; the sort finds tonight's game.
  const open = list.filter(g => new Date(g.commence_time).getTime() > now);
  const live = list.filter(g => new Date(g.commence_time).getTime() <= now);
  const soon = open.filter(g => new Date(g.commence_time).getTime() - now <= 90 * 60e3);
  const later = open.filter(g => new Date(g.commence_time).getTime() - now > 90 * 60e3);
  const sections: [string, Game[], boolean][] = [['Starting soon', soon, false], ['Upcoming', later, false], ['In play', live, true]];
  const labelled = sections.filter(s => s[1].length).length > 1;
  const card = (g: Game) => {
    const k = new Date(g.commence_time); const locked = k.getTime() <= now; const { day, time } = kickoffLabel(k);
    return <div key={g.id} className="game">
      <div className="when">{g.league} · {locked ? <b>In play</b> : `${day} ${time}`}</div>
      {grid(g, locked)}{propsUi(g, locked)}
    </div>;
  };

  return <section className="view">
    <div className="row"><h2 style={{ fontSize: 22 }}>Lines</h2><span className="small">{d.profile?.weekly_cap ? `${fmt0(weekStaked)} of ${fmt0(Number(d.profile.weekly_cap))} this week` : `${fmt0(weekStaked)} staked this week`}</span></div>
    <div className="chips">{LEAGUES.map(l => <button key={l} className={'chip ' + (league === l && !query ? 'on' : '')} aria-pressed={league === l && !query} onClick={() => { setLeague(l); setQ(''); }}><Symbol name={LEAGUE_ICONS[l]} size={15} />{l}</button>)}</div>
    <div className="searchbar"><Symbol name="magnifyingglass" size={16} /><input className="search" placeholder="Search team or matchup" aria-label="Search team or matchup" value={q} onChange={e => setQ(e.target.value)} /></div>
    {!upcoming.length && <div className="card"><div style={{ fontWeight: 700 }}>No lines yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Lines refresh every few hours. If this is a fresh install, the engine is still pulling the first slate.</p></div>}
    {query && upcoming.length > 0 && !list.length && <div className="card"><div style={{ fontWeight: 700 }}>No games match "{q.trim()}"</div><p className="hint" style={{ margin: '6px 0 0' }}>Try the team name or city, or clear the search.</p></div>}
    {sections.map(([label, items, isLive]) => items.length ? <div key={label}>
      {labelled && <div className="divider">{isLive && <span className="dot" />}{label}</div>}
      {items.map(card)}
    </div> : null)}
    <div className="disc">Lines come from one major sportsbook via public scoreboard data, refreshed hourly. Odds lock the moment you tap Lock. Team names identify games and are trademarks of their owners. Investibet is not affiliated with any league or team.</div>
  </section>;
}
const sameWeek = (iso: string) => { const a = new Date(iso), b = new Date(); const wk = (x: Date) => { const d = new Date(x); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; return wk(a) === wk(b); };

/* ---------- slip ---------- */
function Slip({ d, slip, onClose, say }: { d: ReturnType<typeof useData>; slip: { game: Game; line: Line } | null; onClose: () => void; say: (m: string) => void }) {
  const [stake, setStake] = useState(() => Number(localStorage.getItem('ib_stake')) || 20); const [ticker, setTicker] = useState<string | null>(null);
  const [tier, setTier] = useState(0); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (slip) { setTicker(null); setQ(''); setTier(0); } }, [slip]);
  if (!slip) return <><div className="scrim" /><div className="sheet" /></>;
  const { game, line } = slip; const s = d.stocks.find(x => x.ticker === ticker);
  const label = line.market === 'prop' ? line.selection.split('|')[0] + ' ' + line.selection.split('|')[2] + ' ' + (line.point ?? '') : line.selection + (line.market === 'h2h' ? '' : ' ' + pt(line.point));
  const list = d.stocks.filter(x => q ? x.ticker.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()) : x.tier === tier).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const lock = async () => {
    if (!ticker) return; setBusy(true); localStorage.setItem('ib_stake', String(stake));
    const { error } = await sb.rpc('lock_pick', { p_game_id: game.id, p_market: line.market, p_selection: line.selection, p_stake: stake, p_ticker: ticker });
    setBusy(false); if (error) return say(error.message.replace(/^.*?: /, ''));
    navigator.vibrate?.(30); say(marketOpen(new Date()) ? `Locked. Buying ${ticker} now` : `Locked. ${ticker} buys at next market open`); onClose(); d.reload();
  };
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    <div className="slip-head"><div className="t">{label}</div><div className="o">{oddsTxt(line.price)}</div></div>
    <div className="small">{game.away} at {game.home} · {Math.round(implied(line.price) * 100)}% implied · {basePoints(line.price)} pts if it hits</div>
    <div className="stake">{fmt0(stake)}</div>
    <input type="range" min={5} max={100} step={5} value={stake} onChange={e => setStake(+e.target.value)} aria-label="Stake" />
    <div className="trio"><div><div className="l">Win</div><div className="v mint">{basePoints(line.price)} pts</div></div><div><div className="l">Lose</div><div className="v gold">keep {fmt0(stake)}</div></div><div><div className="l">In 5 years</div><div className="v">{s ? '~' + fmt0(project(stake, s.avg_return_10y, 5)) : 'pick a stock'}</div></div></div>
    <div style={{ fontWeight: 700, marginBottom: 6 }}>What does it buy?</div>
    <div className="chips">{TIERS.map((t, i) => <button key={t} className={'chip ' + (tier === i && !q ? 'on' : '')} onClick={() => { setTier(i); setQ(''); }}>{t}</button>)}</div>
    <input className="search" placeholder="Search tickers" value={q} onChange={e => setQ(e.target.value)} />
    {list.map(x => <button key={x.ticker} className={'srow ' + (ticker === x.ticker ? 'sel' : '')} onClick={() => setTicker(x.ticker)}><div className="tk">{x.ticker}</div><div className="nm">{x.name}</div><div><div className="ln">+{x.avg_return_10y}%/yr</div><div className="dd">worst drop {x.max_drawdown}%</div></div></button>)}
    <div style={{ height: 12 }} />
    <button className="btn" disabled={!ticker || busy} onClick={lock}>{busy ? 'Locking…' : ticker ? `Lock ${fmt0(stake)} on ${line.selection.split('|')[0]} → ${ticker}` : 'Pick a stock to lock'}</button>
    <div className="disc">Odds lock now. During beta the buy is simulated at the next market price. Lines are approximate 10-year averages and worst peak-to-trough drops. Not advice.</div>
  </div></>;
}

/* ---------- brokerage (simulated) ---------- */
function BrokerSheet({ open, current, uid, onClose, onDone }: { open: boolean; current: Broker; uid: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'pick' | 'auth'>('pick'); const [prov, setProv] = useState(current?.provider ?? 'webull');
  const connect = async () => { await sb.from('brokerage_connections').upsert({ user_id: uid, provider: prov, connected: true, simulated: true }); setStep('pick'); onDone(); onClose(); };
  return <><div className={'scrim ' + (open ? 'open' : '')} onClick={onClose} /><div className={'sheet ' + (open ? 'open' : '')}>
    <div className="grab" />
    {step === 'pick' ? <>
      <h3 style={{ fontSize: 20 }}>Connect your brokerage</h3>
      <p className="hint">Your stakes buy stock in an account you own. Investibet is read-only and never moves money.</p>
      <div className="broker">{BROKERS.map(([k, n]) => <button key={k} className={prov === k ? 'on' : ''} onClick={() => setProv(k)}><span>{n}</span><span className="small">{current?.provider === k && current.connected ? 'connected' : 'supports instant buys'}</span></button>)}</div>
      <div style={{ height: 12 }} /><button className="btn" onClick={() => setStep('auth')}>Continue with {BROKERS.find(b => b[0] === prov)?.[1]}</button>
      <div className="disc">Beta: the connection is simulated. No credentials are collected and no orders are placed. Real connections arrive with the public launch via SnapTrade.</div>
    </> : <>
      <h3 style={{ fontSize: 20 }}>{BROKERS.find(b => b[0] === prov)?.[1]} sign-in</h3>
      <p className="hint">In production this opens the broker's own secure login. For the beta, tap Authorize to simulate a connected, funded account.</p>
      <div className="card"><div className="row"><span>Account</span><span className="small">Individual · simulated</span></div><div className="row" style={{ marginTop: 8 }}><span>Permissions</span><span className="small">Read holdings · place buys</span></div></div>
      <button className="btn" onClick={connect}>Authorize</button><div style={{ height: 8 }} /><button className="btn ghost" onClick={() => setStep('pick')}>Back</button>
    </>}
  </div></>;
}

/* ---------- picks ---------- */
function Picks({ d, gm, say }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; say: (m: string) => void }) {
  const [arm, setArm] = useState<string | null>(null);
  const cancel = async (p: Pick) => {
    if (arm !== p.id) { setArm(p.id); setTimeout(() => setArm(a => (a === p.id ? null : a)), 3000); return; }
    setArm(null);
    const { error } = await sb.rpc('cancel_pick', { p_pick_id: p.id });
    say(error ? error.message.replace(/^.*?: /, '') : 'Pick cancelled');
    if (!error) d.reload();
  };
  const list = d.picks.filter(p => gm[p.game_id]);
  if (!list.length) return <section className="view"><h2 style={{ fontSize: 22 }}>Your picks</h2><div className="card"><div style={{ fontWeight: 700 }}>No picks yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Head to Lines and back a side.</p></div></section>;
  return <section className="view"><h2 style={{ fontSize: 22 }}>Your picks</h2><p className="hint">Every stake is stock you own. Points land when the game goes final.</p>
    {list.map(p => { const g = gm[p.game_id]; const won = p.status === 'won', lost = p.status === 'lost'; const live = p.status === 'pending' && new Date(g.commence_time) <= new Date();
      const label = p.market === 'prop' ? p.selection.split('|')[0] + ' ' + p.selection.split('|')[2] + ' ' + (p.point ?? '') : p.selection + (p.market === 'h2h' ? '' : ' ' + pt(p.point));
      const val = p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : null;
      return <div key={p.id} className={'pick ' + (won ? 'won' : lost ? 'lost' : '')}>
        <div className="row"><div><div className="side">{label} {oddsTxt(p.odds)}</div><div className="meta">{g.away} at {g.home}{g.completed ? ` · ${g.away_score}-${g.home_score}` : ''}</div></div>
          {p.status === 'pending' ? <span className="res">{live ? 'Live' : 'Pending'}</span> : won ? <span className="res w">Won · {Math.round(p.points)} pts</span> : lost ? <span className="res l">Missed</span> : <span className="res p">{p.status === 'push' ? 'Push' : 'Void'}</span>}</div>
        <div className="meta" style={{ marginTop: 10 }}>{p.filled_at ? `Bought ${Number(p.shares).toFixed(4)} ${p.ticker} at ${fmt(Number(p.fill_price))}${val != null ? ` · now ${fmt(val)}` : ''}` : `${fmt0(Number(p.stake))} of ${p.ticker} · buys at next market open`}</div>
        {p.status === 'pending' && !live && <button className="btn danger sm" style={{ marginTop: 10 }} onClick={() => cancel(p)}>{arm === p.id ? 'Tap again to cancel' : 'Cancel pick'}</button>}
      </div>; })}
  </section>;
}

/* ---------- cup ---------- */
function Cup({ d, uid }: { d: ReturnType<typeof useData>; uid: string }) {
  const rows = d.lb.map(r => ({ id: r.user_id, points: Number(r.points ?? 0) })); const split = potSplit(rows, d.pot);
  const sorted = [...d.lb].sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0)); const mine = split[uid] ?? 0;
  return <section className="view"><h2 style={{ fontSize: 22 }}>The Cup</h2>
    <div className="pot"><div className="row"><span className="small">Monthly pot</span><span className="small">{new Date(month() + '-02').toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span></div>
      <div className="big">{fmt0(d.pot)}</div>
      {rows.some(r => r.id === uid) && <div className="hint" style={{ margin: '6px 0 0' }}>You hold <b className="mint">{(d.pot ? mine / d.pot * 100 : 0).toFixed(1)}%</b> of the pot right now: <b className="mint">{fmt(mine)}</b></div>}
      <div className="small" style={{ marginTop: 8 }}>60% split by points, 40% to the top 10. Points are the odds you hit, stake never matters. Best 15 picks a week count.</div></div>
    {sorted.length ? sorted.map((r, i) => <div key={r.user_id} className={'lrow ' + (r.user_id === uid ? 'me' : '')}><div className="rk">{i + 1}</div><div className="nm">{r.display_name} {r.streak >= 3 && <span className="flame"><Symbol name="flame" size={12} />{r.streak}</span>}</div><div className="pt">{Math.round(Number(r.points ?? 0))}</div><div className="sh">{fmt0(split[r.user_id] ?? 0)}</div></div>) : <p className="hint">Nobody has settled a pick this month yet.</p>}
  </section>;
}

/* ---------- home ---------- */
function Home({ d, gm, say, onBroker }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; say: (m: string) => void; onBroker: () => void }) {
  const mine = d.picks.filter(p => gm[p.game_id]);
  const invested = mine.reduce((s, p) => s + Number(p.stake), 0);
  const value = mine.reduce((s, p) => s + (p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : Number(p.stake)), 0);
  const settled = mine.filter(p => p.status !== 'pending'); const book = settled.reduce((s, p) => s + counterfactualDelta(Number(p.stake), p.odds, p.status as any), 0);
  const proj = (y: number) => mine.reduce((s, p) => s + project(Number(p.stake), d.stocks.find(x => x.ticker === p.ticker)?.avg_return_10y ?? 10, y), 0);
  const wins = mine.filter(p => p.status === 'won').length, losses = mine.filter(p => p.status === 'lost').length;
  const saveCap = async (v: string) => { await sb.from('profiles').update({ weekly_cap: v ? Number(v) : null }).eq('id', d.profile!.id); say(v ? 'Cap set' : 'Cap removed'); d.reload(); };
  return <section className="view">
    <div className="hero"><div className="small">Hey {d.profile?.display_name}</div><h1>{settled.length && book < value ? `You own ${fmt0(value)}. A sportsbook would have left you ${fmt0(book)}.` : 'Two timelines. Same picks.'}</h1></div>
    <div className="tl"><div className="you"><div className="l">You own</div><div className="v">{fmt0(value)}</div><div className="s">{fmt0(invested)} staked across {mine.length} picks</div></div><div className="book"><div className="l">Sportsbook timeline</div><div className="v">{fmt0(book)}</div><div className="s">{settled.length ? `after ${settled.length} settled picks` : 'nothing settled yet'}</div></div></div>
    <div className="card"><div className="small" style={{ marginBottom: 8 }}>If these holdings grew at their 10-year averages</div>
      <div className="ladder"><div><div className="l">1 yr</div><div className="v">{fmt0(proj(1))}</div></div><div><div className="l">5 yr</div><div className="v">{fmt0(proj(5))}</div></div><div><div className="l">10 yr</div><div className="v">{fmt0(proj(10))}</div></div></div>
      <div className="disc">Hypothetical. Uses each ticker's approximate 10-year average annual return. Past returns do not predict future results. Nothing here is investment advice.</div></div>
    <div className="card"><div className="row"><div><div style={{ fontWeight: 700 }}>This month</div><div className="small">{wins}-{losses} · streak {d.profile?.streak ?? 0}</div></div><div style={{ fontWeight: 700, fontSize: 22 }}>{Math.round(mine.filter(p => p.counted).reduce((s, p) => s + Number(p.points), 0))} pts</div></div></div>
    <div className="card"><div className="row"><div><div style={{ fontWeight: 700 }}>Brokerage</div><div className="small">{d.broker?.connected ? `${BROKERS.find(b => b[0] === d.broker!.provider)?.[1]} · simulated during beta` : 'Not connected'}</div></div><button className="btn ghost sm" onClick={onBroker}>{d.broker?.connected ? 'Change' : 'Connect'}</button></div></div>
    <div className="card"><div className="row"><div><div style={{ fontWeight: 700 }}>Weekly stake cap</div><div className="small">Your own limit. The app enforces it.</div></div><input type="number" min={0} step={5} defaultValue={d.profile?.weekly_cap ?? ''} onBlur={e => saveCap(e.target.value)} style={{ width: 90, padding: 10, minHeight: 44, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--line)', outline: 'none' }} aria-label="Weekly cap" /></div></div>
    <button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
    <div className="disc">Investibet never holds your money, never places trades for you, and never recommends a stock. Lines shown are informational. Free, private, invite-only beta.</div>
  </section>;
}

/* ---------- reveals ---------- */
function Reveals({ d, gm }: { d: ReturnType<typeof useData>; gm: Record<string, Game> }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('ib_seen') || '[]'))); const [cur, setCur] = useState<Pick | null>(null); const [phase, setPhase] = useState<'wait' | 'show'>('wait');
  const queue = d.picks.filter(p => p.status !== 'pending' && !seen.has(p.id) && gm[p.game_id]);
  useEffect(() => { if (!cur && queue.length) { setCur(queue[0]); setPhase('wait'); } }, [queue.length, cur]);
  // The timer gets its own effect: keyed on the queue it was cancelled by its own state update, leaving the reveal stuck on "Final…"
  useEffect(() => { if (!cur || phase !== 'wait') return; const t = setTimeout(() => { setPhase('show'); navigator.vibrate?.([30, 40, 60]); }, 1300); return () => clearTimeout(t); }, [cur, phase]);
  if (!cur) return null;
  const g = gm[cur.game_id]; const won = cur.status === 'won', push = cur.status === 'push' || cur.status === 'void';
  const label = cur.market === 'prop' ? cur.selection.split('|')[0] : cur.selection + (cur.market === 'h2h' ? '' : ' ' + pt(cur.point));
  const next = () => { const s = new Set(seen); s.add(cur.id); localStorage.setItem('ib_seen', JSON.stringify([...s])); setSeen(s); setCur(null); };
  return <div className="reveal" onClick={() => phase === 'wait' && setPhase('show')}><div className={'card2 ' + (phase === 'wait' ? 'shimmer' : 'pop ' + (won ? 'win' : ''))}>
    {phase === 'wait' ? <><p>{g.away} at {g.home}</p><div className="big">{label}</div><p>{oddsTxt(cur.odds)} · {fmt0(Number(cur.stake))} of {cur.ticker}</p><p style={{ marginTop: 14 }}>Final…</p></>
      : push ? <><p>{label} {oddsTxt(cur.odds)}</p><div className="big gold">Push</div><p>No points, streak intact. You still own {fmt0(Number(cur.stake))} of {cur.ticker}.</p></>
      : won ? <><p>{label} {oddsTxt(cur.odds)}</p><div className="big mint">+{Math.round(cur.points)} pts</div>{(d.profile?.streak ?? 0) >= 3 && <p className="gold" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Symbol name="flame" size={14} />{d.profile!.streak} straight · {d.profile!.streak >= 5 ? '2x' : '1.5x'} points</p>}<p>And you still own {fmt0(Number(cur.stake))} of {cur.ticker}.</p></>
      : <><p>{label} {oddsTxt(cur.odds)}</p><div className="big" style={{ color: 'var(--muted)' }}>Missed</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, textAlign: 'left' }}><div style={{ background: 'var(--coral2)', borderRadius: 12, padding: 10 }}><div className="small">Sportsbook timeline</div><div className="coral" style={{ fontWeight: 700, fontSize: 20 }}>-{fmt0(Number(cur.stake))}</div></div><div style={{ background: 'var(--mint2)', borderRadius: 12, padding: 10 }}><div className="small">Your timeline</div><div className="mint" style={{ fontWeight: 700, fontSize: 18 }}>own {fmt0(Number(cur.stake))} of {cur.ticker}</div></div></div>
        <p style={{ marginTop: 12 }}>Streak resets. The money didn't go anywhere.</p></>}
  </div>{phase === 'show' && <><div style={{ height: 16 }} /><button className="btn" style={{ maxWidth: 380 }} onClick={next}>{queue.length > 1 ? 'Next result' : 'Done'}</button></>}</div>;
}
