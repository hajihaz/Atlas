import { useEffect, useState } from 'react';
import { ArrowUpRight, CircleAlert, Clock3, Coins, LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react';

type Quote = {
  symbol: string;
  label?: string;
  market: 'crypto' | 'equity';
  currency: 'USD' | 'INR';
  price: number | null;
  provider: string;
  observedAt: string | null;
  retrievedAt?: string;
  status: string;
  paperEligible: boolean;
};
type ClosedBar = {
  symbol: string; status: string; close: number | null; observedAt: string | null;
  provider: string; currency: 'USD'; paperEligible: false; ageSeconds?: number;
};
type ClosedBarSnapshot = {
  schema: number; source: string; retrievedAt: string; bars: ClosedBar[];
  paperExecutionEnabled: false; liveOrdersEnabled: false;
};

type Snapshot = {
  schema: number;
  retrievedAt: string;
  crypto: Quote[];
  equities: Quote[];
  providerStatus: string;
  authenticatedFeed: boolean;
  liveOrdersEnabled: boolean;
  paperExecutionEnabled: boolean;
  warning: string;
};

const formatPrice = (price: number | null, currency: Quote['currency']) =>
  price === null ? 'Not connected' : new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(price);

export default function MarketsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [closedBars, setClosedBars] = useState<ClosedBarSnapshot | null>(null);
  const [candleError, setCandleError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setCandleError('');
    fetch('/api/closed-candles', { method: 'GET', signal: controller.signal, credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error('Closed-candle provider unavailable');
        return response.json() as Promise<ClosedBarSnapshot>;
      })
      .then(body => {
        if (body.schema !== 1 || body.liveOrdersEnabled !== false
          || body.paperExecutionEnabled !== false || !Array.isArray(body.bars)
          || body.bars.some(bar => bar.paperEligible !== false)) {
          throw new Error('Untrusted candle evidence format');
        }
        setClosedBars(body);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setClosedBars(null);
          setCandleError('Closed-candle feed unavailable; paper readiness not verified.');
        }
      });
    fetch('/api/market-quotes', { method: 'GET', signal: controller.signal, credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error('Market feed unavailable');
        return response.json() as Promise<Snapshot>;
      })
      .then(body => {
        if (body.schema !== 1 || body.liveOrdersEnabled !== false
          || body.paperExecutionEnabled !== false || !Array.isArray(body.crypto)
          || !Array.isArray(body.equities)) throw new Error('Unexpected feed format');
        setSnapshot(body);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Feed unavailable');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const tiles = [...(snapshot?.crypto ?? []), ...(snapshot?.equities ?? [])];
  return <section aria-labelledby="markets-title" className="markets-page">
    <div className="sub-page-header">
      <div className="breadcrumb">ATLAS / MARKET INTELLIGENCE</div>
      <h1 id="markets-title">Market watch<span className="period">.</span></h1>
      <p>Public crypto observations and private-feed stock connection status — no trading authority.</p>
    </div>
    <div className="markets-safety panel" role="note">
      <ShieldCheck size={23} aria-hidden="true" />
      <div><strong>Read-only research mode</strong>
        <p>Public market observations are not validated for simulated fills. Paper execution and real orders are both blocked until authenticated, timestamped data and independent risk controls pass.</p>
      </div><span className="markets-lock"><LockKeyhole size={14} /> ORDERS LOCKED</span>
    </div>
    <div className="markets-toolbar">
      <div><h2>Market observations</h2>
        <p>{snapshot ? `Fetched ${new Date(snapshot.retrievedAt).toLocaleString()} — this is NOT the last trade time.` : 'Checking public source…'}</p>
      </div>
      <button className="secondary-button market-refresh" type="button"
        disabled={loading} onClick={() => setAttempt(value => value + 1)}>
        <RefreshCcw size={16} /> {loading ? 'Checking…' : 'Refresh observations'}
      </button>
    </div>
    {error && <div role="alert" className="markets-error"><CircleAlert size={17} />
      {error}. No prices will be fabricated; retry when the provider is available.</div>}
    <div className="markets-grid" aria-busy={loading}>
      {tiles.map(item => <article className="panel market-tile" key={item.symbol}>
        <div className="market-tile-top"><div className="market-asset-icon"><Coins size={20}/></div>
          <span className={item.market === 'crypto' ? 'market-category' : 'market-category market-stock'}>
            {item.market === 'crypto' ? 'CRYPTO' : 'NSE STOCK'}
          </span>
        </div>
        <h3>{item.symbol}</h3><small>{item.label || 'Indian equity'}</small>
        <div className="market-tile-price">{formatPrice(item.price, item.currency)}</div>
        <div className="market-status">{item.status === 'observation_time_unverified'
          ? <><Clock3 size={14}/> Trade timestamp unavailable — research only</>
          : item.status === 'private_connection_required'
            ? <><LockKeyhole size={14}/> Authenticated private feed needed</>
            : <><CircleAlert size={14}/> Public quote unavailable</>}</div>
        <div className="market-source">{item.provider}</div>
      </article>)}
      {loading && !snapshot && <div role="status" className="panel market-loading">Connecting to public observation source…</div>}
    </div>
    <section className="panel closed-candle-panel" aria-labelledby="candle-readiness-title">
      <div className="closed-candle-heading">
        <div><div className="heading-kicker">NEXT PAPER-READINESS MILESTONE</div>
          <h2 id="candle-readiness-title">Timestamped closed candles</h2>
          <p>Kraken public 1-minute OHLC · current unfinished bar excluded · no simulated fills.</p>
        </div><span className="candle-readiness-tag"><LockKeyhole size={14}/> RESEARCH ONLY</span>
      </div>
      <div className="closed-candle-grid">
        {closedBars ? closedBars.bars.map(bar => <article className="closed-candle-card" key={bar.symbol}>
          <strong>{bar.symbol}</strong>
          <span className="closed-candle-price">{formatPrice(bar.close, bar.currency)}</span>
          <span className={bar.status === 'recent_closed_candle' ? 'closed-candle-status' : 'closed-candle-status warning'}>
            <Clock3 size={13}/> {bar.status === 'recent_closed_candle' ? 'Recent closed bar' : bar.status.replaceAll('_', ' ')}
          </span>
          <small>{bar.observedAt ? 'Bar ended ' + new Date(bar.observedAt).toLocaleString() : 'No validated bar timestamp'}</small>
        </article>) : <p role="status">{candleError || 'Checking timestamped public market data…'}</p>}
      </div>
      <p className="candle-disclaimer">These are source observations, not an authenticated order book or broker paper-trading record. Missing or stale bars are never replaced with estimated prices.</p>
    </section>
    <div className="markets-info panel">
      <div><h2>How the data pipeline works</h2><p>Public crypto tickers use Kraken's read-only endpoint. NSE stock quotes require a private authenticated feed and licensed market-data access; this public dashboard intentionally never carries a broker token.</p></div>
      <div className="market-pipeline">
        <span>Public ticker</span><ArrowUpRight size={16}/><span>Source &amp; freshness check</span>
        <ArrowUpRight size={16}/><span>Research only</span>
      </div>
      <p className="market-fine">No trade buttons, broker-write API, automatic capital execution, or simulated P&amp;L derived from unverified quotes.</p>
    </div>
  </section>;
}
