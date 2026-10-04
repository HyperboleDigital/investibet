import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, ENABLE_PROPS } from './lib/supabase';
import Symbol from './Symbol';
import { implied, basePoints, potSplit, projectSmart, marketOpen, stackOdds, stackPoints, bookValue, counterfactualDelta, streakMultiplier } from '@investibet/core';

/* ---------- types ---------- */
type Game = { id: string; sport_key: string; league: string; home: string; away: string; commence_time: string; completed: boolean; home_score: number | null; away_score: number | null; period?: number | null; clock?: string | null; last_play?: string | null; down_distance?: string | null };
type Line = { game_id: string; market: string; selection: string; point: number | null; price: number; fetched_at?: string | null };
type TeamInfo = { abbreviation: string; short_name: string; ui_color: string | null };
type Pick = { id: string; game_id: string; market: string; selection: string; point: number | null; odds: number; stake: number; ticker: string; locked_at: string; fill_price: number | null; shares: number | null; filled_at: string | null; status: string; points: number; counted: boolean; live?: boolean };
type Stock = { ticker: string; name: string; tier: number; avg_return_10y: number; max_drawdown: number };
type Profile = { id: string; display_name: string; streak: number; weekly_cap: number | null; created_at?: string };
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
const RANKS: [string, number, string][] = [['Bronze', 0, '#B07A4B'], ['Silver', 100, '#9AA3B5'], ['Gold', 350, '#D9A434'], ['Platinum', 800, '#7FC8DF'], ['Diamond', 2000, '#9F8CF5']];
const rankFor = (pts: number) => { let r = RANKS[0]; for (const t of RANKS) if (pts >= t[1]) r = t; return r; };
const nextRank = (pts: number) => RANKS.find(t => t[1] > pts) ?? null;
const ODDS_STEPS = [-300, -250, -200, -150, -120, -110, 100, 120, 150, 170, 200, 250, 300, 350, 400, 450, 500];
const fmtMult = (m: number) => '\u00d7' + (Math.round(m * 100) / 100);
const initialsOf = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

/* ---------- rolling number: live values roll on change, still numbers under reduced motion ---------- */
function Roll({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [disp, setDisp] = useState(value); const prev = useRef(value); const first = useRef(true);
  useEffect(() => {
    const from = prev.current, to = value; prev.current = value;
    if (from === to) return;
    // The first change after mount is just data arriving (reload, tab switch): snap, don't roll
    if (first.current) { first.current = false; setDisp(to); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisp(to); return; }
    const t0 = performance.now(), dur = 600; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); setDisp(from + (to - from) * e); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(disp)}</>;
}

/* ---------- the flame: gradient fill, always alive, glows from streak 3 ---------- */
function Flame({ size = 26, streak = 0 }: { size?: number; streak?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hot = streak >= 3;
  return <svg width={size} height={size} viewBox="0 0 24 24" className={'flameicon' + (hot ? ' hot' : '') + (streak === 0 ? ' cold' : '')} aria-hidden="true">
    <defs><linearGradient id={`flg${uid}`} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="#FF5D2E" /><stop offset=".55" stopColor="#FF9F0A" /><stop offset="1" stopColor="#FFD60A" />
    </linearGradient></defs>
    <path fill={`url(#flg${uid})`} d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    <path fill="#FFF3C4" opacity=".85" d="M12.3 20.6a3.2 3.2 0 0 0 3.2-3.2c0-1.1-.55-2-1.35-2.75-.85.8-1.85 1.2-1.85 2.25a1.85 1.85 0 0 1-1.85-1.85c-.8.75-1.35 1.65-1.35 2.75a3.2 3.2 0 0 0 3.2 3.2z" />
  </svg>;
}

/* ---------- price history: real daily closes via the engine, cached per ticker ---------- */
type Hist = [string, number][];
const histCache = new Map<string, Hist>();
function useHistory(ticker: string | null) {
  const [hist, setHist] = useState<Hist | null>(ticker ? histCache.get(ticker) ?? null : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ticker) return;
    setFailed(false); setHist(histCache.get(ticker) ?? null);
    if (histCache.has(ticker)) return;
    let gone = false;
    fetch(`${import.meta.env.VITE_ENGINE_URL ?? ''}/history/${ticker}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => { if (!gone && Array.isArray(j.points) && j.points.length) { histCache.set(ticker, j.points); setHist(j.points); } else if (!gone) setFailed(true); })
      .catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; };
  }, [ticker]);
  return { hist, failed };
}
const thin = (a: Hist, max = 110): Hist => a.length <= max ? a : a.filter((_, i) => i % Math.ceil(a.length / max) === 0 || i === a.length - 1);

/* ---------- line chart: inline SVG, one axis, 2px lines, tap a column to read the values ---------- */
function LineChart({ series, n, active, onActive, onRelease, cursor, xLabels, label, fit }: {
  series: { color: string; vals: number[]; dash?: boolean; area?: boolean }[]; n: number;
  active: number; onActive: (i: number) => void; onRelease?: () => void; cursor?: boolean; xLabels: [string, string]; label: string; fit?: boolean;
}) {
  const W = 340, H = 150, L = 8, R = 8, T = 12, B = 22;
  const all = series.flatMap(s => s.vals);
  const max = Math.max(1e-9, ...all) * (fit ? 1.015 : 1.06);
  const min = fit ? Math.min(...all) * 0.99 : 0;
  const x = (i: number) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : 0);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const pts = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const base = fit ? H - B : y(0);
  const pickIdx = (clientX: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const fx = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((fx - L) * (n - 1)) / (W - L - R))));
  };
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', touchAction: 'pan-y' }}
    onTouchStart={e => onActive(pickIdx(e.touches[0].clientX, e.currentTarget))}
    onTouchMove={e => onActive(pickIdx(e.touches[0].clientX, e.currentTarget))}
    onTouchEnd={() => onRelease?.()} onTouchCancel={() => onRelease?.()}
    onMouseDown={e => onActive(pickIdx(e.clientX, e.currentTarget))}
    onMouseMove={e => { if (e.buttons === 1) onActive(pickIdx(e.clientX, e.currentTarget)); }}
    onMouseUp={() => onRelease?.()} onMouseLeave={() => onRelease?.()}>
    {cursor && <line x1={x(active)} x2={x(active)} y1={4} y2={H - 4} stroke="var(--dim)" strokeWidth="1.25" opacity=".7" />}
    {[0.25, 0.5, 0.75].map(f => <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="var(--line)" strokeWidth="1" />)}
    {!fit && <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--line)" strokeWidth="1.5" />}
    {series.map((s, si) => <g key={si}>
      {s.area && <polygon points={`${x(0)},${base} ${pts(s.vals)} ${x(n - 1)},${base}`} fill={s.color} opacity="0.08" />}
      <polyline points={pts(s.vals)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? '5 4' : undefined} />
      <circle cx={x(active)} cy={y(s.vals[active])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
    </g>)}
    <text x={L} y={H - 6} fontSize="10" fill="var(--dim)">{xLabels[0]}</text>
    <text x={W - R} y={H - 6} fontSize="10" fill="var(--dim)" textAnchor="end">{xLabels[1]}</text>
  </svg>;
}

/* ---------- worth chart: one line, yours. Solid gradient past, dashed future, the end value named. ---------- */
function WorthChart({ past, future, active, onActive, onRelease, cursor, endLabel }: {
  past: number[]; future: number[]; active: number; onActive: (i: number) => void; onRelease?: () => void; cursor?: boolean; endLabel: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = 360, H = 170, T = 18, B = 12, R = 12;
  const comb = [...past, ...future.slice(1)];
  const N = comb.length;
  // Compressed (log) scale: at +25 years the future is ~200x today, and a linear scale
  // would squash the whole past into an invisible sliver. Log keeps both legible.
  const hi = Math.max(10, ...comb) * 1.06;
  const pos = comb.filter(v => v > 0);
  const lo = Math.max(1, (pos.length ? Math.min(...pos) : 1) * 0.5);
  const ly = (v: number) => Math.log(Math.max(v, lo));
  const y = (v: number) => T + (1 - (ly(v) - ly(lo)) / (ly(hi) - ly(lo))) * (H - T - B);
  const x = (i: number) => (N > 1 ? (i * (W - R)) / (N - 1) : 0);
  const pts = (vals: number[], from = 0) => vals.map((v, i) => `${x(i + from).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ti = past.length - 1; // today
  const pickIdx = (clientX: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const fx = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(N - 1, Math.round((fx * (N - 1)) / (W - R))));
  };
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="What you own, past and projected" style={{ display: 'block', touchAction: 'pan-y' }}
    onTouchStart={e => onActive(pickIdx(e.touches[0].clientX, e.currentTarget))}
    onTouchMove={e => onActive(pickIdx(e.touches[0].clientX, e.currentTarget))}
    onTouchEnd={() => onRelease?.()} onTouchCancel={() => onRelease?.()}
    onMouseDown={e => onActive(pickIdx(e.clientX, e.currentTarget))}
    onMouseMove={e => { if (e.buttons === 1) onActive(pickIdx(e.clientX, e.currentTarget)); }}
    onMouseUp={() => onRelease?.()} onMouseLeave={() => onRelease?.()}>
    {cursor && <line x1={x(active)} x2={x(active)} y1={4} y2={H - 4} stroke="var(--dim)" strokeWidth="1.25" opacity=".7" />}
    <defs><linearGradient id={`wg${uid}`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="var(--peri)" /><stop offset="1" stopColor="var(--mint)" />
    </linearGradient></defs>
    <polygon points={`${x(0)},${y(0)} ${pts(past)} ${x(ti)},${y(0)}`} fill="var(--mint)" opacity="0.07" />
    {future.length > 1 && <polyline points={pts(future, ti)} fill="none" stroke="var(--mint)" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" opacity=".75" />}
    <polyline points={pts(past)} fill="none" stroke={`url(#wg${uid})`} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={x(ti)} cy={y(past[ti])} r="5.5" fill="var(--mint)" stroke="#fff" strokeWidth="2.5" />
    <circle cx={x(active)} cy={y(comb[Math.min(active, N - 1)])} r="4.5" fill={active > ti ? 'var(--mint)' : 'var(--peri)'} stroke="#fff" strokeWidth="2" opacity={active === ti ? 0 : 1} />
    {future.length > 1 && <circle cx={x(N - 1)} cy={y(comb[N - 1])} r="3.5" fill="#fff" stroke="var(--mint)" strokeWidth="2" />}
    <text x={W - 10} y={Math.min(y(comb[N - 1]) + 40, H - 18)} textAnchor="end" fontSize="12.5" fontWeight="800" fill="var(--mint)">{endLabel}</text>
  </svg>;
}

/* Freeze the page behind an open sheet: iOS keeps scrolling the body otherwise */
function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const y = window.scrollY; const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow };
    b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0'; b.width = '100%'; b.overflow = 'hidden';
    return () => { b.position = prev.position; b.top = prev.top; b.left = prev.left; b.right = prev.right; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y); };
  }, [locked]);
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
    const lineSets = await Promise.all(chunks.map(c => sb.from('lines').select('game_id, market, selection, point, price, fetched_at').in('game_id', c).limit(1000)));
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
  useEffect(() => {
    const apply = () => {
      const pref = localStorage.getItem('ib_theme') ?? 'auto';
      const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0D0F14' : '#F2F3F7');
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply); window.addEventListener('ib-theme', apply);
    return () => { mq.removeEventListener('change', apply); window.removeEventListener('ib-theme', apply); };
  }, []);
  useEffect(() => { sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }); const { data } = sb.auth.onAuthStateChange((_, s) => setSession(s)); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return null;
  if (!session) return <Gate />;
  return <Shell session={session} />;
}

