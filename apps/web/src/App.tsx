import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, ENABLE_PROPS } from './lib/supabase';
import Symbol from './Symbol';
import { implied, basePoints, potSplit, project, marketOpen, stackOdds, stackPoints, bookValue, counterfactualDelta } from '@investibet/core';

/* ---------- types ---------- */
type Game = { id: string; sport_key: string; league: string; home: string; away: string; commence_time: string; completed: boolean; home_score: number | null; away_score: number | null };
type Line = { game_id: string; market: string; selection: string; point: number | null; price: number };
type TeamInfo = { abbreviation: string; short_name: string; ui_color: string | null };
type Pick = { id: string; game_id: string; market: string; selection: string; point: number | null; odds: number; stake: number; ticker: string; locked_at: string; fill_price: number | null; shares: number | null; filled_at: string | null; status: string; points: number; counted: boolean };
type Stock = { ticker: string; name: string; tier: number; avg_return_10y: number; max_drawdown: number };
type Profile = { id: string; display_name: string; streak: number; weekly_cap: number | null };
type LB = { user_id: string; display_name: string; streak: number; month: string; points: number | null; wins: number; losses: number };
type Broker = { provider: string; connected: boolean } | null;
type Leg = { game: Game; line: Line };

const fmt = (n: number, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (n: number) => fmt(n, 0);
const oddsTxt = (o: number) => (o > 0 ? '+' : '') + o;
const pt = (p: number | null) => (p == null ? '' : (p > 0 ? '+' : '') + p);
const TIERS = ['Favorites', 'Value', 'Longshots'];
const LEAGUES = ['All', 'NFL', 'NCAAF', 'NBA', 'NCAAB', 'MLB', 'NHL'];
const BROKERS = [['webull', 'Webull'], ['public', 'Public'], ['moomoo', 'Moomoo']];
const month = () => new Date().toISOString().slice(0, 7);
const legKey = (l: Line) => [l.game_id, l.market, l.selection, l.point].join('|');
const MARKET_LABEL: Record<string, string> = { h2h: 'Winner', spreads: 'Spread', totals: 'Total', prop: 'Prop' };
const legLabel = (l: { market: string; selection: string; point: number | null }) =>
  l.market === 'prop' ? l.selection.split('|')[0] + ' ' + l.selection.split('|')[2] + ' ' + (l.point ?? '') : l.selection + (l.market === 'h2h' ? '' : ' ' + pt(l.point));
const initialsOf = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

/* ---------- rolling number: live values roll on change, still numbers under reduced motion ---------- */
function Roll({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [disp, setDisp] = useState(value); const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value; prev.current = value;
    if (from === to) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisp(to); return; }
    const t0 = performance.now(), dur = 600; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); setDisp(from + (to - from) * e); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(disp)}</>;
}

/* ---------- line chart: inline SVG, one axis, 2px lines, tap a column to read the values ---------- */
function LineChart({ series, n, active, onActive, xLabels, label }: {
  series: { color: string; vals: number[]; dash?: boolean; area?: boolean }[]; n: number;
  active: number; onActive: (i: number) => void; xLabels: [string, string]; label: string;
}) {
  const W = 340, H = 150, L = 8, R = 8, T = 12, B = 22;
  const max = Math.max(1, ...series.flatMap(s => s.vals)) * 1.06;
  const x = (i: number) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : 0);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const pts = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const colW = (W - L - R) / Math.max(1, n - 1);
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', touchAction: 'pan-y' }}>
    {[0.25, 0.5, 0.75].map(f => <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="var(--line)" strokeWidth="1" />)}
    <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1.5" />
    {series.map((s, si) => <g key={si}>
      {s.area && <polygon points={`${x(0)},${y(0)} ${pts(s.vals)} ${x(n - 1)},${y(0)}`} fill={s.color} opacity="0.08" />}
      <polyline points={pts(s.vals)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? '5 4' : undefined} />
      <circle cx={x(active)} cy={y(s.vals[active])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
    </g>)}
    {Array.from({ length: n }, (_, i) => <rect key={i} x={x(i) - colW / 2} y={0} width={colW} height={H} fill="transparent" onPointerDown={() => onActive(i)} onPointerEnter={() => onActive(i)} />)}
    <text x={L} y={H - 6} fontSize="10" fill="var(--dim)">{xLabels[0]}</text>
    <text x={W - R} y={H - 6} fontSize="10" fill="var(--dim)" textAnchor="end">{xLabels[1]}</text>
  </svg>;
}

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

/* ---------- shell: 5-tab floating pill nav, selection cart, slip ---------- */
type Tab = 'home' | 'picks' | 'cup' | 'owned' | 'profile';
const TABS: [Tab, string, string][] = [['home', 'Home', 'home'], ['picks', 'Picks', 'ticket'], ['cup', 'The Cup', 'trophy'], ['owned', 'Owned', 'chart']];