function Gate() {
  const [email, setEmail] = useState(() => localStorage.getItem('ib_email') ?? '');
  const [mode, setMode] = useState<'email' | 'code' | 'password'>('email');
  const [code, setCode] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, then?: () => void) => {
    setErr(''); setBusy(true);
    const { error } = await fn(); setBusy(false);
    if (error) return setErr(error.message);
    localStorage.setItem('ib_email', email); then?.();
  };
  const sendCode = () => email && run(() => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }), () => { setCode(''); setMode('code'); });
  const verify = () => code.trim() && run(() => sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' }));
  const pwLogin = () => pw && run(() => sb.auth.signInWithPassword({ email, password: pw }));
  return <div className="gate"><div className="box">
    <div className="brand" style={{ fontSize: 28 }}>Investi<span>bet</span></div>
    <p className="hint">Sports picks where the stake buys stock you keep. Losing loses nothing.</p>
    <input placeholder="Email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
    {mode === 'email' && <>
      <button className="btn" disabled={busy || !email} onClick={sendCode}>{busy ? 'Sending…' : 'Email me a code'}</button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" onClick={() => { setErr(''); setMode('password'); }}>I have a password</button>
    </>}
    {mode === 'code' && <>
      <p className="hint">Check your email for a 6-digit code. Entering it here keeps you inside the app; the link works too.</p>
      <input placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
      <button className="btn" disabled={busy || code.trim().length < 6} onClick={verify}>{busy ? 'Checking…' : 'Sign in'}</button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" disabled={busy} onClick={sendCode}>Resend the code</button>
    </>}
    {mode === 'password' && <>
      <input placeholder="Password" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
      <button className="btn" disabled={busy || !email || !pw} onClick={pwLogin}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" onClick={() => { setErr(''); setMode('email'); }}>Email me a code instead</button>
      <p className="hint" style={{ marginTop: 10 }}>No password yet? Sign in with a code once, then set one in Profile.</p>
    </>}
    {err && <p className="hint" style={{ color: 'var(--coral)', marginTop: 10 }}>{err}. Try again, or use a code instead.</p>}
    <div className="disc">Free, private beta. No money moves through this app. Brokerage connection is simulated during beta.</div>
  </div></div>;
}

/* ---------- shell: 5-tab floating pill nav, selection cart, slip ---------- */
type Tab = 'home' | 'picks' | 'owned' | 'stocks' | 'profile';
const TABS: [Tab, string, string][] = [['home', 'Home', 'home'], ['picks', 'Picks', 'ticket'], ['owned', 'Invest', 'chart'], ['stocks', 'Stocks', 'magnifyingglass']];

function Shell({ session }: { session: Session }) {
  const d = useData(session); const [tab, setTab] = useState<Tab>('home');
  const [cart, setCart] = useState<Leg[]>([]); const [slipOpen, setSlipOpen] = useState(false); const [brokerOpen, setBrokerOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState<string | null>(null);
  const [lockedPick, setLockedPick] = useState<Pick | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const goGame = (gid: string) => { setStockOpen(null); setOpenId(gid); setTab('home'); scrollTo(0, 0); };
  const [stake, setStake] = useState(() => Number(localStorage.getItem('ib_stake')) || 20);
  const [toast, setToast] = useState(''); const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const gm = useMemo(() => Object.fromEntries(d.games.map(g => [g.id, g])), [d.games]);

  // Liquid Glass lens: the nav highlight detaches under the thumb, springs to where you let go
  const NAV_ORDER: Tab[] = ['home', 'picks', 'owned', 'stocks', 'profile'];
  const navRef = useRef<HTMLElement | null>(null);
  const [lensI, setLensI] = useState(0); const [lensDrag, setLensDrag] = useState(false);
  useEffect(() => { setLensI(NAV_ORDER.indexOf(tab)); }, [tab]); // eslint-disable-line
  const idxFromX = (x: number) => { const r = navRef.current?.getBoundingClientRect(); if (!r) return lensI; return Math.max(0, Math.min(4, Math.floor(((x - r.left) / r.width) * 5))); };
  const go = (t: Tab) => { setStockOpen(null); setTab(t); scrollTo(0, 0); };

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
  const nextMult = streakMultiplier((d.profile?.streak ?? 0) + 1);
  const pts = cart.length ? Math.round(stackPoints(cart.map(x => x.line.price)) * nextMult) : 0;

  return <>
    {stockOpen ? <StockPage ticker={stockOpen} d={d} gm={gm} onClose={() => setStockOpen(null)} /> : <>
      {tab === 'home' && <header><div className="brand">Investi<span>bet</span></div></header>}
      {tab === 'home' && <Home d={d} uid={session.user.id} cart={cart} onToggle={toggleLeg} onCup={() => setTab('profile')} onStock={setStockOpen} openId={openId} setOpenId={setOpenId} />}
      {tab === 'picks' && <Picks d={d} gm={gm} say={say} onEvent={goGame} />}
      {tab === 'owned' && <Owned d={d} gm={gm} onStock={setStockOpen} />}
      {tab === 'stocks' && <StocksTab d={d} onStock={setStockOpen} />}
      {tab === 'profile' && <ProfileTab d={d} gm={gm} uid={session.user.id} say={say} onBroker={() => setBrokerOpen(true)} />}
    </>}
    {cart.length > 0 && !slipOpen && <button className="selbar" onClick={() => setSlipOpen(true)}>
      <span className="n" key={cart.length}>{cart.length} {cart.length === 1 ? 'pick' : 'picks'}</span>
      <span className="e">{fmt0(stake)} stake earns <b><Roll value={pts} /> pts</b></span>
    </button>}
    <nav ref={navRef}
      onTouchStart={e => { setLensDrag(true); setLensI(idxFromX(e.touches[0].clientX)); }}
      onTouchMove={e => { setLensI(idxFromX(e.touches[0].clientX)); }}
      onTouchEnd={e => { setLensDrag(false); go(NAV_ORDER[idxFromX(e.changedTouches[0].clientX)]); }}
      onTouchCancel={e => { setLensDrag(false); go(NAV_ORDER[idxFromX(e.changedTouches[0].clientX)]); }}>
      <i className={'lens' + (lensDrag ? ' drag' : '')} style={{ left: `calc(5px + ${lensI} * ((100% - 10px) / 5))` }} aria-hidden="true">
        <span className="mag" style={{ left: `${-lensI * 100}%` }}>
          {TABS.map(([k, l, ic]) => <span className="mg" key={k}><Symbol name={ic} size={22} />{l}</span>)}
          <span className="mg"><span className="avatar">{initialsOf(d.profile?.display_name ?? 'You')}</span>Profile</span>
        </span>
      </i>
      {TABS.map(([k, l, ic]) => <button key={k} className={tab === k && !stockOpen && !lensDrag ? 'on' : ''} aria-label={l} onClick={() => go(k)}><Symbol name={ic} size={22} />{l}</button>)}
      <button className={tab === 'profile' && !stockOpen && !lensDrag ? 'on' : ''} aria-label="Profile" onClick={() => go('profile')}>
        <span className="avatar">{initialsOf(d.profile?.display_name ?? 'You')}{!d.broker?.connected && <i className="dot" />}</span>Profile
      </button>
    </nav>
    {!cart.length && <button className="fb" onClick={async () => { const t = prompt('What sucked? Be blunt.'); if (!t) return; await sb.from('feedback').insert({ user_id: session.user.id, text: t.slice(0, 500), screen: tab }); say('Sent. Thanks.'); }}>What sucked?</button>}
    <div className={'toast ' + (toast ? 'on' : '')}>{toast}</div>
    <Slip d={d} legs={slipOpen ? cart : []} stake={stake} setStake={setStake} onRemove={removeLeg} onClose={() => setSlipOpen(false)} say={say}
      brokerConnected={!!d.broker?.connected} onNeedBroker={() => setBrokerOpen(true)}
      onLocked={p => { setCart([]); setSlipOpen(false); setLockedPick(p); d.reload(); }} />
    <LockedSheet p={lockedPick} g={lockedPick ? gm[lockedPick.game_id] ?? null : null} d={d} say={say} onClose={() => setLockedPick(null)} />
    <BrokerSheet open={brokerOpen} current={d.broker} uid={session.user.id} onClose={() => setBrokerOpen(false)} onDone={() => { d.reload(); say('Connected (simulated)'); }} />
    <Reveals d={d} gm={gm} />
  </>;
}

/* ---------- board helpers ---------- */
const MKS: [string, string][] = [['spreads', 'Spread'], ['totals', 'Total'], ['h2h', 'Winner']];
const LEAGUE_ICONS: Record<string, string> = { All: 'sportscourt', NFL: 'football', NCAAF: 'football', NBA: 'basketball', NCAAB: 'basketball', MLB: 'baseball', NHL: 'puck' };
const shortName = (t: string) => t.split(' ').slice(-1)[0];
const spoken = (n: number) => (n > 0 ? 'plus ' : 'minus ') + Math.abs(n);
// Unmapped team (alias missing): first three letters as the abbreviation, mascot as short name. Never breaks a card.
const fallbackTeam = (name: string): TeamInfo => ({ abbreviation: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), short_name: shortName(name), ui_color: null });
const kickoffLabel = (k: Date) => {
  const now = new Date(); const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const day = k.toDateString() === now.toDateString() ? (k.getHours() >= 17 ? 'Tonight' : 'Today')
    : k.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : k.toLocaleDateString(undefined, { weekday: 'short' });
  return { day, time: k.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) };
};
const sameWeek = (iso: string) => { const a = new Date(iso), b = new Date(); const wk = (x: Date) => { const d = new Date(x); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; return wk(a) === wk(b); };
const ownedValue = (picks: Pick[], prices: Record<string, number>) =>
  picks.reduce((s, p) => s + (p.shares && prices[p.ticker] ? Number(p.shares) * prices[p.ticker] : Number(p.stake)), 0);

/** Live rules: the posted line holds 15 minutes past kickoff; a genuinely in-play line (fetched
 *  after kickoff by a live source) is lockable for 10 minutes from fetch. Mirrors lock_pick(). */
const LIVE_HOLD = 15 * 60e3;
const lockableLine = (g: Game, l: Line, now: number) => {
  if (g.completed) return false;
  const k = Date.parse(g.commence_time);
  if (k > now) return true;
  if (now - k < LIVE_HOLD) return true;
  const f = l.fetched_at ? Date.parse(l.fetched_at) : 0;
  return f > k && now - f < 10 * 60e3;
};

/* ---------- home: chrome, hero, promo, league-grouped board ---------- */
function Home({ d, uid, cart, onToggle, onCup, onStock, openId, setOpenId }: { d: ReturnType<typeof useData>; uid: string; cart: Leg[]; onToggle: (g: Game, l: Line) => void; onCup: () => void; onStock: (t: string) => void; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [league, setLeague] = useState('All'); const [filter, setFilter] = useState<'trending' | 'live'>('trending'); const [q, setQ] = useState('');
  const [propsFor, setPropsFor] = useState<string | null>(null); const [propLines, setPropLines] = useState<Line[]>([]);
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>({});
  const [hz, setHz] = useState(5);
  const [streakInfo, setStreakInfo] = useState(false);
  useLockBody(streakInfo);
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
  const invested = mine.reduce((s, p) => s + Number(p.stake), 0);
  const kept = invested - book; // what the same picks would have cost at a sportsbook so far
  const retPct = invested ? ((value - invested) / invested) * 100 : 0;
  const projAtH = (y: number) => mine.reduce((s, p) => { const st = d.stocks.find(x => x.ticker === p.ticker); const cur = p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : Number(p.stake); return s + projectSmart(cur, st?.avg_return_10y ?? 10, y); }, 0);
  const weekStaked = mine.filter(p => gm[p.game_id] && sameWeek(gm[p.game_id].commence_time)).reduce((s, p) => s + Number(p.stake), 0);
  const streak = d.profile?.streak ?? 0;
  const stockHits = query ? d.stocks.filter(x => x.ticker.toLowerCase().includes(query) || x.name.toLowerCase().includes(query)).slice(0, 5) : [];

  // Market grid: one row per side, Spread / Total / Winner, points leading every pill.
  // Pills stay tappable through the live hold window; a closed live market shows a lock.
  const mhead = <div className="mhead" aria-hidden="true"><span />{MKS.map(([k, l]) => <span key={k}>{l}</span>)}</div>;
  const grid = (g: Game) => {
    const myPicks = d.picks.filter(p => p.game_id === g.id);
    const started = Date.parse(g.commence_time) <= now;
    return <>
      {[g.away, g.home].map((name, i) => { const t = team(name); const sc = i === 0 ? g.away_score : g.home_score;
        const disp = started ? t.abbreviation : t.short_name.length > 10 ? t.abbreviation : t.short_name;
        return <div className="mrow" key={name}>
        <div className="tname" title={name}><span className="nm2">{disp}</span>{started && sc != null && <span className="scorechip">{sc}</span>}</div>
        {MKS.map(([mk]) => {
          const sel = mk === 'totals' ? (i === 0 ? 'Over' : 'Under') : name;
          const l = lineFor(g, mk, sel);
          const has = myPicks.find(p => p.market === mk && p.selection === sel); const opp = myPicks.find(p => p.market === mk && p.selection !== sel);
          const inCart = !!l && cart.some(x => legKey(x.line) === legKey(l));
          const lockedOut = !!l && !lockableLine(g, l, now);
          const tail = l ? `${basePoints(l.price)} points, ${spoken(l.price)}, ${Math.round(implied(l.price) * 100)} percent implied` : '';
          const label = !l ? `${mk === 'totals' ? sel : name}, no line` : lockedOut ? `${sel}, market locked`
            : mk === 'h2h' ? `${name}, ${tail}`
            : mk === 'spreads' ? `${name} ${spoken(l.point ?? 0)}, ${tail}`
            : `${sel} ${l.point}, ${tail}`;
          return <button key={mk} className={'mpill ' + (inCart ? 'sel' : has ? 'locked' : lockedOut ? 'lockout' : '')} disabled={!l || lockedOut || !!has || !!opp} aria-label={label} aria-pressed={inCart} onClick={e => { e.stopPropagation(); if (l) onToggle(g, l); }}>
            {!l ? <span className="sb">—</span> : lockedOut && !has ? <Symbol name="lock" size={20} /> : <>
              {mk !== 'h2h' && <span className="ln">{mk === 'totals' ? `${i === 0 ? 'O' : 'U'} ${l.point}` : pt(l.point)}</span>}
              <span className="pr">{oddsTxt(l.price)}</span>
            </>}
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

  const liveLine = (g: Game) => {
    const k = Date.parse(g.commence_time);
    const holdLeft = Math.ceil((LIVE_HOLD - (now - k)) / 60e3);
    return <><span className="livetag"><i className="ld" />{periodLabel(g)}</span>{holdLeft > 0 && <span>· lines hold {holdLeft} min</span>}</>;
  };
  const card = (g: Game) => {
    const k = new Date(g.commence_time); const started = k.getTime() <= now; const { day, time } = kickoffLabel(k);
    return <div key={g.id} className="game tap" onClick={() => { setOpenId(g.id); scrollTo(0, 0); }}>
      {grid(g)}{propsUi(g, started)}
      <div className="kick"><Symbol name="calendar" size={13} />{started ? liveLine(g) : `${day}, ${time}`}<span className="more-lines">More<Symbol name="chevron" size={12} /></span></div>
    </div>;
  };

  // Game page: back arrow, centered matchup, Popular grid, collapsible market sections with Stack badges.
  const openGame = openId ? d.games.find(g => g.id === openId) : null;
  if (openGame) {
    const g = openGame;
    const k = new Date(g.commence_time); const started = g.completed || k.getTime() <= now; const { day, time } = kickoffLabel(k);
    const myPicks = d.picks.filter(p => p.game_id === g.id);
    const pill = (mk: string, sel: string, i: number) => {
      const l = lineFor(g, mk, sel);
      const has = myPicks.find(p => p.market === mk && p.selection === sel); const opp = myPicks.find(p => p.market === mk && p.selection !== sel);
      const inCart = !!l && cart.some(x => legKey(x.line) === legKey(l));
      const label = l ? `${mk === 'totals' ? sel : sel} ${mk === 'h2h' ? '' : pt(l.point)}, ${basePoints(l.price)} points, ${spoken(l.price)}` : 'no line';
      return <button className={'mpill wide ' + (inCart ? 'sel' : has ? 'locked' : '')} disabled={!l || !lockableLine(g, l, now) || !!has || !!opp} aria-label={label} aria-pressed={inCart} onClick={() => l && onToggle(g, l)}>
        {l ? <>{mk !== 'h2h' && <span className="ln">{mk === 'totals' ? `${i === 0 ? 'O' : 'U'} ${l.point}` : pt(l.point)}</span>}
          <span className="pr">{oddsTxt(l.price)}</span></> : <span className="sb">—</span>}
      </button>;
    };
    const sec = (key: string, title: string, heads: [string, string], body: JSX.Element) => <div className="msec">
      <button className="msec-h" onClick={() => setSecOpen(s => ({ ...s, [key]: !(s[key] ?? false) }))}>
        <span className="t">{title}</span>
        <span className={'chev down' + ((secOpen[key] ?? false) ? ' open' : '')}><Symbol name="chevron" size={16} /></span>
      </button>
      {(secOpen[key] ?? false) && <div className="tcol"><div className="th">{heads[0]}</div><div className="th">{heads[1]}</div>{body}</div>}
    </div>;
    return <section className="view">
      <button className="back" aria-label="Back to the board" onClick={() => setOpenId(null)}><Symbol name="arrowleft" size={20} /></button>
      <div className="gp-title"><span>{team(g.away).short_name}</span><span className="at">@</span><span>{team(g.home).short_name}</span></div>
      <div className="gp-kick"><Symbol name="calendar" size={13} />{g.completed ? `Final · ${g.away_score}-${g.home_score}` : started ? liveLine(g) : `${day}, ${time}`}<span>· {g.league}</span></div>
      <div className="gp-sec">Popular</div>
      <div className="game">{mhead}{grid(g)}</div>
      {sec('spreads', 'Spread', [team(g.away).abbreviation, team(g.home).abbreviation], <>{pill('spreads', g.away, 0)}{pill('spreads', g.home, 1)}</>)}
      {sec('totals', 'Total Points', ['Over', 'Under'], <>{pill('totals', 'Over', 0)}{pill('totals', 'Under', 1)}</>)}
      {sec('h2h', 'Winner', [team(g.away).abbreviation, team(g.home).abbreviation], <>{pill('h2h', g.away, 0)}{pill('h2h', g.home, 1)}</>)}
      {ENABLE_PROPS && !started && <><div className="gp-sec">Player props</div><div className="game">{propsUi(g, started)}</div></>}
      <div className="disc">Alternate spread and total ladders and featured Stacks arrive when the lines source carries them. Odds lock the moment you tap Lock. Lines hold for the first 15 minutes after kickoff. Not affiliated with any league or team.</div>
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
      <button className={'chip slim ' + (filter === 'trending' && !query ? 'on' : '')} aria-pressed={filter === 'trending'} onClick={() => { setFilter('trending'); setQ(''); }}><Symbol name="chart" size={15} />Trending</button>
      <button className={'chip slim ' + (filter === 'live' && !query ? 'on' : '')} aria-pressed={filter === 'live'} onClick={() => { setFilter('live'); setQ(''); }}><Symbol name="live" size={15} />Live{live.length ? ` · ${live.length}` : ''}</button>
    </div>
    <div className="ltabs" role="tablist" aria-label="Leagues">
      {LEAGUES.map(l => <button key={l} role="tab" aria-selected={league === l && !query} className={league === l && !query ? 'on' : ''} onClick={() => { setLeague(l); setQ(''); }}>{l !== 'All' && <Symbol name={LEAGUE_ICONS[l]} size={16} />}{l}</button>)}
      {live.slice(0, 4).map(g => <button key={g.id} className="lvtab" onClick={() => { setOpenId(g.id); scrollTo(0, 0); }}><i className="ld" />{team(g.away).abbreviation} @ {team(g.home).abbreviation}</button>)}
    </div>

    <div className="tl2">
      <div className="tlc you">
        <div className="l">You own</div>
        <div className="v"><Roll value={value} format={fmt0} /></div>
        <div className="s">{d.profile?.weekly_cap ? `${fmt0(weekStaked)} of ${fmt0(Number(d.profile.weekly_cap))} staked this week` : `${fmt0(weekStaked)} staked this week`}</div>
        <button className="streakline" onClick={() => setStreakInfo(true)} aria-label="How streak multipliers work">
          {streak >= 1 ? `${streak} streak · next win ${fmtMult(streakMultiplier(streak + 1))}` : 'win to light a streak'}<Symbol name="info" size={13} />
        </button>
        <div className="fl" aria-label={`Streak ${streak}`}><Flame size={26} streak={streak} /><span className={streak >= 3 ? 'gold' : ''}>{streak}</span></div>
      </div>
      <div className="tlc book">
        <div className="l">A sportsbook</div>
        {kept > 0.005 ? <><div className="v">-{fmt(kept)}</div><div className="s">kept, gone forever. You invested it instead.</div></>
          : kept < -0.005 ? <><div className="v plus">+{fmt(-kept)}</div><div className="s">would be paying you so far. Your money bought stock either way.</div></>
          : mine.length ? <><div className="v">$0</div><div className="s">nothing settled yet. A miss here stays yours.</div></>
          : <><div className="v">$0</div><div className="s">keeps every missed stake. Here it buys stock instead.</div></>}
      </div>
    </div>
    {invested > 0 && <div className="proj5">
      <div className="row"><div className="l">In {hz} {hz === 1 ? 'year' : 'years'} this could be</div>
        <div className="hzp">{[1, 5, 10, 15].map(y => <button key={y} className={hz === y ? 'on' : ''} aria-pressed={hz === y} onClick={() => setHz(y)}>{y}y</button>)}</div></div>
      <div className="v">~<Roll value={projAtH(hz)} format={fmt0} /></div>
      <div className="s">a desk-style projection: hot streaks fade toward the market's long-run average · hypothetical, never advice</div>
    </div>}

    <Promo d={d} uid={uid} invested={invested} onCup={onCup} />

    {!upcoming.length && <div className="card"><div style={{ fontWeight: 700 }}>No lines yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Lines refresh every few hours. If this is a fresh install, the engine is still pulling the first slate.</p></div>}
    {query && !list.length && !stockHits.length && <div className="card"><div style={{ fontWeight: 700 }}>Nothing matches "{q.trim()}"</div><p className="hint" style={{ margin: '6px 0 0' }}>Try the team name, city, or a ticker, or clear the search.</p></div>}
    {filter === 'live' && !query && !live.length && <div className="card"><div style={{ fontWeight: 700 }}>Nothing in play right now</div><p className="hint" style={{ margin: '6px 0 0' }}>Check Trending for what starts next.</p></div>}

    {sections.map(([lg, gs]) => <div key={lg}>
      <div className="lg-head"><Symbol name={LEAGUE_ICONS[lg]} size={16} /><h3>{lg}</h3>
        {league === 'All' && gs.length > CAP && <button className="more" onClick={() => { setLeague(lg); scrollTo(0, 0); }}>View more lines<Symbol name="chevron" size={12} /></button>}
      </div>
      {mhead}
      {(league === 'All' ? gs.slice(0, CAP) : gs).map(card)}
    </div>)}

    {stockHits.length > 0 && <div>
      <div className="lg-head"><Symbol name="chart" size={16} /><h3>Stocks</h3></div>
      {stockHits.map(x => <StockRow key={x.ticker} s={x} price={d.prices[x.ticker]} onOpen={onStock} />)}
      <p className="hint">Back any pick and your stake can buy it.</p>
    </div>}

    <div className="disc">Lines come from one major sportsbook via public scoreboard data, refreshed hourly. Odds lock the moment you tap Lock. Team names identify games and are trademarks of their owners. Investibet is not affiliated with any league or team. Projections are hypothetical, never advice.</div>
    {streakInfo && <><div className="scrim open" onClick={() => setStreakInfo(false)} /><div className="sheet open">
      <div className="grab" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Flame size={30} streak={Math.max(streak, 3)} /><h3 style={{ fontSize: 22 }}>Streak multipliers</h3></div>
      <p className="hint" style={{ marginTop: 6 }}>Every consecutive win compounds your points another 20%, maxing out at 5x from the tenth win on. A miss resets it; the stock never resets.</p>
      <div className="posrows" style={{ marginTop: 6 }}>
        {Array.from({ length: 10 }, (_, k) => k + 1).map(n => <div key={n} className={'posrow' + (n === streak + 1 ? ' cur' : '')}>
          <span>Win #{n}{n === 10 ? '+' : ''} in a row{n === streak + 1 ? ' · your next win' : ''}</span>
          <b className="gold">{fmtMult(streakMultiplier(n))}{n === 10 ? ' max' : ''}</b>
        </div>)}
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => setStreakInfo(false)}>Done</button>
    </div></>}
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

/* ---------- slip: two steps, Hard Rock's way. Stake on the numpad, then the stock. ---------- */
function Slip({ d, legs, stake, setStake, onRemove, onClose, onLocked, say, brokerConnected, onNeedBroker }: {
  d: ReturnType<typeof useData>; legs: Leg[]; stake: number; setStake: (n: number) => void; onRemove: (i: number) => void;
  onClose: () => void; onLocked: (p: Pick) => void; say: (m: string) => void; brokerConnected: boolean; onNeedBroker: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [raw, setRaw] = useState('20');
  const [ticker, setTicker] = useState<string | null>(null);
  const [tier, setTier] = useState(0); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const open = legs.length > 0;
  useLockBody(open);
  useEffect(() => { if (open) { setStep(1); setTicker(null); setQ(''); setTier(0); setRaw(''); } }, [open]); // eslint-disable-line
  if (!open) return <><div className="scrim" /><div className="sheet" /></>;
  const single = legs.length === 1 ? legs[0] : null;
  const combined = stackOdds(legs.map(x => x.line.price));
  const basePts = stackPoints(legs.map(x => x.line.price));
  const streak = d.profile?.streak ?? 0;
  const nextMult = streakMultiplier(streak + 1);
  const points = Math.round(basePts * nextMult);
  const stakeN = Math.min(9999, parseFloat(raw) || 0);
  const push = (c: string) => setRaw(r => {
    let n = r;
    if (c === '<') n = r.slice(0, -1);
    else if (c === '.') { if (r.includes('.')) return r; n = r === '' ? '0.' : r + '.'; }
    else { if (/\.\d{2}$/.test(r)) return r; n = r === '0' ? c : r + c; if (n.replace(/\D/g, '').length > 4) return r; }
    setStake(Math.min(9999, parseFloat(n) || 0));
    return n;
  });
  const add = (v: number) => setRaw(r => { const n = Math.min(9999, Math.round(((parseFloat(r) || 0) + v) * 100) / 100); setStake(n); return String(n); });
  const s = d.stocks.find(x => x.ticker === ticker);
  const list = d.stocks.filter(x => q ? x.ticker.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()) : x.tier === tier).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const lock = async () => {
    if (!single || !ticker || stakeN < 2) return;
    if (!brokerConnected) return onNeedBroker();
    setBusy(true); localStorage.setItem('ib_stake', String(stakeN));
    const { data, error } = await sb.rpc('lock_pick', { p_game_id: single.game.id, p_market: single.line.market, p_selection: single.line.selection, p_stake: stakeN, p_ticker: ticker });
    setBusy(false); if (error) return say(error.message.replace(/^.*?: /, ''));
    navigator.vibrate?.(30); onLocked(data as Pick);
  };
  const liveTag = (g: Game) => Date.parse(g.commence_time) <= Date.now() && <b className="gold" style={{ fontSize: 11, marginLeft: 6 }}>LIVE</b>;
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    <button className="sheet-x" aria-label="Close and keep browsing" onClick={onClose}><Symbol name="xmark" size={15} /></button>
    {step === 1 ? <>
      {single ? <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 2, paddingRight: 40 }}>
        <button className="rm" aria-label="Remove pick" onClick={() => onRemove(0)}><Symbol name="xmark" size={13} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="side">{legLabel(single.line)} <span className="odds-acc">{oddsTxt(single.line.price)}</span>{liveTag(single.game)}</div>
          <div className="eyebrow">{MARKET_LABEL[single.line.market] ?? single.line.market} · to hit</div>
          <div className="meta">{single.game.away} @ {single.game.home} · the odds say a {Math.round(implied(single.line.price) * 100)}% chance</div>
        </div>
      </div> : <>
        <div className="slip-head" style={{ paddingRight: 40 }}><div className="t">{legs.length}-leg Stack</div><div className="o">{oddsTxt(combined)}</div></div>
        <div className="legs">{legs.map((x, i) => <div className="legrow" key={legKey(x.line)}>
          <div className="lx"><div className="n">{legLabel(x.line)}{liveTag(x.game)}</div><div className="s">{MARKET_LABEL[x.line.market] ?? x.line.market} · {x.game.away} at {x.game.home}</div></div>
          <div className="o">{oddsTxt(x.line.price)}</div>
          <button className="rm" aria-label="Remove leg" onClick={() => onRemove(i)}><Symbol name="xmark" size={14} /></button>
        </div>)}</div>
      </>}
      <div className="se" style={{ marginTop: 16 }}>
        <div><div className="l">Stake</div><div className={'sx' + (raw === '' ? ' empty' : '')}>{'$' + (raw === '' ? '0' : raw)}</div></div>
        <div><div className="l">Earns</div><div className="v mint">{points} pts</div>
          {streak >= 1 ? <div className="boost"><Flame size={14} streak={streak} />{basePts} {fmtMult(nextMult)} · your {streak}-streak bonus</div>
            : <div className="small" style={{ marginTop: 2 }}>plus the stock, win or miss</div>}</div>
      </div>
      <div className="disc" style={{ marginTop: 6 }}>Hit the pick and the points are yours, same at any stake. Every consecutive win compounds them another 20%, up to 5x.</div>
      <div className="quickadd">{[5, 10, 25].map(v => <button key={v} onClick={() => add(v)}>+${v}</button>)}</div>
      <div className="numpad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<'].map(k =>
        <button key={k} aria-label={k === '<' ? 'Delete' : k} onClick={() => push(k)}>{k === '<' ? <Symbol name="backspace" size={22} /> : k}</button>)}</div>
      {single ? <button className="btn" disabled={stakeN < 2} onClick={() => setStep(2)}>{stakeN >= 2 ? 'Continue to pick your stock' : 'Enter a stake, $2 minimum'}</button>
        : <>
          <button className="btn" disabled>Stacks lock in the next build</button>
          <div className="disc">One stake, one stock, every leg must hit. For now, trim to one leg to lock a single pick.</div>
        </>}
    </> : single && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 40 }}>
        <button className="back" aria-label="Back to the stake" onClick={() => setStep(1)}><Symbol name="arrowleft" size={18} /></button>
        <div style={{ minWidth: 0 }}>
          <div className="side" style={{ fontSize: 16 }}>{legLabel(single.line)} <span className="odds-acc">{oddsTxt(single.line.price)}</span></div>
          <div className="meta" style={{ marginTop: 2 }}>{fmt0(stakeN)} stake · earns {points} pts if it hits{streak >= 1 ? ` (${fmtMult(nextMult)} streak)` : ''}</div>
        </div>
      </div>
      <div style={{ fontWeight: 700, margin: '12px 0 6px' }}>What does your {fmt0(stakeN)} buy?</div>
      <div className="chips">{TIERS.map((t, i) => <button key={t} className={'chip slim ' + (tier === i && !q ? 'on' : '')} onClick={() => { setTier(i); setQ(''); }}>{t}</button>)}</div>
      <input className="search" placeholder="Search tickers" value={q} onChange={e => setQ(e.target.value)} />
      {list.map(x => <button key={x.ticker} className={'stockrow ' + (ticker === x.ticker ? 'sel' : '')} aria-pressed={ticker === x.ticker} onClick={() => setTicker(x.ticker)}>
        <span className="sdisc" aria-hidden="true">{x.ticker.slice(0, 2)}</span>
        <div><div className="tk">{x.ticker}</div><div className="nm">{x.name} · worst drop {x.max_drawdown}%</div></div>
        <div>{d.prices[x.ticker] ? <div className="pr">{fmt(d.prices[x.ticker])}</div> : null}<div className="ch">+{x.avg_return_10y}%/yr</div></div>
      </button>)}
      <div className="trio2">
        <div className="tc winc"><div className="l">Win</div><div className="v mint">{points} pts</div><div className="s">toward the pot</div></div>
        <div className="tc"><div className="l">Miss</div><div className="v">keep {fmt0(stakeN)}</div><div className="s">the stock stays yours</div></div>
        <div className="tc futc"><div className="l">In 5 years</div><div className={'v' + (s ? ' grad' : '')}>{s ? '~' + fmt0(projectSmart(stakeN, s.avg_return_10y, 5)) : 'pick one'}</div><div className="s">at past averages, faded</div></div>
      </div>
      {s && <div className="receipt">
        <div className="rc-h">Investibet · your slip</div>
        <div className="rc-r"><span>Pick</span><b>{legLabel(single.line)} {oddsTxt(single.line.price)}</b></div>
        <div className="rc-r"><span>Stake</span><b>{fmt0(stakeN)}</b></div>
        <div className="rc-r"><span>Buys</span><b>{s.ticker} · {s.name}</b></div>
        <div className="rc-d" />
        <div className="rc-r"><span>Hits</span><b className="mint">{points} pts + the stock</b></div>
        <div className="rc-r"><span>Misses</span><b>{fmt0(stakeN)} of {s.ticker}, still yours</b></div>
      </div>}
      <button className="btn" disabled={!ticker || busy} onClick={lock}>{busy ? 'Locking…' : !brokerConnected && ticker ? 'Connect brokerage to lock' : ticker ? 'Lock it in' : 'Pick a stock to lock'}</button>
      <div className="disc">Odds lock now. During beta the buy is simulated at the next market price. Lines are approximate 10-year averages and worst peak-to-trough drops. Not advice.</div>
    </>}
  </div></>;
}

/* ---------- locked in: the celebration sheet, the moment worth a screenshot ---------- */
function LockedSheet({ p, g, d, say, onClose }: { p: Pick | null; g: Game | null; d: ReturnType<typeof useData>; say: (m: string) => void; onClose: () => void }) {
  useLockBody(!!p);
  if (!p) return <><div className="scrim" /><div className="sheet" /></>;
  const stock = d.stocks.find(x => x.ticker === p.ticker);
  const kick = g ? kickoffLabel(new Date(g.commence_time)) : null;
  return <><div className="scrim open" onClick={onClose} /><div className="sheet open">
    <div className="grab" />
    <div className="lockmark"><Symbol name="check" size={28} /></div>
    <h2 style={{ fontSize: 26 }}>Locked in.</h2>
    <p className="hint" style={{ marginTop: 4 }}>{marketOpen(new Date()) ? `Buying ${p.ticker} now.` : `${p.ticker} buys at the next market open.`} Points land when the game goes final.</p>
    <div className="card" style={{ margin: '12px 0' }}>
      <div className="side" style={{ fontSize: 19 }}>{legLabel(p)} <span className="odds-acc">{oddsTxt(p.odds)}</span></div>
      <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit{p.live ? ' · locked live' : ''}</div>
      {g && <div className="meta">{g.away} @ {g.home}{kick ? ` · ${kick.day}, ${kick.time}` : ''}</div>}
      <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v mint">{earnsTxt(p)}</div></div></div>
      <div className="meta" style={{ marginTop: 10 }}>{fmt0(Number(p.stake))} of {p.ticker}{stock ? ` · ${stock.name}` : ''} · yours win or miss</div>
      <div className="pid-row"><span className="pid">ID {p.id.slice(0, 8)}<button aria-label="Copy pick ID" style={{ minHeight: 24, color: 'inherit' }} onClick={() => { navigator.clipboard?.writeText(p.id); say('Copied'); }}><Symbol name="copy" size={13} /></button></span></div>
    </div>
    {g && <button className="btn ghost" onClick={() => sharePick(p, g, say)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Symbol name="share" size={16} />Share with friends</span></button>}
    <div style={{ height: 8 }} />
    <button className="btn" onClick={onClose}>Done</button>
  </div></>;
}

/* ---------- brokerage (simulated) ---------- */
function BrokerSheet({ open, current, uid, onClose, onDone }: { open: boolean; current: Broker; uid: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'pick' | 'auth'>('pick'); const [prov, setProv] = useState(current?.provider ?? 'webull');
  useLockBody(open);
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
  p.status === 'won' ? `${Math.round(p.points)} pts` : p.status === 'pending' ? `${basePoints(p.odds)} pts` : p.status === 'lost' ? '—' : '0 pts';
const isLive = (p: Pick, g: Game) => p.status === 'pending' && !g.completed && new Date(g.commence_time) <= new Date();

function ScoreStrip({ g, teams }: { g: Game; teams: Record<string, TeamInfo> }) {
  const ab = (n: string) => (teams[n] ?? fallbackTeam(n)).abbreviation;
  return <div className="score"><span>{ab(g.away)}<span className="num">{g.away_score}</span></span><span className="lbl">Final Score</span><span><span className="num">{g.home_score}</span>{ab(g.home)}</span></div>;
}
const WonBand = () => <div className="wonband" aria-hidden="true"><span className="wm">{'INVESTIBET · WON · '.repeat(10)}</span><span className="tag">WON</span></div>;

/* Hard Rock's in-card score strip: abbr + score chips, live period and clock in the middle */
const periodLabel = (g: Game) => {
  if (!g.period) return 'LIVE';
  const u = g.league === 'MLB' ? 'Inning ' : g.league === 'NHL' ? 'Period ' : 'Q';
  return `${u}${g.period}${g.clock ? ` · ${g.clock}` : ''}`;
};
function ScoreBand({ g, teams, state, onEvent }: { g: Game; teams: Record<string, TeamInfo>; state: 'live' | 'final'; onEvent?: () => void }) {
  const ab = (n: string) => (teams[n] ?? fallbackTeam(n)).abbreviation;
  return <div className="scorestrip">
    <div className="ss-top">
      <span className="ss-side">{ab(g.away)}<span className="ss-num">{g.away_score ?? 0}</span></span>
      {state === 'live' ? <span className="livetag"><Symbol name="play" size={11} />{periodLabel(g)}</span> : <span className="ss-fin">Final</span>}
      <span className="ss-side"><span className="ss-num">{g.home_score ?? 0}</span>{ab(g.home)}</span>
    </div>
    {state === 'live' && g.down_distance && <div className="ss-dd">{g.down_distance}</div>}
    {state === 'live' && g.last_play && <div className="ss-play"><Symbol name="live" size={13} /><span>{g.last_play}</span></div>}
    {onEvent && <button className="ss-go" onClick={e => { e.stopPropagation(); onEvent(); }}><Symbol name="lines" size={14} />Go to game<Symbol name="chevron" size={12} /></button>}
  </div>;
}
const sharePick = async (p: Pick, g: Game, say: (m: string) => void) => {
  const txt = `${legLabel(p)} ${oddsTxt(p.odds)} · ${g.away} @ ${g.home}. ${fmt0(Number(p.stake))} of ${p.ticker} rides on it. Win: ${earnsTxt(p)}. Miss: the ${p.ticker} is still mine.`;
  try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(txt); say('Copied, ready to paste'); } catch { say('Could not copy'); }
};

function Picks({ d, gm, say, onEvent }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; say: (m: string) => void; onEvent: (gid: string) => void }) {
  const [tab, setTab] = useState<'all' | 'upcoming' | 'live' | 'finished' | 'won' | 'missed'>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const all = d.picks.filter(p => gm[p.game_id]);
  const lists: Record<typeof tab, Pick[]> = {
    all,
    upcoming: all.filter(p => p.status === 'pending' && !isLive(p, gm[p.game_id])),
    live: all.filter(p => isLive(p, gm[p.game_id])),
    finished: all.filter(p => p.status !== 'pending'),
    won: all.filter(p => p.status === 'won'),
    missed: all.filter(p => p.status === 'lost'),
  };
  const list = lists[tab];
  const EMPTY: Record<typeof tab, string> = {
    all: 'No picks yet. Head to Home and back a side.',
    upcoming: 'Nothing locked for later. The board is full of lines.',
    live: 'No picks in play right now.',
    finished: 'Nothing settled yet. Results land here when games go final.',
    won: 'No wins yet. The first one turns this screen green.',
    missed: 'No misses yet. When one lands, the stake still bought the stock.',
  };
  const sel = selId ? all.find(p => p.id === selId) ?? null : null;
  return <section className="view"><h2 style={{ fontSize: 22 }}>Picks</h2>
    <div className="tabs">{([['all', 'All'], ['upcoming', 'Upcoming'], ['live', 'Live'], ['finished', 'Finished'], ['won', 'Won'], ['missed', 'Missed']] as const).map(([k, l]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'live' && lists.live.length > 0 && <span className="tbadge">{lists.live.length}</span>}</button>)}</div>
    {!list.length ? <div className="empty"><Symbol name="ticket" size={56} /><p>{EMPTY[tab]}</p></div>
      : list.map(p => { const g = gm[p.game_id]; const won = p.status === 'won'; const live = isLive(p, g); const { day, time } = kickoffLabel(new Date(g.commence_time));
        const val = p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : null;
        return <div key={p.id} role="button" tabIndex={0} className={'pick tap ' + (won ? 'won' : p.status === 'lost' ? 'lost' : '')} onClick={() => setSelId(p.id)}>
          {won && <WonBand />}
          <div className="row" style={{ alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}><div className="side">{legLabel(p)}</div>
            <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit</div>
            {!live && <div className="meta">{g.away} @ {g.home}</div>}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}><span className="odds-acc" style={{ fontSize: 17 }}>{oddsTxt(p.odds)}</span>{!won && !live && statusChip(p, live)}</div></div>
          <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v">{earnsTxt(p)}</div>
            {won && Number(p.points) > basePoints(p.odds) * 1.01 && <div className="boost"><Flame size={19} streak={3} />{fmtMult(Number(p.points) / basePoints(p.odds))} streak boost</div>}</div></div>
          {live ? <ScoreBand g={g} teams={d.teams} state="live" onEvent={() => onEvent(g.id)} />
            : won && g.completed ? <ScoreStrip g={g} teams={d.teams} />
            : g.completed ? <ScoreBand g={g} teams={d.teams} state="final" />
            : <div className="kick"><Symbol name="calendar" size={13} />{`${day}, ${time}`}</div>}
          <div className={'meta ' + (p.filled_at ? 'mint' : '')} style={{ marginTop: 12 }}>{p.filled_at ? `Bought ${Number(p.shares).toFixed(4)} ${p.ticker} at ${fmt(Number(p.fill_price))}${val != null ? ` · now ${fmt(val)}` : ''}` : `${fmt0(Number(p.stake))} of ${p.ticker} · buys at next market open`}</div>
          <div className="pid-row">
            <span className="pid">ID {p.id.slice(0, 8)}<button aria-label="Copy pick ID" style={{ minHeight: 24, color: 'inherit' }} onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(p.id); say('Copied'); }}><Symbol name="copy" size={13} /></button></span>
            <button className="sharelink" onClick={e => { e.stopPropagation(); sharePick(p, g, say); }}><Symbol name="share" size={14} />Share</button>
          </div>
        </div>; })}
    <PickSheet p={sel} g={sel ? gm[sel.game_id] : null} d={d} say={say} onClose={() => setSelId(null)} onEvent={gid => { setSelId(null); onEvent(gid); }} />
  </section>;
}

/* ---------- pick detail sheet ---------- */
function PickSheet({ p, g, d, say, onClose, onEvent }: { p: Pick | null; g: Game | null; d: ReturnType<typeof useData>; say: (m: string) => void; onClose: () => void; onEvent: (gid: string) => void }) {
  const [arm, setArm] = useState(false);
  useLockBody(!!p);
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
      <div className="row" style={{ alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}><div className="side" style={{ fontSize: 20 }}>{legLabel(p)}</div>
        <div className="eyebrow">{MARKET_LABEL[p.market] ?? p.market} · to hit</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}><span className="odds-acc" style={{ fontSize: 18 }}>{oddsTxt(p.odds)}</span>{statusChip(p, live)}</div></div>
      <div className="meta" style={{ marginTop: 6 }}>{g.away} @ {g.home}</div>
      <div className="kick"><Symbol name="calendar" size={13} />{g.completed ? 'Final' : live ? <b>In play</b> : `${day}, ${time}`}<span>· {g.league}</span></div>
      <div className="se"><div><div className="l">Stake</div><div className="v">{fmt0(Number(p.stake))}</div></div><div><div className="l">Earns</div><div className="v">{earnsTxt(p)}</div></div></div>
      {live ? <ScoreBand g={g} teams={d.teams} state="live" onEvent={() => onEvent(g.id)} /> : g.completed ? <ScoreBand g={g} teams={d.teams} state="final" /> : null}
    </>}
    {won && Number(p.points) > basePoints(p.odds) * 1.01 && <div className="boost" style={{ marginTop: 8 }}><Flame size={19} streak={3} />{basePoints(p.odds)} base {fmtMult(Number(p.points) / basePoints(p.odds))} streak boost</div>}
    <div className="card" style={{ margin: '14px 0 10px' }}>
      <div style={{ fontWeight: 700 }}>{p.ticker}{stock ? ` · ${stock.name}` : ''}</div>
      <div className="meta" style={{ marginTop: 6 }}>{p.filled_at ? `Bought ${Number(p.shares).toFixed(4)} shares at ${fmt(Number(p.fill_price))}` : `${fmt0(Number(p.stake))} buys at the next market open`}</div>
      {val != null && <div className="meta mint" style={{ marginTop: 4 }}>Now worth {fmt(val)}</div>}
      <div className="small" style={{ marginTop: 8 }}>Yours win or miss. The stake never goes to a book.</div>
    </div>
    <div className="pid-row"><span className="pid">Pick ID {p.id.slice(0, 8)}<button style={{ minHeight: 24, color: 'var(--dim)' }} aria-label="Copy pick ID" onClick={() => { navigator.clipboard?.writeText(p.id); say('Copied'); }}><Symbol name="copy" size={13} /></button></span>
      <button className="sharelink" onClick={() => sharePick(p, g, say)}><Symbol name="share" size={14} />Share</button></div>
    {p.status === 'pending' && !live && <button className="btn danger" style={{ marginTop: 12 }} onClick={cancel}>{arm ? 'Tap again to cancel' : 'Cancel pick'}</button>}
    <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
  </div></>;
}

/* ---------- the cup: gold pot with a split donut ---------- */
const CUP_COLORS = ['#F5C451', '#4FE3A8', '#8B96FF', '#E560B6', '#3FB6C9', '#9AA0B2'];
function Donut({ parts, size = 132, stroke = 24, top, sub }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; top: string; sub: string }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  let acc = 0;
  return <div className="donutwrap" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pill)" strokeWidth={stroke} />
      {parts.map((p, i) => {
        const frac = p.value / total; const dash = Math.max(frac * C - 2.5, 0.01); const off = -acc * C; acc += frac;
        return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off} />;
      })}
    </svg>
    <div className="donutc"><b>{top}</b><span>{sub}</span></div>
  </div>;
}
function CupSection({ d, uid }: { d: ReturnType<typeof useData>; uid: string }) {
  const rows = d.lb.map(r => ({ id: r.user_id, points: Number(r.points ?? 0) })); const split = potSplit(rows, d.pot);
  const sorted = [...d.lb].sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0)); const mine = split[uid] ?? 0;
  const myPct = d.pot ? (mine / d.pot) * 100 : 0;
  const colorOf = (id: string, i: number) => (id === uid ? CUP_COLORS[0] : CUP_COLORS[(i % (CUP_COLORS.length - 2)) + 1]);
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((t, r) => t + (split[r.user_id] ?? 0), 0);
  const parts = [...top5.map((r, i) => ({ value: split[r.user_id] ?? 0, color: colorOf(r.user_id, i) })), ...(rest > 0 ? [{ value: rest, color: CUP_COLORS[5] }] : [])];
  return <>
    <div className="lg-head" style={{ marginTop: 18 }}><Symbol name="trophy" size={18} /><h3>The Cup</h3></div>
    <div className="pot pot2">
      <div className="row"><span className="potlbl"><Symbol name="trophy" size={16} />Monthly pot</span><span className="small">{new Date(month() + '-02').toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span></div>
      <div className="cuprow">
        {parts.length > 0 && <Donut parts={parts} top={`${myPct.toFixed(0)}%`} sub="yours" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="big goldgrad"><Roll value={d.pot} format={fmt0} /></div>
          {mine > 0 ? <div className="hint" style={{ margin: '4px 0 0' }}>You hold <b className="gold">{myPct.toFixed(1)}%</b> = <b className="gold">{fmt(mine)}</b> right now</div>
            : <div className="hint" style={{ margin: '4px 0 0' }}>Settle a pick this month to claim a slice</div>}
          <div className="small" style={{ marginTop: 8 }}>60% split by points, 40% to the top 10. Best 15 picks a week count.</div>
        </div>
      </div>
    </div>
    {sorted.length ? sorted.map((r, i) => <div key={r.user_id} className={'lrow ' + (r.user_id === uid ? 'me' : '')}>
      <span className="dt" style={{ background: i < 5 ? colorOf(r.user_id, i) : CUP_COLORS[5] }} />
      <div className="rk">{i + 1}</div>
      <div className="nm">{r.display_name} {r.streak >= 3 && <span className="flame"><Symbol name="flame" size={12} />{r.streak}</span>}</div>
      <div className="pt">{Math.round(Number(r.points ?? 0))}</div><div className="sh">{fmt0(split[r.user_id] ?? 0)}</div>
    </div>) : <p className="hint">Nobody has settled a pick this month yet.</p>}
  </>;
}

/* ---------- stock row and detail sheet (ROI patterns: Discover rows, big-number detail) ---------- */
const TIER_TAG = ['The favorite · steady', 'The value play · in between', 'The longshot · wild ride'];
function StockRow({ s, price, onOpen, right, dot }: { s: Stock; price?: number; onOpen: (t: string) => void; right?: { v: string; sub: string; dn?: boolean }; dot?: string }) {
  return <button className="stockrow" onClick={() => onOpen(s.ticker)}>
    <span className="sdisc" aria-hidden="true" style={dot ? { boxShadow: `inset 0 0 0 2px ${dot}` } : undefined}>{s.ticker.slice(0, 2)}</span>
    <div><div className="tk">{s.ticker}</div><div className="nm">{s.name}</div></div>
    {right ? <div><div className="pr">{right.v}</div><div className={'ch' + (right.dn ? ' dn' : '')}>{right.sub}</div></div>
      : <div>{price ? <div className="pr">{fmt(price)}</div> : null}<div className="ch">+{s.avg_return_10y}%/yr</div></div>}
  </button>;
}

const RANGES: [string, number, string][] = [['1M', 32, 'Past month'], ['3M', 95, 'Past 3 months'], ['1Y', 370, 'Past year'], ['5Y', 1900, 'Past 5 years']];
function StockPage({ ticker, d, gm, onClose }: { ticker: string; d: ReturnType<typeof useData>; gm: Record<string, Game>; onClose: () => void }) {
  const [range, setRange] = useState(1); const [pat, setPat] = useState<number | null>(null);
  const [years, setYears] = useState(5); const [at, setAt] = useState<number | null>(null);
  const { hist, failed } = useHistory(ticker);
  useEffect(() => { setRange(1); setYears(5); setAt(null); setPat(null); }, [ticker]);
  const s = d.stocks.find(x => x.ticker === ticker);
  if (!s) return null;
  const [, days, rangeLabel] = RANGES[range];
  const cutoff = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const slice = hist ? thin(hist.filter(p => p[0] >= cutoff)) : null;
  const priceVals = slice ? slice.map(p => p[1]) : [];
  const haveChart = slice != null && priceVals.length > 1;
  const latest = d.prices[s.ticker] ?? (hist?.length ? hist[hist.length - 1][1] : undefined);
  const up = haveChart && priceVals[priceVals.length - 1] >= priceVals[0];
  const chg = haveChart ? priceVals[priceVals.length - 1] - priceVals[0] : 0;
  const chgPct = haveChart && priceVals[0] ? (chg / priceVals[0]) * 100 : 0;
  const pai = pat != null && slice && pat < slice.length ? pat : priceVals.length - 1;
  const scrubbing = pat != null && slice != null;
  const dateLbl = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  const held = d.picks.filter(p => gm[p.game_id] && p.ticker === s.ticker && p.filled_at && p.shares);
  const shares = held.reduce((t, p) => t + Number(p.shares), 0);
  const cost = held.reduce((t, p) => t + Number(p.stake), 0);
  const val = latest ? shares * latest : cost;
  const firstBuy = held.length ? held.reduce((m, p) => (p.filled_at! < m ? p.filled_at! : m), held[0].filled_at!) : null;
  const totalOwned = ownedValue(d.picks.filter(p => gm[p.game_id]), d.prices);
  const curve = Array.from({ length: years + 1 }, (_, i) => projectSmart(100, s.avg_return_10y, i));
  const ai = at ?? years;
  return <section className="view">
    <div className="row"><button className="back" aria-label="Back" onClick={onClose}><Symbol name="arrowleft" size={20} /></button><span className={`tag t${s.tier}`}>{(TIER_TAG[s.tier] ?? '').split(' · ')[0]}</span></div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="sdisc big" aria-hidden="true">{s.ticker.slice(0, 2)}</span>
      <div><div className="side" style={{ fontSize: 20 }}>{s.ticker}</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.name}</div></div></div>
    {latest != null && <div className="sp-price"><Roll value={scrubbing ? slice![pai][1] : latest} format={n => fmt(n)} /></div>}
    {haveChart && <div className={'sp-change ' + (up ? 'up' : 'dn')}>
      <b><Symbol name={up ? 'uptri' : 'downtri'} size={14} />{fmt(Math.abs(chg))} ({Math.abs(chgPct).toFixed(1)}%)</b>
      <span>· {scrubbing ? dateLbl(slice![pai][0]) : rangeLabel.toLowerCase()}</span>
    </div>}
    {haveChart ? <>
      <LineChart fit series={[{ color: up ? 'var(--mint)' : 'var(--coral)', vals: priceVals, area: true }]} n={priceVals.length} active={pai} onActive={setPat} onRelease={() => setPat(null)} cursor={pat != null}
        xLabels={[dateLbl(slice![0][0]), 'Now']} label={`${s.ticker} price, ${rangeLabel.toLowerCase()}`} />
      <div className="chips">{RANGES.map(([l], i) => <button key={l} className={'chip ' + (range === i ? 'on' : '')} onClick={() => { setRange(i); setPat(null); }}>{l}</button>)}</div>
    </> : failed ? <div className="card calm"><div style={{ fontWeight: 700 }}>The price chart is warming up</div><p className="hint" style={{ margin: '6px 0 0' }}>History for {s.ticker} appears once the engine serves it. Everything below is live.</p></div>
      : <div className="card"><p className="hint" style={{ margin: 0 }}>Drawing the chart…</p></div>}
    <div className="row" style={{ marginTop: 6 }}>
      <span className="small">10-yr avg return <b className="mint">+{s.avg_return_10y}%/yr</b></span>
      <span className="small">worst drop <b>{s.max_drawdown}%</b></span>
    </div>
    {shares > 0 && <>
      <div className="gp-sec">Your position</div>
      <div className="posrows">
        <div className="posrow"><span>Quantity</span><b>{shares.toFixed(4)}</b></div>
        <div className="posrow"><span>Market value</span><b>{fmt(val)}</b></div>
        <div className="posrow"><span>Avg purchase price</span><b>{fmt(cost / shares)}</b></div>
        {firstBuy && <div className="posrow"><span>First purchase</span><b>{new Date(firstBuy).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></div>}
        {totalOwned > 0 && <div className="posrow"><span>Share of portfolio</span><b>{Math.round((val / totalOwned) * 100)}%</b></div>}
        <div className="posrow"><span>All-time</span><b className={val - cost >= 0 ? 'mint' : 'coral'}>{val - cost >= 0 ? '+' : ''}{fmt(val - cost)} ({cost ? Math.abs(((val - cost) / cost) * 100).toFixed(1) : '0.0'}%)</b></div>
      </div>
    </>}
    <div className="gp-sec">If it keeps its 10-year average</div>
    <div className="readout">$100 becomes ~<b className="mint"><Roll value={projectSmart(100, s.avg_return_10y, ai)} format={fmt0} /></b> after {ai} {ai === 1 ? 'year' : 'years'}</div>
    <LineChart series={[{ color: 'var(--mint)', vals: curve, area: true }]} n={years + 1} active={ai} onActive={setAt} onRelease={() => setAt(null)} cursor={at != null} xLabels={['Now', `${years} yrs`]} label={`Projection of $100 in ${s.ticker} over ${years} years`} />
    <div className="chips">{[1, 5, 10, 15].map(y => <button key={y} className={'chip ' + (years === y ? 'on' : '')} onClick={() => { setYears(y); setAt(null); }}>{y} yr</button>)}</div>
    <div className="disc">Hypothetical. Projections shrink a hot decade's edge by half and fade the rest toward the market's long-run ~8%/yr, the way a fading-growth model would; nothing compounds at 70% forever. Worst drop is peak-to-trough. Past prices and returns do not predict future results. Investibet never recommends a stock; any pick can be backed with any stock on the board. Not advice.</div>
  </section>;
}

/* ---------- owned: Roi's dashboard anatomy. Borderless hero, full-bleed worth chart with a dashed future, hairline groups. ---------- */
const ALLOC = ['var(--mint)', 'var(--peri)', 'var(--gold)', '#E560B6', '#3FB6C9', '#8E8E93'];
const HORIZONS = [1, 5, 10, 15];
function Owned({ d, gm, onStock }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; onStock: (t: string) => void }) {
  const [at, setAt] = useState<number | null>(null); const [horizon, setHorizon] = useState(5);
  const [hide, setHide] = useState(() => localStorage.getItem('ib_hide') === '1');
  const toggleHide = () => { localStorage.setItem('ib_hide', hide ? '0' : '1'); setHide(!hide); };
  const mask = (s: string) => (hide ? '$••••' : s);
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
  const move = value - staked;
  const movePct = staked ? (move / staked) * 100 : 0;

  // Solid line: your money pick by pick, ending at today's value. Dashed: today grown at each holding's 10-yr average.
  const chrono = [...mine].sort((a, b) => a.locked_at.localeCompare(b.locked_at));
  const ownedPts = [0]; const bookPts = [0]; let oc = 0, bc = 0;
  for (const p of chrono) { oc += Number(p.stake); bc += Number(p.stake) + counterfactualDelta(Number(p.stake), p.odds, p.status as 'won' | 'lost' | 'push' | 'void' | 'pending'); ownedPts.push(oc); bookPts.push(bc); }
  ownedPts.push(value); bookPts.push(bc);
  const projAt = (y: number) => holdings.reduce((s, h) => s + projectSmart(h.value, h.stock?.avg_return_10y ?? 10, y), 0)
    + pending.reduce((s, p) => s + projectSmart(Number(p.stake), d.stocks.find(x => x.ticker === p.ticker)?.avg_return_10y ?? 10, y), 0);
  const FUT = 8;
  const future = Array.from({ length: FUT + 1 }, (_, k) => projAt((horizon * k) / FUT));
  const n = ownedPts.length + FUT;
  const ti = ownedPts.length - 1;
  const ai = Math.min(at ?? ti, n - 1);
  const futYears = ai > ti ? (horizon * (ai - ti)) / FUT : 0;
  const aOwn = ai <= ti ? ownedPts[ai] : future[ai - ti];
  const ptLabel = ai === 0 ? 'At the start' : ai === ti ? 'Today' : ai < ti ? `After pick ${ai}` : `In ~${futYears < 1 ? Math.round(futYears * 12) + ' months' : (Math.round(futYears * 10) / 10) + ' years'}`;
  const keptNow = staked - bc;
  const lostPicks = mine.filter(p => p.status === 'lost');
  const wonPicks = mine.filter(p => p.status === 'won');
  const pendingPicks = mine.filter(p => p.status === 'pending');
  const lostStake = lostPicks.reduce((s, p) => s + Number(p.stake), 0);
  const lostVal = lostPicks.reduce((s, p) => s + (p.shares && d.prices[p.ticker] ? Number(p.shares) * d.prices[p.ticker] : Number(p.stake)), 0);
  const wonPts = Math.round(wonPicks.reduce((s, p) => s + Number(p.points), 0));

  const allocTotal = holdings.reduce((s, h) => s + h.value, 0) + pending.reduce((s, p) => s + Number(p.stake), 0);

  return <section className="view">
    <div className="ox-head">
      <div>
        <div className="ox-label">Invest</div>
        <div className="ox-value"><Roll value={value} format={n2 => mask(fmt(n2))} /></div>
        {mine.length > 0 && <div className={'sp-change ' + (move >= 0 ? 'up' : 'dn')}>
          <b><Symbol name={move >= 0 ? 'uptri' : 'downtri'} size={14} />{mask(fmt(Math.abs(move)))} ({Math.abs(movePct).toFixed(1)}%)</b>
          <span>· since you staked it</span>
        </div>}
      </div>
      <button className="back" aria-label={hide ? 'Show amounts' : 'Hide amounts'} onClick={toggleHide}><Symbol name={hide ? 'eyeslash' : 'eye'} size={20} /></button>
    </div>
    {mine.length > 0 ? <>
        <div className="bleed">
          <WorthChart past={ownedPts} future={future} active={ai} onActive={setAt} onRelease={() => setAt(null)} cursor={at != null} endLabel={`≈${mask(fmt0(future[FUT]))}`} />
        </div>
        <div className="chips">{HORIZONS.map(h => <button key={h} className={'chip slim ' + (horizon === h ? 'on' : '')} onClick={() => { setHorizon(h); setAt(null); }}>+{h} {h === 1 ? 'year' : 'years'}</button>)}</div>
        <div className="readout">{ptLabel}: {ai > ti && '~'}{mask(fmt0(aOwn))} {ai > ti && <span className="sub" style={{ display: 'inline' }}>at 10-yr averages</span>}</div>
        <div className="disc" style={{ marginTop: 6 }}>Dashed: a desk-style projection at your stocks' faded past averages. Tap to walk the line. Hypothetical, never advice.</div>
        <div className="vsbook">
          <div className="vb-t">If this were a sportsbook</div>
          <div className="vb-face">
            <div className="vb-cell book">
              <div className="l">{keptNow >= -0.005 ? 'Gone to the book by now' : 'A book would be up'}</div>
              <div className="v">{keptNow > 0.005 ? `-${fmt(keptNow)}` : keptNow < -0.005 ? `+${fmt(-keptNow)}` : '$0'}</div>
              <div className="s">{keptNow > 0.005 ? 'kept from your stakes' : keptNow < -0.005 ? 'paying you, for now' : 'nothing settled yet'}</div>
            </div>
            <div className="vb-cell you">
              <div className="l">Invested instead</div>
              <div className="v">{mask(fmt0(staked))}</div>
              <div className="s">{movePct >= 0 ? '+' : ''}{movePct.toFixed(1)}% so far · ~{mask(fmt0(projAt(5)))} in 5 years</div>
            </div>
          </div>
          {(lostPicks.length > 0 || wonPicks.length > 0 || pendingPicks.length > 0) && <div className="vb-rows">
            {lostPicks.length > 0 && <div className="vb-li"><b>{lostPicks.length} missed</b> · a book keeps <b className="coral">{fmt0(lostStake)}</b> · here you own <b className="mint">{fmt0(lostVal)}</b> of that stock</div>}
            {wonPicks.length > 0 && <div className="vb-li"><b>{wonPicks.length} won</b> · <b className="mint">{wonPts} pts</b> toward the pot · the stock stays invested and growing</div>}
            {pendingPicks.length > 0 && <div className="vb-li"><b>{pendingPicks.length} pending</b> · {fmt0(pendingPicks.reduce((s, p) => s + Number(p.stake), 0))} riding either way</div>}
          </div>}
        </div>

        {allocTotal > 0 && <div className="alloc" aria-hidden="true">
          {holdings.map((h, i) => <span key={h.ticker} style={{ width: `${(h.value / allocTotal) * 100}%`, background: ALLOC[Math.min(i, ALLOC.length - 1)] }} />)}
          {pending.length > 0 && <span style={{ width: `${(pending.reduce((s, p) => s + Number(p.stake), 0) / allocTotal) * 100}%`, background: 'var(--line)' }} />}
        </div>}
        <div className="lg-head" style={{ marginTop: 8 }}><h3>Holdings</h3><span className="small" style={{ marginLeft: 'auto' }}>{mask(fmt0(staked))} staked · {mine.length} picks</span></div>
        {holdings.map((h, i) => <StockRow key={h.ticker} s={h.stock ?? { ticker: h.ticker, name: '', tier: 0, avg_return_10y: 10, max_drawdown: 0 }} onOpen={onStock} dot={ALLOC[Math.min(i, ALLOC.length - 1)]}
          right={{ v: mask(fmt(h.value)), sub: `${h.value - h.cost >= 0 ? '+' : ''}${fmt(h.value - h.cost)}`, dn: h.value - h.cost < 0 }} />)}
        {!holdings.length && <p className="hint">Your buys land here at the next market open.</p>}
        {pending.length > 0 && <>
          <div className="lg-head"><h3>Buying at next open</h3></div>
          {pending.map(p => <div key={p.id} className="pendrow"><span className="sdisc">{p.ticker.slice(0, 2)}</span><span className="tk">{p.ticker}</span><span className="small" style={{ marginLeft: 'auto' }}>{fmt0(Number(p.stake))} queued</span></div>)}
        </>}
    </> : <div className="card calm"><div style={{ fontWeight: 700 }}>Nothing invested yet</div><p className="hint" style={{ margin: '6px 0 0' }}>Back a pick on Home. Win or miss, the stake buys stock that shows up here. The Stocks tab has every ticker to read up on first.</p></div>}
  </section>;
}