function Shell({ session }: { session: Session }) {
  const d = useData(session); const [tab, setTab] = useState<Tab>('home');
  const [cart, setCart] = useState<Leg[]>([]); const [slipOpen, setSlipOpen] = useState(false); const [brokerOpen, setBrokerOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState<string | null>(null);
  const [stake, setStake] = useState(() => Number(localStorage.getItem('ib_stake')) || 20);
  const [toast, setToast] = useState(''); const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const gm = useMemo(() => Object.fromEntries(d.games.map(g => [g.id, g])), [d.games]);

  const toggleLeg = (game: Game, line: Line) => {
    const k = legKey(line);
    if (cart.some(x => legKey(x.line) === k)) {
      const next = cart.filter(x => legKey(x.line) !== k);
      setCart(next); if (!next.length) setSlipOpen(false);
      return;
    }
    // picking the other side of a market you already selected swaps the leg
    const base = cart.filter(x => !(x.line.game_id === line.game_id && x.line.market === line.market));
    if (base.length >= 6) return say('Six legs is the max');
    setCart([...base, { game, line }]);
  };
  const removeLeg = (i: number) => { const next = cart.filter((_, j) => j !== i); setCart(next); if (!next.length) setSlipOpen(false); };
  const pts = cart.length ? stackPoints(cart.map(x => x.line.price)) : 0;

  return <>
    {tab === 'home' && <header><div className="brand">Investi<span>bet</span></div></header>}
    {tab === 'home' && <Home d={d} uid={session.user.id} cart={cart} onToggle={toggleLeg} onCup={() => setTab('cup')} onStock={setStockOpen} />}
    {tab === 'picks' && <Picks d={d} gm={gm} say={say} />}
    {tab === 'cup' && <Cup d={d} uid={session.user.id} />}
    {tab === 'owned' && <Owned d={d} gm={gm} onStock={setStockOpen} />}
    {tab === 'profile' && <ProfileTab d={d} gm={gm} say={say} onBroker={() => setBrokerOpen(true)} />}
    {cart.length > 0 && !slipOpen && <button className="selbar" onClick={() => setSlipOpen(true)}>
      <span className="n">{cart.length} {cart.length === 1 ? 'pick' : 'picks'}</span>
      <span className="e">{fmt0(stake)} stake earns <b><Roll value={pts} /> pts</b></span>
    </button>}
    <nav>
      {TABS.map(([k, l, ic]) => <button key={k} className={tab === k ? 'on' : ''} aria-label={l} onClick={() => { setTab(k); scrollTo(0, 0); }}><Symbol name={ic} size={22} />{l}</button>)}
      <button className={tab === 'profile' ? 'on' : ''} aria-label="Profile" onClick={() => { setTab('profile'); scrollTo(0, 0); }}>
        <span className="avatar">{initialsOf(d.profile?.display_name ?? 'You')}{!d.broker?.connected && <i className="dot" />}</span>Profile
      </button>
    </nav>
    {!cart.length && <button className="fb" onClick={async () => { const t = prompt('What sucked? Be blunt.'); if (!t) return; await sb.from('feedback').insert({ user_id: session.user.id, text: t.slice(0, 500), screen: tab }); say('Sent. Thanks.'); }}>What sucked?</button>}
    <div className={'toast ' + (toast ? 'on' : '')}>{toast}</div>
    <Slip d={d} legs={slipOpen ? cart : []} stake={stake} setStake={setStake} onRemove={removeLeg} onClose={() => setSlipOpen(false)} say={say}
      brokerConnected={!!d.broker?.connected} onNeedBroker={() => setBrokerOpen(true)}
      onLocked={() => { setCart([]); setSlipOpen(false); d.reload(); }} />
    <BrokerSheet open={brokerOpen} current={d.broker} uid={session.user.id} onClose={() => setBrokerOpen(false)} onDone={() => { d.reload(); say('Connected (simulated)'); }} />
    <StockSheet ticker={stockOpen} d={d} gm={gm} onClose={() => setStockOpen(null)} />
    <Reveals d={d} gm={gm} />
  </>;
}

/* ---------- board helpers ---------- */
const MKS: [string, string][] = [['spreads', 'Spread'], ['totals', 'Total'], ['h2h', 'Winner']];
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
const sameWeek = (iso: string) => { const a = new Date(iso), b = new Date(); const wk = (x: Date) => { const d = new Date(x); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; return wk(a) === wk(b); };
const ownedValue = (picks: Pick[], prices: Record<string, number>) =>
  picks.reduce((s, p) => s + (p.shares && prices[p.ticker] ? Number(p.shares) * prices[p.ticker] : Number(p.stake)), 0);

/* ---------- home: chrome, hero, promo, league-grouped board ---------- */
function Home({ d, uid, cart, onToggle, onCup, onStock }: { d: ReturnType<typeof useData>; uid: string; cart: Leg[]; onToggle: (g: Game, l: Line) => void; onCup: () => void; onStock: (t: string) => void }) {
  const [league, setLeague] = useState('All'); const [filter, setFilter] = useState<'trending' | 'live'>('trending'); const [q, setQ] = useState('');
  const [propsFor, setPropsFor] = useState<string | null>(null); const [propLines, setPropLines] = useState<Line[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const gm = useMemo(() => Object.fromEntries(d.games.map(g => [g.id, g])), [d.games]);
  const now = Date.now();
  const query = q.trim().toLowerCase();
  const upcoming = d.games.filter(g => !g.completed && new Date(g.commence_time).getTime() > now - 4 * 3600e3);
  const live = upcoming.filter(g => new Date(g.commence_time).getTime() <= now);
  const pool = filter === 'live' ? live : upcoming;
  const list = query ? upcoming.filter(g => `${g.away} ${g.home} ${g.league}`.toLowerCase().includes(query)) : pool;
  const team = (name: string): TeamInfo => d.teams[name] ?? fallbackTeam(name);
  const lineFor = (g: Game, market: string, sel: string) => d.lines.find(l => l.game_id === g.id && l.market === market && l.selection === sel);
  const openProps = async (g: Game) => {
    if (propsFor === g.id) return setPropsFor(null);
    setPropsFor(g.id); setPropLines([]);
    await fetch(`${import.meta.env.VITE_ENGINE_URL ?? ''}/props/${g.sport_key}/${g.id}`).catch(() => null);
    const { data } = await sb.from('lines').select('game_id, market, selection, point, price').eq('game_id', g.id).eq('market', 'prop');
    setPropLines((data ?? []) as Line[]);
  };

  const mine = d.picks.filter(p => gm[p.game_id]);
  const value = ownedValue(mine, d.prices);
  const book = bookValue(mine.map(p => ({ stake: Number(p.stake), odds: p.odds, status: p.status as any })));
  const weekStaked = mine.filter(p => gm[p.game_id] && sameWeek(gm[p.game_id].commence_time)).reduce((s, p) => s + Number(p.stake), 0);
  const streak = d.profile?.streak ?? 0;
  const stockHits = query ? d.stocks.filter(x => x.ticker.toLowerCase().includes(query) || x.name.toLowerCase().includes(query)).slice(0, 5) : [];

  // Market grid: one row per side, Spread / Total / Winner, points leading every pill
  const grid = (g: Game, locked: boolean) => {
    const myPicks = d.picks.filter(p => p.game_id === g.id);
    return <>
      <div className="mhead" aria-hidden="true"><span />{MKS.map(([k, l]) => <span key={k}>{l}</span>)}</div>
      {[g.away, g.home].map((name, i) => { const t = team(name); return <div className="mrow" key={name}>
        <div className="tname" title={name}><Mono t={t} /><div className="tt"><span className="ab">{t.abbreviation}</span><span className="sn">{t.short_name}</span><span className="tbar" style={t.ui_color ? { background: t.ui_color } : undefined} /></div></div>
        {MKS.map(([mk]) => {
          const sel = mk === 'totals' ? (i === 0 ? 'Over' : 'Under') : name;
          const l = lineFor(g, mk, sel);
          const has = myPicks.find(p => p.market === mk && p.selection === sel); const opp = myPicks.find(p => p.market === mk && p.selection !== sel);
          const inCart = !!l && cart.some(x => legKey(x.line) === legKey(l));
          const tail = l ? `${basePoints(l.price)} points, ${spoken(l.price)}, ${Math.round(implied(l.price) * 100)} percent implied` : '';
          const label = !l ? `${mk === 'totals' ? sel : name}, no line`
            : mk === 'h2h' ? `${name}, ${tail}`
            : mk === 'spreads' ? `${name} ${spoken(l.point ?? 0)}, ${tail}`
            : `${sel} ${l.point}, ${tail}`;
          return <button key={mk} className={'mpill ' + (inCart ? 'sel' : has ? 'locked' : '')} disabled={locked || !l || !!has || !!opp} aria-label={label} aria-pressed={inCart} onClick={e => { e.stopPropagation(); if (l) onToggle(g, l); }}>
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
    {ENABLE_PROPS && !locked && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={e => { e.stopPropagation(); openProps(g); }}>{propsFor === g.id ? 'Hide props' : 'Player props'}</button>}
    {propsFor === g.id && <div style={{ marginTop: 8 }}>{propLines.length ? propLines.map(l => { const [player, stat, side] = l.selection.split('|'); const inCart = cart.some(x => legKey(x.line) === legKey(l));
      return <button key={l.selection} className={'prop ' + (inCart ? 'sel' : '')} onClick={e => { e.stopPropagation(); onToggle(g, l); }}><div><div className="n">{player}</div><div className="s">{stat.replace(/^(player|batter|pitcher)_/, '').replace(/_/g, ' ')}</div></div><div className="s">{side} {l.point ?? ''}</div><div className="o">{oddsTxt(l.price)}</div></button>; })
      : <p className="hint">Loading props…</p>}</div>}
  </>;

  const card = (g: Game) => {
    const k = new Date(g.commence_time); const locked = k.getTime() <= now; const { day, time } = kickoffLabel(k);
    return <div key={g.id} className="game tap" onClick={() => { setOpenId(g.id); scrollTo(0, 0); }}>
      {grid(g, locked)}{propsUi(g, locked)}
      <div className="kick"><Symbol name="calendar" size={13} />{locked ? <b>In play</b> : `${day}, ${time}`}<span className="more-lines">More<Symbol name="chevron" size={12} /></span></div>
    </div>;
  };

  // Game page: back arrow, centered matchup, Popular grid, props. Hard Rock's game screen, our markets.
  const openGame = openId ? d.games.find(g => g.id === openId) : null;
  if (openGame) {
    const g = openGame;
    const k = new Date(g.commence_time); const locked = g.completed || k.getTime() <= now; const { day, time } = kickoffLabel(k);
    return <section className="view">
      <button className="back" aria-label="Back to the board" onClick={() => setOpenId(null)}><Symbol name="arrowleft" size={20} /></button>
      <div className="gp-title"><span>{team(g.away).short_name}</span><span className="at">@</span><span>{team(g.home).short_name}</span></div>
      <div className="gp-kick"><Symbol name="calendar" size={13} />{g.completed ? `Final · ${g.away_score}-${g.home_score}` : locked ? <b>In play</b> : `${day}, ${time}`}<span>· {g.league}</span></div>
      <div className="gp-sec">Popular</div>
      <div className="game">{grid(g, locked)}</div>
      {ENABLE_PROPS && !locked && <><div className="gp-sec">Player props</div><div className="game">{propsUi(g, locked)}</div></>}
      <div className="disc">Alternate spread ladders, totals ladders and featured Stacks arrive when the lines source carries them. Odds lock the moment you tap Lock. Not affiliated with any league or team.</div>
    </section>;
  }

  // League sections, Hard Rock pattern: header with sport icon, capped list, View more lines
  const CAP = 4;
  const sections: [string, Game[]][] = (league === 'All' ? LEAGUES.slice(1) : [league])
    .map(lg => [lg, list.filter(g => g.league === lg)] as [string, Game[]])
    .filter(([, gs]) => gs.length > 0);

  return <section className="view">
    <div className="searchbar"><Symbol name="magnifyingglass" size={16} /><input className="search" placeholder="Find a game or stock" aria-label="Find a game or stock" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="chips">
      <button className={'chip ' + (league === 'All' && filter === 'trending' && !query ? 'on' : '')} aria-label="All sports" onClick={() => { setLeague('All'); setFilter('trending'); setQ(''); }}><Symbol name="sportscourt" size={15} /></button>
      <button className={'chip ' + (filter === 'trending' && !query ? 'on' : '')} aria-pressed={filter === 'trending'} onClick={() => { setFilter('trending'); setQ(''); }}><Symbol name="chart" size={15} />Trending</button>
      <button className={'chip ' + (filter === 'live' && !query ? 'on' : '')} aria-pressed={filter === 'live'} onClick={() => { setFilter('live'); setQ(''); }}><Symbol name="live" size={15} />Live{live.length ? ` · ${live.length}` : ''}</button>
    </div>
    <div className="chips">{LEAGUES.slice(1).map(l => <button key={l} className={'chip ' + (league === l && !query ? 'on' : '')} aria-pressed={league === l && !query} onClick={() => { setLeague(league === l ? 'All' : l); setQ(''); }}><Symbol name={LEAGUE_ICONS[l]} size={15} />{l}</button>)}</div>

    <div className="hero2">
      <div className="hx">
        <div className="l">You own</div>
        <div className="v"><Roll value={value} format={fmt0} /></div>
        {mine.length ? <div className="b">A sportsbook timeline would be <b>{fmt0(book)}</b></div>
          : <div className="b muted">Back a pick. The stake buys stock you keep either way.</div>}
        <div className="s">{d.profile?.weekly_cap ? `${fmt0(weekStaked)} of ${fmt0(Number(d.profile.weekly_cap))} staked this week` : `${fmt0(weekStaked)} staked this week`}</div>
      </div>
      <div className={'flamebox ' + (streak >= 3 ? 'hot' : '')} aria-label={`Streak ${streak}`}><Symbol name="flame" size={22} /><span>{streak}</span></div>
    </div>

    <Promo d={d} uid={uid} invested={mine.reduce((s, p) => s + Number(p.stake), 0)} onCup={onCup} />

    {!upcoming.length && <div className="card"><div style={{ fontWeight: 700 }}>No lines yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Lines refresh every few hours. If this is a fresh install, the engine is still pulling the first slate.</p></div>}
    {query && !list.length && !stockHits.length && <div className="card"><div style={{ fontWeight: 700 }}>Nothing matches "{q.trim()}"</div><p className="hint" style={{ margin: '6px 0 0' }}>Try the team name, city, or a ticker, or clear the search.</p></div>}
    {filter === 'live' && !query && !live.length && <div className="card"><div style={{ fontWeight: 700 }}>Nothing in play right now</div><p className="hint" style={{ margin: '6px 0 0' }}>Check Trending for what starts next.</p></div>}

    {sections.map(([lg, gs]) => <div key={lg}>
      <div className="lg-head"><Symbol name={LEAGUE_ICONS[lg]} size={16} /><h3>{lg}</h3>
        {league === 'All' && gs.length > CAP && <button className="more" onClick={() => { setLeague(lg); scrollTo(0, 0); }}>View more lines</button>}
      </div>
      {(league === 'All' ? gs.slice(0, CAP) : gs).map(card)}
    </div>)}

    {stockHits.length > 0 && <div>
      <div className="lg-head"><Symbol name="chart" size={16} /><h3>Stocks</h3></div>
      {stockHits.map(x => <StockRow key={x.ticker} s={x} price={d.prices[x.ticker]} onOpen={onStock} />)}
      <p className="hint">Back any pick and your stake can buy it.</p>
    </div>}

    <div className="disc">Lines come from one major sportsbook via public scoreboard data, refreshed hourly. Odds lock the moment you tap Lock. Team names identify games and are trademarks of their owners. Investibet is not affiliated with any league or team. Projections are hypothetical, never advice.</div>
  </section>;
}

/* ---------- promo card: pot race or milestone nudge, dismissible for the day ---------- */
function Promo({ d, uid, invested, onCup }: { d: ReturnType<typeof useData>; uid: string; invested: number; onCup: () => void }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem('ib_promo') === new Date().toDateString());
  if (hidden) return null;
  const dismiss = (e: { stopPropagation(): void }) => { e.stopPropagation(); localStorage.setItem('ib_promo', new Date().toDateString()); setHidden(true); };
  const rows = d.lb.map(r => ({ id: r.user_id, points: Number(r.points ?? 0) }));
  const split = potSplit(rows, d.pot); const mine = split[uid] ?? 0; const pct = d.pot ? (mine / d.pot) * 100 : 0;
  const nextMilestone = [100, 500, 1000].find(m => m > invested);
  const showPot = new Date().getDate() % 2 === 1 || !nextMilestone;
  const monthName = new Date(month() + '-02').toLocaleString(undefined, { month: 'long' });
  return <button className="promo" onClick={onCup}>
    {showPot ? <div className="px">
      <div className="t">{fmt0(d.pot)} {monthName} pot</div>
      <div className="s">{mine > 0 ? <>You hold <b className="mint">{pct.toFixed(1)}%</b> of it right now</> : 'Settle a pick this month to claim a share'}</div>
    </div> : <div className="px">
      <div className="t">{fmt0(invested)} invested so far</div>
      <div className="s">{fmt0(nextMilestone!)} invested unlocks a milestone card</div>
    </div>}
    <span className="x" role="button" aria-label="Dismiss" onClick={dismiss}><Symbol name="xmark" size={14} /></span>
  </button>;
}

/* ---------- slip: single leg locks today, multi-leg previews the Stack ---------- */
function Slip({ d, legs, stake, setStake, onRemove, onClose, onLocked, say, brokerConnected, onNeedBroker }: {
  d: ReturnType<typeof useData>; legs: Leg[]; stake: number; setStake: (n: number) => void; onRemove: (i: number) => void;
  onClose: () => void; onLocked: () => void; say: (m: string) => void; brokerConnected: boolean; onNeedBroker: () => void;
}) {
  const [ticker, setTicker] = useState<string | null>(null);
  const [tier, setTier] = useState(0); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const open = legs.length > 0;
  useEffect(() => { if (open) { setTicker(null); setQ(''); setTier(0); } }, [open]);
  if (!open) return <><div className="scrim" /><div className="sheet" /></>;
  const single = legs.length === 1 ? legs[0] : null;
  const combined = stackOdds(legs.map(x => x.line.price));
  const points = stackPoints(legs.map(x => x.line.price));
  const s = d.stocks.find(x => x.ticker === ticker);
  const list = d.stocks.filter(x => q ? x.ticker.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()) : x.tier === tier).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const lock = async () => {
    if (!single || !ticker) return;
    if (!brokerConnected) return onNeedBroker();
    setBusy(true); localStorage.setItem('ib_stake', String(stake));
    const { error } = await sb.rpc('lock_pick', { p_game_id: single.game.id, p_market: single.line.market, p_selection: single.line.selection, p_stake: stake, p_ticker: ticker });
    setBusy(false); if (error) return say(error.message.replace(/^.*?: /, ''));
    navigator.vibrate?.(30); say(marketOpen(new Date()) ? `Locked. Buying ${ticker} now` : `Locked. ${ticker} buys at next market open`); onLocked();
  };
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    <div className="slip-head"><div className="t">{single ? legLabel(single.line) : `${legs.length}-leg Stack`}</div><div className="o">{oddsTxt(combined)}</div></div>
    {single ? <div className="small">{single.game.away} at {single.game.home} · {Math.round(implied(single.line.price) * 100)}% implied · {points} pts if it hits</div>
      : <div className="legs">{legs.map((x, i) => <div className="legrow" key={legKey(x.line)}>
          <div className="lx"><div className="n">{legLabel(x.line)}</div><div className="s">{MARKET_LABEL[x.line.market] ?? x.line.market} · {x.game.away} at {x.game.home}</div></div>
          <div className="o">{oddsTxt(x.line.price)}</div>
          <button className="rm" aria-label="Remove leg" onClick={() => onRemove(i)}><Symbol name="xmark" size={14} /></button>
        </div>)}
        <div className="small" style={{ marginTop: 8 }}>Combined {oddsTxt(combined)} · <b className="mint">{points} pts</b> if every leg hits</div>
      </div>}
    {single ? <>
      <div className="stake">{fmt0(stake)}</div>
      <input type="range" min={5} max={100} step={5} value={stake} onChange={e => setStake(+e.target.value)} aria-label="Stake" />
      <div className="trio"><div><div className="l">Win</div><div className="v mint">{points} pts</div></div><div><div className="l">Miss</div><div className="v">keep {fmt0(stake)}</div></div><div><div className="l">In 5 years</div><div className="v gold">{s ? '~' + fmt0(project(stake, s.avg_return_10y, 5)) : 'pick a stock'}</div></div></div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>What does it buy?</div>
      <div className="chips">{TIERS.map((t, i) => <button key={t} className={'chip ' + (tier === i && !q ? 'on' : '')} onClick={() => { setTier(i); setQ(''); }}>{t}</button>)}</div>
      <input className="search" placeholder="Search tickers" value={q} onChange={e => setQ(e.target.value)} />
      {list.map(x => <button key={x.ticker} className={'srow ' + (ticker === x.ticker ? 'sel' : '')} onClick={() => setTicker(x.ticker)}><div className="tk">{x.ticker}</div><div className="nm">{x.name}</div><div><div className="ln">+{x.avg_return_10y}%/yr</div><div className="dd">worst drop {x.max_drawdown}%</div></div></button>)}
      <div style={{ height: 12 }} />
      <button className="btn" disabled={!ticker || busy} onClick={lock}>{busy ? 'Locking…' : !brokerConnected && ticker ? 'Connect brokerage to lock' : ticker ? `Lock ${fmt0(stake)} on ${single.line.selection.split('|')[0]} → ${ticker}` : 'Pick a stock to lock'}</button>
      <div className="disc">Odds lock now. During beta the buy is simulated at the next market price. Lines are approximate 10-year averages and worst peak-to-trough drops. Not advice.</div>
    </> : <>
      <div className="card" style={{ marginTop: 14 }}><div style={{ fontWeight: 700 }}>Stacks lock in the next build</div><p className="hint" style={{ margin: '6px 0 0' }}>One stake, one stock, every leg must hit. For now, trim to one leg to lock a single pick.</p></div>
      <button className="btn" disabled>Stack locking coming next</button>
    </>}
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

/* ---------- picks: underlined tabs, Hard Rock cards, tap for detail ---------- */
const statusChip = (p: Pick, live: boolean) =>
  p.status === 'pending' ? <span className="res">{live ? 'Live' : 'Pending'}</span>
  : p.status === 'won' ? <span className="res w">Won</span>
  : p.status === 'lost' ? <span className="res l">Missed</span>
  : <span className="res p">{p.status === 'push' ? 'Push' : 'Void'}</span>;
const earnsTxt = (p: Pick) =>
  p.status === 'won' ? `${Math.round(p.points)} pts` : p.status === 'pending' ? `${basePoints(p.odds)} pts` : '0 pts';
const isLive = (p: Pick, g: Game) => p.status === 'pending' && !g.completed && new Date(g.commence_time) <= new Date();

function ScoreStrip({ g, teams }: { g: Game; teams: Record<string, TeamInfo> }) {
  const ab = (n: string) => (teams[n] ?? fallbackTeam(n)).abbreviation;
  return <div className="score"><span>{ab(g.away)}<span className="num">{g.away_score}</span></span><span className="lbl">Final Score</span><span><span className="num">{g.home_score}</span>{ab(g.home)}</span></div>;
}
const WonBand = () => <div className="wonband" aria-hidden="true"><span className="wm">{'INVESTIBET · WON · '.repeat(10)}</span><span className="tag">WON</span></div>;

function Picks({ d, gm, say }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; say: (m: string) => void }) {
  const [tab, setTab] = useState<'all' | 'upcoming' | 'live' | 'finished' | 'won'>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const all = d.picks.filter(p => gm[p.game_id]);
  const lists: Record<typeof tab, Pick[]> = {
    all,
    upcoming: all.filter(p => p.status === 'pending' && !isLive(p, gm[p.game_id])),
    live: all.filter(p => isLive(p, gm[p.game_id])),
    finished: all.filter(p => p.status !== 'pending'),
    won: all.filter(p => p.status === 'won'),
  };
  const list = lists[tab];
  const EMPTY: Record<typeof tab, string> = {
    all: 'No picks yet. Head to Home and back a side.',
    upcoming: 'Nothing locked for later. The board is full of lines.',
    live: 'No picks in play right now.',
    finished: 'Nothing settled yet. Results land here when games go final.',
    won: 'No wins yet. The first one turns this screen green.',
  };
  const sel = selId ? all.find(p => p.id === selId) ?? null : null;
  return <section className="view"><h2 style={{ fontSize: 22 }}>Picks</h2>
    <div className="tabs">{([['all', 'All'], ['upcoming', 'Upcoming'], ['live', 'Live'], ['finished', 'Finished'], ['won', 'Won']] as const).map(([k, l]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {!list.length ? <div className="empty"><Symbol name="ticket" size={56} /><p>{EMPTY[tab]}</p></div>
      : list.map(p => { const g = gm[p.game_id]; const won = p.status === 'won'; const live = isLive(p, g); const { day, time } = kickoffLabel(new Date(g.commence_time));
        const val = p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : null;
        return <button key={p.id} className={'pick ' + (won ? 'won' : p.status === 'lost' ? 'lost' : '')} onClick={() => setSelId(p.id)}>
          {won && <WonBand />}
          <div className="row"><div><div className="side">{legLabel(p)} <span className="odds-acc">{oddsTxt(p.odds)}</span></div>
            <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit</div>
            <div className="meta">{g.away} @ {g.home}</div></div>
            {!won && statusChip(p, live)}</div>
          {!won && <div className="kick"><Symbol name="calendar" size={13} />{g.completed ? `Final · ${g.away_score}-${g.home_score}` : live ? <b>In play</b> : `${day}, ${time}`}</div>}
          <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v">{earnsTxt(p)}</div></div></div>
          {won && g.completed && <ScoreStrip g={g} teams={d.teams} />}
          <div className={'meta ' + (p.filled_at ? 'mint' : '')} style={{ marginTop: 12 }}>{p.filled_at ? `Bought ${Number(p.shares).toFixed(4)} ${p.ticker} at ${fmt(Number(p.fill_price))}${val != null ? ` · now ${fmt(val)}` : ''}` : `${fmt0(Number(p.stake))} of ${p.ticker} · buys at next market open`}</div>
        </button>; })}
    <PickSheet p={sel} g={sel ? gm[sel.game_id] : null} d={d} say={say} onClose={() => setSelId(null)} />
  </section>;
}

/* ---------- pick detail sheet ---------- */
function PickSheet({ p, g, d, say, onClose }: { p: Pick | null; g: Game | null; d: ReturnType<typeof useData>; say: (m: string) => void; onClose: () => void }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { setArm(false); }, [p?.id]);
  if (!p || !g) return <><div className="scrim" /><div className="sheet" /></>;
  const live = isLive(p, g);
  const { day, time } = kickoffLabel(new Date(g.commence_time));
  const val = p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : null;
  const stock = d.stocks.find(x => x.ticker === p.ticker);
  const cancel = async () => {
    if (!arm) { setArm(true); setTimeout(() => setArm(false), 3000); return; }
    const { error } = await sb.rpc('cancel_pick', { p_pick_id: p.id });
    say(error ? error.message.replace(/^.*?: /, '') : 'Pick cancelled');
    if (!error) { d.reload(); onClose(); }
  };
  const won = p.status === 'won';
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    {won ? <div className="pick won" style={{ margin: 0 }}>
      <WonBand />
      <div className="row"><div><div className="side" style={{ fontSize: 20 }}>{legLabel(p)} <span className="odds-acc">{oddsTxt(p.odds)}</span></div>
        <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit</div>
        <div className="meta">{g.away} @ {g.home}</div></div></div>
      <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v">{earnsTxt(p)}</div></div></div>
      {g.completed && <ScoreStrip g={g} teams={d.teams} />}
    </div> : <>
      <div className="row"><div><div className="side" style={{ fontSize: 20 }}>{legLabel(p)} <span className="odds-acc">{oddsTxt(p.odds)}</span></div>
        <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit</div></div>{statusChip(p, live)}</div>
      <div className="meta" style={{ marginTop: 6 }}>{g.away} @ {g.home}</div>
      <div className="kick"><Symbol name="calendar" size={13} />{g.completed ? 'Final' : live ? <b>In play</b> : `${day}, ${time}`}<span>· {g.league}</span></div>
      <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v">{earnsTxt(p)}</div></div></div>
      {g.completed && <ScoreStrip g={g} teams={d.teams} />}
    </>}
    {won && Number(p.points) > basePoints(p.odds) && <div className="small" style={{ marginTop: 8 }}>{basePoints(p.odds)} base with the streak multiplier applied</div>}
    <div className="card" style={{ margin: '14px 0 10px' }}>
      <div style={{ fontWeight: 700 }}>{p.ticker}{stock ? ` · ${stock.name}` : ''}</div>
      <div className="meta" style={{ marginTop: 6 }}>{p.filled_at ? `Bought ${Number(p.shares).toFixed(4)} shares at ${fmt(Number(p.fill_price))}` : `${fmt0(Number(p.stake))} buys at the next market open`}</div>
      {val != null && <div className="meta mint" style={{ marginTop: 4 }}>Now worth {fmt(val)}</div>}
      <div className="small" style={{ marginTop: 8 }}>Yours win or miss. The stake never goes to a book.</div>
    </div>
    <div className="pid">Pick ID {p.id.slice(0, 8)}<button style={{ minHeight: 24, color: 'var(--dim)' }} aria-label="Copy pick ID" onClick={() => { navigator.clipboard?.writeText(p.id); say('Copied'); }}><Symbol name="copy" size={13} /></button></div>
    {p.status === 'pending' && !live && <button className="btn danger" style={{ marginTop: 12 }} onClick={cancel}>{arm ? 'Tap again to cancel' : 'Cancel pick'}</button>}
    <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
  </div></>;
}

/* ---------- cup ---------- */
function Cup({ d, uid }: { d: ReturnType<typeof useData>; uid: string }) {
  const rows = d.lb.map(r => ({ id: r.user_id, points: Number(r.points ?? 0) })); const split = potSplit(rows, d.pot);
  const sorted = [...d.lb].sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0)); const mine = split[uid] ?? 0;
  return <section className="view"><h2 style={{ fontSize: 22 }}>The Cup</h2>
    <div className="pot"><div className="row"><span className="small">Monthly pot</span><span className="small">{new Date(month() + '-02').toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span></div>
      <div className="big"><Roll value={d.pot} format={fmt0} /></div>
      {rows.some(r => r.id === uid) && <div className="hint" style={{ margin: '6px 0 0' }}>You hold <b className="mint">{(d.pot ? mine / d.pot * 100 : 0).toFixed(1)}%</b> of the pot right now: <b className="mint">{fmt(mine)}</b></div>}
      <div className="small" style={{ marginTop: 8 }}>60% split by points, 40% to the top 10. Points are the odds you hit, stake never matters. Best 15 picks a week count.</div></div>
    {sorted.length ? sorted.map((r, i) => <div key={r.user_id} className={'lrow ' + (r.user_id === uid ? 'me' : '')}><div className="rk">{i + 1}</div><div className="nm">{r.display_name} {r.streak >= 3 && <span className="flame"><Symbol name="flame" size={12} />{r.streak}</span>}</div><div className="pt">{Math.round(Number(r.points ?? 0))}</div><div className="sh">{fmt0(split[r.user_id] ?? 0)}</div></div>) : <p className="hint">Nobody has settled a pick this month yet.</p>}
  </section>;
}

/* ---------- stock row and detail sheet (ROI patterns: Discover rows, big-number detail) ---------- */
const TIER_TAG = ['The favorite · steady', 'The value play · in between', 'The longshot · wild ride'];
function StockRow({ s, price, onOpen, right }: { s: Stock; price?: number; onOpen: (t: string) => void; right?: { v: string; sub: string; dn?: boolean } }) {
  return <button className="stockrow" onClick={() => onOpen(s.ticker)}>
    <span className="sdisc" aria-hidden="true">{s.ticker.slice(0, 2)}</span>
    <div><div className="tk">{s.ticker}</div><div className="nm">{s.name}</div></div>
    {right ? <div><div className="pr">{right.v}</div><div className={'ch' + (right.dn ? ' dn' : '')}>{right.sub}</div></div>
      : <div>{price ? <div className="pr">{fmt(price)}</div> : null}<div className="ch">+{s.avg_return_10y}%/yr</div></div>}
  </button>;
}

function StockSheet({ ticker, d, gm, onClose }: { ticker: string | null; d: ReturnType<typeof useData>; gm: Record<string, Game>; onClose: () => void }) {
  const [years, setYears] = useState(5); const [at, setAt] = useState<number | null>(null);
  useEffect(() => { setYears(5); setAt(null); }, [ticker]);
  const s = ticker ? d.stocks.find(x => x.ticker === ticker) : null;
  if (!s) return <><div className="scrim" /><div className="sheet" /></>;
  const price = d.prices[s.ticker];
  const held = d.picks.filter(p => gm[p.game_id] && p.ticker === s.ticker && p.filled_at && p.shares);
  const shares = held.reduce((t, p) => t + Number(p.shares), 0);
  const cost = held.reduce((t, p) => t + Number(p.stake), 0);
  const val = price ? shares * price : cost;
  const curve = Array.from({ length: years + 1 }, (_, i) => project(100, s.avg_return_10y, i));
  const ai = at ?? years;
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    <div className="row"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="sdisc big" aria-hidden="true">{s.ticker.slice(0, 2)}</span>
      <div><div className="side" style={{ fontSize: 20 }}>{s.ticker}</div><div className="nm" style={{ fontSize: 13, color: 'var(--muted)' }}>{s.name}</div></div></div>
      {price ? <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, fontSize: 20 }}>{fmt(price)}</div><div className="small">latest price</div></div> : null}</div>
    <div className="eyebrow" style={{ marginTop: 8 }}>{TIER_TAG[s.tier] ?? ''}</div>
    <div className="row" style={{ marginTop: 10 }}>
      <span className="small">10-yr avg return <b className="mint">+{s.avg_return_10y}%/yr</b></span>
      <span className="small">worst drop <b>{s.max_drawdown}%</b></span>
    </div>
    <div className="readout" style={{ marginTop: 16 }}>$100 becomes ~<b className="mint"><Roll value={project(100, s.avg_return_10y, ai)} format={fmt0} /></b> after {ai} {ai === 1 ? 'year' : 'years'}</div>
    <LineChart series={[{ color: 'var(--mint)', vals: curve, area: true }]} n={years + 1} active={ai} onActive={setAt} xLabels={['Now', `${years} yrs`]} label={`Projection of $100 in ${s.ticker} over ${years} years`} />
    <div className="chips">{[1, 5, 10, 20, 25].map(y => <button key={y} className={'chip ' + (years === y ? 'on' : '')} onClick={() => { setYears(y); setAt(null); }}>{y} yr</button>)}</div>
    {shares > 0 && <div className="card" style={{ margin: '10px 0' }}>
      <div style={{ fontWeight: 700 }}>You own {shares.toFixed(4)} shares</div>
      <div className="meta" style={{ marginTop: 4 }}>{fmt0(cost)} staked · now {fmt(val)} · <b className={val - cost >= 0 ? 'mint' : ''}>{val - cost >= 0 ? '+' : ''}{fmt(val - cost)}</b></div>
    </div>}
    <div className="disc">Hypothetical, using the approximate 10-year average annual return and worst peak-to-trough drop. Past returns do not predict future results. Investibet never recommends a stock; any pick can be backed with any stock on the board. Not advice.</div>
    <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>Done</button>
  </div></>;
}

/* ---------- owned: the live portfolio, its chart, and stock search ---------- */
function Owned({ d, gm, onStock }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; onStock: (t: string) => void }) {
  const [q, setQ] = useState(''); const [view, setView] = useState<'owned' | 'book'>('owned'); const [at, setAt] = useState<number | null>(null);
  const mine = d.picks.filter(p => gm[p.game_id]);
  const filled = mine.filter(p => p.filled_at && p.shares);
  const pending = mine.filter(p => !p.filled_at);
  const value = ownedValue(mine, d.prices);
  const staked = mine.reduce((s, p) => s + Number(p.stake), 0);
  const holdings = Object.values(filled.reduce<Record<string, { ticker: string; shares: number; cost: number }>>((acc, p) => {
    const h = acc[p.ticker] ?? (acc[p.ticker] = { ticker: p.ticker, shares: 0, cost: 0 });
    h.shares += Number(p.shares); h.cost += Number(p.stake); return acc;
  }, {})).map(h => ({ ...h, value: d.prices[h.ticker] ? h.shares * d.prices[h.ticker] : h.cost, stock: d.stocks.find(x => x.ticker === h.ticker) }))
    .sort((a, b) => b.value - a.value);
  const move = holdings.reduce((s, h) => s + (h.value - h.cost), 0);
  const proj = (y: number) => holdings.reduce((s, h) => s + project(h.value, h.stock?.avg_return_10y ?? 10, y), 0) + pending.reduce((s, p) => s + project(Number(p.stake), d.stocks.find(x => x.ticker === p.ticker)?.avg_return_10y ?? 10, y), 0);

  // The two timelines, pick by pick in lock order; the last point is today at market value
  const chrono = [...mine].sort((a, b) => a.locked_at.localeCompare(b.locked_at));
  const ownedPts = [0]; const bookPts = [0]; let oc = 0, bc = 0;
  for (const p of chrono) { oc += Number(p.stake); bc += Number(p.stake) + counterfactualDelta(Number(p.stake), p.odds, p.status as 'won' | 'lost' | 'push' | 'void' | 'pending'); ownedPts.push(oc); bookPts.push(bc); }
  ownedPts.push(value); bookPts.push(bc);
  const n = ownedPts.length;
  const ai = Math.min(at ?? n - 1, n - 1);
  const ptLabel = ai === 0 ? 'At the start' : ai === n - 1 ? 'Today' : `After pick ${ai}`;
  const diff = ownedPts[ai] - bookPts[ai];

  const query = q.trim().toLowerCase();
  const results = query ? d.stocks.filter(x => x.ticker.toLowerCase().includes(query) || x.name.toLowerCase().includes(query)).sort((a, b) => a.ticker.localeCompare(b.ticker)).slice(0, 20) : [];

  return <section className="view"><h2 style={{ fontSize: 22 }}>Owned</h2>
    <div className="searchbar"><Symbol name="magnifyingglass" size={16} /><input className="search" placeholder="Find a stock" aria-label="Find a stock" value={q} onChange={e => setQ(e.target.value)} /></div>
    {query ? <>
      <div className="lg-head"><Symbol name="chart" size={16} /><h3>Stocks</h3></div>
      {results.length ? results.map(x => <StockRow key={x.ticker} s={x} price={d.prices[x.ticker]} onOpen={onStock} />)
        : <div className="empty"><Symbol name="magnifyingglass" size={48} /><p>Nothing matches "{q.trim()}". Try the ticker or the name.</p></div>}
      <div className="disc">Alphabetical, never ranked by return. Investibet never recommends a stock.</div>
    </> : !mine.length ? <div className="card calm"><div style={{ fontWeight: 700 }}>Nothing owned yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Back a pick on Home. Win or miss, the stake buys stock that shows up here. Search above to read up on any stock first.</p></div>
    : <>
      <div className="card">
        <div className="small">Portfolio value</div>
        <div className="big" style={{ margin: '4px 0' }}><Roll value={value} format={fmt0} /></div>
        <div className="small">{fmt0(staked)} staked across {mine.length} picks{holdings.length ? <> · <b className={move >= 0 ? 'mint' : ''}>{move >= 0 ? '+' : ''}{fmt(move)}</b> since you bought</> : null}</div>
      </div>
      <div className="card">
        <div className="seg">{([['owned', 'Owned'], ['book', 'Vs a sportsbook']] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <LineChart n={n} active={ai} onActive={setAt} xLabels={['Start', 'Today']} label="Your money over time"
          series={view === 'owned' ? [{ color: 'var(--mint)', vals: ownedPts, area: true }]
            : [{ color: 'var(--mint)', vals: ownedPts }, { color: 'var(--coral)', vals: bookPts, dash: true }]} />
        <div className="readout">{ptLabel}: you own {fmt0(ownedPts[ai])}{view === 'book' ? <> · a sportsbook would hold {fmt0(bookPts[ai])}</> : null}
          {view === 'book' && <div className="sub">{diff >= 0 ? `That is ${fmt0(diff)} more than the betting timeline.` : `${fmt0(-diff)} behind the betting timeline for now. The stock is still yours.`}</div>}
        </div>
        {view === 'book' && <div className="legend"><span><i className="dt" style={{ background: 'var(--mint)' }} />You own</span><span><i className="dt" style={{ background: 'var(--coral)' }} />Sportsbook timeline</span></div>}
        <div className="disc">Each step is a locked pick; the last point is today's value. The dashed line is what the same stakes would have left at a sportsbook. Tap the chart to walk through it.</div>
      </div>
      {holdings.map(h => <StockRow key={h.ticker} s={h.stock ?? { ticker: h.ticker, name: '', tier: 0, avg_return_10y: 10, max_drawdown: 0 }} onOpen={onStock}
        right={{ v: fmt(h.value), sub: `${h.value - h.cost >= 0 ? '+' : ''}${fmt(h.value - h.cost)}`, dn: h.value - h.cost < 0 }} />)}
      {pending.length > 0 && <div className="card">
        <div style={{ fontWeight: 700 }}>Buying at next market open</div>
        {pending.map(p => <div key={p.id} className="small" style={{ marginTop: 6 }}>{fmt0(Number(p.stake))} of {p.ticker}</div>)}
      </div>}
      <div className="card"><div className="small" style={{ marginBottom: 8 }}>If everything here grew at its 10-year average</div>
        <div className="ladder"><div><div className="l">1 yr</div><div className="v">{fmt0(proj(1))}</div></div><div><div className="l">5 yr</div><div className="v">{fmt0(proj(5))}</div></div><div><div className="l">10 yr</div><div className="v">{fmt0(proj(10))}</div></div></div>
        <div className="disc">Hypothetical. Uses each ticker's approximate 10-year average annual return. Past returns do not predict future results. Nothing here is investment advice.</div></div>
      <div className="disc">Day-by-day movement arrives once the engine stores daily closes. Until then, movement is measured from your buy price.</div>
    </>}
  </section>;
}

/* ---------- profile ---------- */
function ProfileTab({ d, gm, say, onBroker }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; say: (m: string) => void; onBroker: () => void }) {
  const [how, setHow] = useState(false);
  const name = d.profile?.display_name ?? 'You';
  const mine = d.picks.filter(p => gm[p.game_id]);
  const value = ownedValue(mine, d.prices);
  const wins = mine.filter(p => p.status === 'won').length, losses = mine.filter(p => p.status === 'lost').length;
  const monthPts = Math.round(mine.filter(p => p.counted).reduce((s, p) => s + Number(p.points), 0));
  const saveCap = async (v: string) => { await sb.from('profiles').update({ weekly_cap: v ? Number(v) : null }).eq('id', d.profile!.id); say(v ? 'Cap set' : 'Cap removed'); d.reload(); };
  return <section className="view">
    <div className="whoami"><span className="avatar big">{initialsOf(name)}</span><div><h2 style={{ fontSize: 22 }}>{name}</h2><div className="small">Private beta</div></div></div>
    <div className="card">
      <div className="small">Owned</div>
      <div className="big" style={{ margin: '4px 0' }}><Roll value={value} format={fmt0} /></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onBroker}>{d.broker?.connected ? `${BROKERS.find(b => b[0] === d.broker!.provider)?.[1]} connected (simulated)` : 'Open brokerage (simulated)'}</button>
        <button className="btn ghost sm" onClick={() => setHow(h => !h)}>How it works</button>
      </div>
      {how && <p className="hint" style={{ marginTop: 10 }}>Every stake buys real stock in your own brokerage account. Win and you earn points toward the pot. Miss and the streak resets, but the stock stays yours. Investibet never holds your money and never recommends a stock.</p>}
    </div>
    <div className="card"><div className="row"><div><div style={{ fontWeight: 700 }}>This month</div><div className="small">{wins} won · {losses} missed · streak {d.profile?.streak ?? 0}</div></div><div style={{ fontWeight: 700, fontSize: 22 }}>{monthPts} pts</div></div></div>
    <div className="card"><div className="row"><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Symbol name="shield" size={20} /><div><div style={{ fontWeight: 700 }}>Responsible play</div><div className="small">Your weekly stake cap. The app enforces it.</div></div></div>
      <input type="number" min={0} step={5} defaultValue={d.profile?.weekly_cap ?? ''} onBlur={e => saveCap(e.target.value)} style={{ width: 90, padding: 10, minHeight: 44, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--line)', outline: 'none' }} aria-label="Weekly cap" /></div></div>
    <button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
    <div className="disc">Investibet never holds your money, never places trades for you, and never recommends a stock. Lines shown are informational. Free, private, invite-only beta.</div>
    <div className="small" style={{ textAlign: 'center', margin: '16px 0' }}>Beta 0.2</div>
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