/* ---------- stocks tab: Roi's discover. Search lives with the stocks. ---------- */
function StocksTab({ d, onStock }: { d: ReturnType<typeof useData>; onStock: (t: string) => void }) {
  const [q, setQ] = useState(''); const [lane, setLane] = useState(0);
  const query = q.trim().toLowerCase();
  const results = query ? d.stocks.filter(x => x.ticker.toLowerCase().includes(query) || x.name.toLowerCase().includes(query)).sort((a, b) => a.ticker.localeCompare(b.ticker)).slice(0, 20) : [];
  return <section className="view">
    <div className="ox-head"><div><div className="ox-label">Stocks</div></div></div>
    <div className="searchbar" style={{ marginTop: 8 }}><Symbol name="magnifyingglass" size={16} /><input className="search" placeholder="Find a stock" aria-label="Find a stock" value={q} onChange={e => setQ(e.target.value)} /></div>
    {query ? <>
      {results.length ? results.map(x => <StockRow key={x.ticker} s={x} price={d.prices[x.ticker]} onOpen={onStock} />)
        : <div className="empty"><Symbol name="magnifyingglass" size={48} /><p>Nothing matches "{q.trim()}". Try the ticker or the name.</p></div>}
    </> : <>
      <div className="chips" style={{ marginTop: 4 }}>{TIERS.map((t, i) => <button key={t} className={'chip ' + (lane === i ? 'on' : '')} onClick={() => setLane(i)}>{t}</button>)}</div>
      {d.stocks.filter(x => x.tier === lane).sort((a, b) => a.ticker.localeCompare(b.ticker)).map(x => <StockRow key={x.ticker} s={x} price={d.prices[x.ticker]} onOpen={onStock} />)}
    </>}
    <div className="disc">Alphabetical, never ranked by return. Investibet never recommends a stock; any pick can be backed with any of these.</div>
  </section>;
}

/* ---------- profile ---------- */
function ProfileTab({ d, gm, uid, say, onBroker }: { d: ReturnType<typeof useData>; gm: Record<string, Game>; uid: string; say: (m: string) => void; onBroker: () => void }) {
  const [how, setHow] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ib_theme') ?? 'auto');
  const pickTheme = (t: string) => { localStorage.setItem('ib_theme', t); setTheme(t); window.dispatchEvent(new Event('ib-theme')); };
  const [editName, setEditName] = useState(false); const [nameDraft, setNameDraft] = useState('');
  const [calc, setCalc] = useState(false); const [coIdx, setCoIdx] = useState(8); const [coStreak, setCoStreak] = useState(0);
  useLockBody(calc);
  const saveName = async () => {
    const v = nameDraft.trim().slice(0, 30);
    if (v.length < 2) return say('2 characters minimum');
    await sb.from('profiles').update({ display_name: v }).eq('id', d.profile!.id);
    setEditName(false); say('Name updated'); d.reload();
  };
  const [pw, setPw] = useState(''); const [pwBusy, setPwBusy] = useState(false);
  const savePw = async () => {
    if (pw.length < 8) return say('8 characters minimum');
    setPwBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setPwBusy(false);
    say(error ? error.message : 'Password set. Next sign-in can skip the email.');
    if (!error) setPw('');
  };
  const name = d.profile?.display_name ?? 'You';
  const mine = d.picks.filter(p => gm[p.game_id]);
  const value = ownedValue(mine, d.prices);
  const wins = mine.filter(p => p.status === 'won').length, losses = mine.filter(p => p.status === 'lost').length;
  const monthPts = Math.round(mine.filter(p => p.counted).reduce((s, p) => s + Number(p.points), 0));
  const invested = mine.reduce((t, p) => t + Number(p.stake), 0);
  return <section className="view">
    {(() => { const w = name.trim().split(/\s+/); const first = w[0] ?? 'You'; const rest = w.slice(1).join(' ');
      const joined = d.profile?.created_at ? new Date(d.profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
      return <div className="pf-head">
        <div style={{ minWidth: 0 }}>
          <span className="pf-chip">{first.toUpperCase()}</span>
          <div className="pf-last">{(rest || 'INVESTOR').toUpperCase()}</div>
          <div className="pf-joined">{joined ? `JOINED ${joined.toUpperCase()}` : 'PRIVATE BETA'}</div>
        </div>
        <div className="pf-av">
          <span className="avatar big" style={{ width: 76, height: 76, fontSize: 24 }}>{initialsOf(name)}</span>
          <button className="pf-edit" aria-label="Edit display name" onClick={() => { setNameDraft(name); setEditName(e => !e); }}><Symbol name="pencil" size={16} /></button>
        </div>
      </div>; })()}
    {editName && <div className="card"><div style={{ fontWeight: 700 }}>Display name</div>
      <div className="row" style={{ marginTop: 10 }}>
        <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={30} style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--line)', outline: 'none' }} aria-label="Display name" />
        <button className="btn sm" onClick={saveName}>Save</button>
      </div></div>}
    <div className="card">
      <div className="small">Owned</div>
      <div className="big" style={{ margin: '4px 0' }}><Roll value={value} format={fmt0} /></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onBroker}>{d.broker?.connected ? `${BROKERS.find(b => b[0] === d.broker!.provider)?.[1]} connected (simulated)` : 'Open brokerage (simulated)'}</button>
        <button className="btn ghost sm" onClick={() => setHow(h => !h)}>How it works</button>
      </div>
      {how && <p className="hint" style={{ marginTop: 10 }}>Every stake buys real stock in your own brokerage account. Win and you earn points toward the pot. Miss and the streak resets, but the stock stays yours. Investibet never holds your money and never recommends a stock.</p>}
    </div>
    {(() => {
      const season = Math.round(mine.reduce((t, p) => t + Number(p.points), 0));
      const cur = rankFor(season); const nxt = nextRank(season);
      const frac = nxt ? Math.min(1, (season - cur[1]) / (nxt[1] - cur[1])) : 1;
      const end = new Date(); const potEnd = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      const left = potEnd.getTime() - Date.now(); const dd = Math.floor(left / 86400e3); const hh = Math.floor((left % 86400e3) / 3600e3);
      return <div className="card rankcard" style={{ borderColor: cur[2] }}>
        <div className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="rankshield" style={{ background: cur[2] }}><Symbol name="medal" size={22} /></span>
            <div><div className="rankname" style={{ color: cur[2] }}>{cur[0].toUpperCase()}</div>
              <div className="small">{wins} won · {losses} missed · {monthPts} pts this month</div></div>
          </div>
          <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, fontSize: 22 }}>{season}</div><div className="small">season pts</div></div>
        </div>
        {nxt ? <>
          <div className="rankbar"><i style={{ width: `${Math.max(3, frac * 100)}%`, background: cur[2] }} /></div>
          <div className="small" style={{ marginTop: 6 }}>{nxt[1] - season} pts to {nxt[0]} · tiers only climb, never reset</div>
        </> : <div className="small" style={{ marginTop: 10 }}>Top tier. It never resets.</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <span className="small"><b className="gold">Pot drops in {dd}d {hh}h</b> · {fmt0(d.pot)} this month</span>
          <button className="btn ghost sm" onClick={() => setCalc(true)}>How points earn</button>
        </div>
        <div className="badges">
          {RANKS.map(([n, min, c]) => <span key={n} className={'bdg' + (season >= min ? ' on' : '')} style={season >= min ? { background: c } : undefined}>
            {season >= min ? <Symbol name="medal" size={12} /> : <Symbol name="lock" size={11} />}{n}</span>)}
          {[100, 500, 1000].map(m => <span key={m} className={'bdg' + (invested >= m ? ' on mintb' : '')}>
            {invested >= m ? <Symbol name="check" size={12} /> : <Symbol name="lock" size={11} />}{fmt0(m)} invested</span>)}
        </div>
      </div>; })()}
    <CupSection d={d} uid={uid} />
    <div className="card">
      <div style={{ fontWeight: 700 }}>Appearance</div>
      <div className="seg" style={{ marginTop: 10, marginBottom: 0 }}>{(['auto', 'light', 'dark'] as const).map(t =>
        <button key={t} className={theme === t ? 'on' : ''} onClick={() => pickTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    </div>
    <div className="card">
      <div style={{ fontWeight: 700 }}>Sign-in password</div>
      <div className="small" style={{ marginTop: 4 }}>Set one once and skip the email code next time. 8 characters or more.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--line)', outline: 'none' }} aria-label="New password" />
        <button className="btn sm" disabled={pwBusy || pw.length < 8} onClick={savePw}>{pwBusy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
    {calc && <><div className="scrim open" onClick={() => setCalc(false)} /><div className="sheet open">
      <div className="grab" />
      <h3 style={{ fontSize: 22 }}>Earning points</h3>
      <p className="hint" style={{ marginTop: 4 }}>Slide the odds and your streak. Stake size never changes points.</p>
      {(() => { const odds = ODDS_STEPS[coIdx]; const base = basePoints(odds); const m = streakMultiplier(coStreak + 1); const total = Math.round(base * m);
        return <>
          <div className="se" style={{ marginTop: 10 }}>
            <div><div className="l">A win earns</div><div className="v mint">{total} pts</div><div className="small" style={{ marginTop: 2 }}>{base} base {coStreak >= 1 ? `${fmtMult(m)} streak` : '· no streak yet'}</div></div>
            <div><div className="l">Toward</div><div className="v">the pot</div><div className="small" style={{ marginTop: 2 }}>best 15 a week count</div></div>
          </div>
          <div className="calcrow"><span>Odds</span><b>{oddsTxt(odds)}</b></div>
          <input type="range" min={0} max={ODDS_STEPS.length - 1} step={1} value={coIdx} onChange={e => setCoIdx(+e.target.value)} aria-label="Odds" />
          <div className="calcrow"><span>Current streak</span><b>{coStreak} {coStreak > 0 && <Flame size={14} streak={coStreak} />}</b></div>
          <input type="range" min={0} max={10} step={1} value={coStreak} onChange={e => setCoStreak(+e.target.value)} aria-label="Streak" />
          <div className="disc">Points are the American odds on a flat $100 basis. Each consecutive win compounds them 20%, capped at 5x from the tenth win. Multipliers apply when the pick settles.</div>
        </>; })()}
      <button className="btn" style={{ marginTop: 10 }} onClick={() => setCalc(false)}>Got it</button>
    </div></>}
    <button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
    <div className="disc">Investibet never holds your money, never places trades for you, and never recommends a stock. Lines shown are informational. Free, private, invite-only beta.</div>
    <div className="small" style={{ textAlign: 'center', margin: '16px 0' }}>Beta 0.2</div>
  </section>;
}

/* ---------- confetti: streak and invested milestones only, never plain opens ---------- */
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 56 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.45, dur: 1.1 + Math.random() * 0.9,
    color: ['#19B37B', '#F5C451', '#6B7CF5', '#F3BBFF'][i % 4], rot: Math.random() * 360, scale: 0.7 + Math.random() * 0.8,
  })), []);
  return <div className="confetti" aria-hidden="true">{pieces.map((p, i) =>
    <i key={i} style={{ left: p.left + '%', background: p.color, animationDelay: p.delay + 's', animationDuration: p.dur + 's', transform: `rotate(${p.rot}deg) scale(${p.scale})` }} />)}</div>;
}

/* ---------- reveals ---------- */
function Reveals({ d, gm }: { d: ReturnType<typeof useData>; gm: Record<string, Game> }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('ib_seen') || '[]'))); const [cur, setCur] = useState<Pick | null>(null); const [phase, setPhase] = useState<'wait' | 'show'>('wait');
  const queue = d.picks.filter(p => p.status !== 'pending' && !seen.has(p.id) && gm[p.game_id]);
  useLockBody(!!cur);
  useEffect(() => { if (!cur && queue.length) { setCur(queue[0]); setPhase('wait'); } }, [queue.length, cur]);
  // The timer gets its own effect: keyed on the queue it was cancelled by its own state update, leaving the reveal stuck on "Final…"
  useEffect(() => { if (!cur || phase !== 'wait') return; const t = setTimeout(() => { setPhase('show'); navigator.vibrate?.([30, 40, 60]); }, 1300); return () => clearTimeout(t); }, [cur, phase]);
  if (!cur) return null;
  const g = gm[cur.game_id]; const won = cur.status === 'won', push = cur.status === 'push' || cur.status === 'void';
  const label = cur.market === 'prop' ? cur.selection.split('|')[0] : cur.selection + (cur.market === 'h2h' ? '' : ' ' + pt(cur.point));
  const next = () => { const s = new Set(seen); s.add(cur.id); localStorage.setItem('ib_seen', JSON.stringify([...s])); setSeen(s); setCur(null); };
  const streakNow = d.profile?.streak ?? 0;
  return <div className="reveal" onClick={() => phase === 'wait' && setPhase('show')}>
    {phase === 'show' && won && (streakNow === 3 || streakNow === 5) && <Confetti />}
    <div className={'card2 ' + (phase === 'wait' ? 'shimmer' : 'pop ' + (won ? 'win' : ''))}>
    {phase === 'wait' ? <><p>{g.away} at {g.home}</p><div className="big">{label}</div><p>{oddsTxt(cur.odds)} · {fmt0(Number(cur.stake))} of {cur.ticker}</p><p style={{ marginTop: 14 }}>Final…</p></>
      : push ? <><p>{label} {oddsTxt(cur.odds)}</p><div className="big gold">Push</div><p>No points, streak intact. You still own {fmt0(Number(cur.stake))} of {cur.ticker}.</p></>
      : won ? <><p>{label} {oddsTxt(cur.odds)}</p><div className="big mint">+{Math.round(cur.points)} pts</div>{(d.profile?.streak ?? 0) >= 3 && <p className="gold" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Symbol name="flame" size={14} />{d.profile!.streak} straight · {d.profile!.streak >= 5 ? '2x' : '1.5x'} points</p>}<p>And you still own {fmt0(Number(cur.stake))} of {cur.ticker}.</p></>
      : <><p>{label} {oddsTxt(cur.odds)}</p><div className="big" style={{ color: 'var(--muted)' }}>Missed</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, textAlign: 'left' }}><div style={{ background: 'var(--coral2)', borderRadius: 12, padding: 10 }}><div className="small">A sportsbook keeps</div><div className="coral" style={{ fontWeight: 700, fontSize: 20 }}>{fmt0(Number(cur.stake))}</div></div><div style={{ background: 'var(--mint2)', borderRadius: 12, padding: 10 }}><div className="small">You still own</div><div className="mint" style={{ fontWeight: 700, fontSize: 18 }}>{fmt0(Number(cur.stake))} of {cur.ticker}</div></div></div>
        <p style={{ marginTop: 12 }}>Streak resets. The money didn't go anywhere.</p></>}
  </div>{phase === 'show' && <><div style={{ height: 16 }} /><button className="btn" style={{ maxWidth: 380 }} onClick={next}>{queue.length > 1 ? 'Next result' : 'Done'}</button></>}</div>;
}
