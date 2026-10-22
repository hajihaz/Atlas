import { requireThat, finite, epoch, digest, rawDigest, freeze, safeUrl } from './core.mjs';
import { importDataset, closedPrefix } from './data.mjs';
import { STRATEGIES, strategySpec, evaluateStrategy, sma } from './strategies.mjs';
import { simulate } from './simulation.mjs';

export const ROLES = freeze(['scout', 'news', 'sentiment', 'charts', 'risk', 'decision']);
const POSITIVE = new Set(['growth', 'upgrade', 'surplus', 'expansion', 'beat']);
const NEGATIVE = new Set(['fraud', 'downgrade', 'default', 'recall', 'miss']);
export function newsContentHash({ title, text }) { return rawDigest(title + '\n' + text); }
export function screenNews(items, { symbol, now, maxAgeMs = 86400000 }) {
  requireThat(Array.isArray(items) && items.length <= 100, 'INVALID_NEWS_BATCH');
  finite(maxAgeMs, 'news maxAgeMs', { min: 0, max: 30 * 86400000 });
  const at = epoch(now), accepted = [], rejected = [], seenUrls = new Set(), seenContent = new Set();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      requireThat(item?.kind === 'SOURCE_REFERENCE', 'INVALID_NEWS_KIND');
      requireThat(typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 300
        && typeof item.text === 'string' && item.text.length <= 10000, 'INVALID_NEWS_CONTENT');
      requireThat(!/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(item.title + item.text)
        && !/ignore\s+(?:all\s+)?previous|override\s+risk|javascript:/i.test(item.title + item.text),
        'UNTRUSTED_NEWS_INSTRUCTIONS');
      const url = new URL(safeUrl(item.url));
      requireThat(typeof item.publisher === 'string' && item.publisher === url.hostname, 'PUBLISHER_URL_MISMATCH');
      requireThat(item.contentSha256 === newsContentHash(item), 'NEWS_CONTENT_HASH_MISMATCH');
      const publishedAt = epoch(item.publishedAt), availableAt = epoch(item.availableAt);
      requireThat(publishedAt <= availableAt && availableAt <= at, 'FUTURE_NEWS');
      requireThat(at - publishedAt <= maxAgeMs, 'STALE_NEWS');
      requireThat(Array.isArray(item.symbols) && item.symbols.includes(symbol), 'IRRELEVANT_NEWS');
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
      const contentKey = rawDigest((item.title + ' ' + item.text).toLowerCase().replace(/\s+/g, ' ').trim());
      requireThat(!seenUrls.has(url.href) && !seenContent.has(contentKey), 'DUPLICATE_NEWS');
      seenUrls.add(url.href); seenContent.add(contentKey);
      accepted.push({ url: url.href, publisher: item.publisher, title: item.title, text: item.text,
        publishedAt, availableAt, contentSha256: item.contentSha256 });
    } catch (error) {
      rejected.push({ index, code: error.code ?? 'MALFORMED_NEWS' });
    }
  }
  return freeze({ accepted, rejected });
}
export function lexiconSentiment(articles) {
  const evidence = articles.map(article => {
    const tokens = (article.title + ' ' + article.text).toLowerCase().match(/[a-z]+/g) ?? [];
    let positive = 0, negative = 0;
    for (let i = 0; i < tokens.length; i++) {
      // Negation is excluded, not interpreted as reliable inverse sentiment.
      if (tokens.slice(Math.max(0, i - 3), i).some(token => ['not', 'no', 'never'].includes(token))) continue;
      if (POSITIVE.has(tokens[i])) positive++;
      if (NEGATIVE.has(tokens[i])) negative++;
    }
    return { contentSha256: article.contentSha256, positiveTerms: positive, negativeTerms: negative,
      label: positive && negative ? 'CONTRADICTORY' : positive ? 'POSITIVE_HEURISTIC'
        : negative ? 'NEGATIVE_HEURISTIC' : 'UNDETERMINED' };
  });
  const contradictory = evidence.some(row => row.label === 'CONTRADICTORY')
    || evidence.some(row => row.label === 'POSITIVE_HEURISTIC') && evidence.some(row => row.label === 'NEGATIVE_HEURISTIC');
  return freeze({ method: 'ORIGINAL_SMALL_LEXICON_HEURISTIC_NOT_AN_AI_MODEL',
    externallyValidatedAccuracy: null, confidence: null, contradictory, evidence,
    limitations: 'Not trained on finance language; no sarcasm, event truth or predictive accuracy claim.' });
}
export function evaluateResearchCouncil({ dataset: input, strategyId = 'sma_9_21',
  news = [], now, exposureFraction = 0, maxAgeMs = 180000, maxResearchDrawdownPct = 5,
  simulationConfig = {} }) {
  const at = epoch(now);
  finite(maxAgeMs, 'maxAgeMs', { min: 0, max: 86400000 });
  finite(maxResearchDrawdownPct, 'maxResearchDrawdownPct', { min: 0, max: 100 });
  let data = null, sourceFailure = null, research = null;
  const vetoes = [], roles = [];
  try {
    data = importDataset(input, { asOf: at });
    requireThat(data.provenance.retrievedAt <= at, 'FUTURE_SOURCE_RETRIEVAL');
    const last = data.candles.at(-1);
    requireThat(at - (last.time + data.intervalMs) <= maxAgeMs, 'STALE_SIGNAL');
    requireThat(data.candles.length >= strategySpec(strategyId).warmup, 'INSUFFICIENT_HISTORY');
  } catch (error) { sourceFailure = error.code ?? 'INVALID_SOURCE'; vetoes.push(sourceFailure); }
  roles.push({ role: 'scout', status: sourceFailure ? 'REJECTED' : 'DECLARED_SOURCE',
    evidenceRefs: data ? [data.hash, data.provenance.rawSha256] : [],
    reason: sourceFailure ?? 'Provenance and declared coverage checked; source authenticity is not independently certified.' });
  let screened;
  try { screened = screenNews(news, { symbol: data?.instrument.id ?? '', now: at }); }
  catch (error) { screened = { accepted: [], rejected: [{ index: null, code: error.code ?? 'INVALID_NEWS' }] }; }
  const integrityFailures = screened.rejected.filter(row =>
    !['DUPLICATE_NEWS', 'IRRELEVANT_NEWS', 'STALE_NEWS'].includes(row.code));
  if (integrityFailures.length) vetoes.push('NEWS_INTEGRITY_REJECTED');
  roles.push({ role: 'news', status: screened.accepted.length ? 'SOURCE_REFERENCES' : 'NO_ELIGIBLE_NEWS',
    evidenceRefs: screened.accepted.map(row => row.contentSha256), rejected: screened.rejected,
    reason: 'Timestamp, relevance, duplicate and content-integrity screen; not news fact-checking.' });
  const sentiment = lexiconSentiment(screened.accepted);
  if (sentiment.contradictory) vetoes.push('CONTRADICTORY_NEWS_EVIDENCE');
  roles.push({ role: 'sentiment', status: screened.accepted.length ? 'HEURISTIC_ONLY' : 'UNDETERMINED',
    evidenceRefs: screened.accepted.map(row => row.contentSha256), ...sentiment });
  let chartSignals = [], regime = null;
  if (data && !sourceFailure) {
    const history = closedPrefix(data, at);
    chartSignals = STRATEGIES.map(definition => evaluateStrategy(strategySpec(definition.id), history));
    const closes = history.slice(-21).map(row => row.close);
    const returns = closes.slice(1).map((price, i) => price / closes[i] - 1);
    const mean = returns.reduce((sum, n) => sum + n, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((sum, n) => sum + (n - mean) ** 2, 0) / returns.length);
    const average = sma(closes, Math.min(20, closes.length));
    regime = { label: volatility > 0.03 ? 'HIGH_VOLATILITY'
      : Math.abs(closes.at(-1) / average - 1) > 0.02 ? 'TRENDING' : 'RANGE_OR_UNCLEAR',
      trailingBarVolatility: volatility };
    if (chartSignals.some(row => row.action === 'BUY') && chartSignals.some(row => row.action === 'SELL'))
      vetoes.push('CONTRADICTORY_CHART_SIGNALS');
    try {
      research = simulate({ dataset: data, strategyId, config: simulationConfig });
      if (research.maxDrawdownPct > maxResearchDrawdownPct) vetoes.push('RESEARCH_DRAWDOWN_LIMIT');
    } catch (error) { vetoes.push(error.code ?? 'INVALID_RESEARCH_CONFIGURATION'); }
  }
  roles.push({ role: 'charts', status: regime ? 'DETERMINISTIC_RESEARCH' : 'NO_VALID_SIGNAL',
    signals: chartSignals, regime, evidenceRefs: research ? [research.resultHash] : [] });
  if (typeof exposureFraction !== 'number' || !Number.isFinite(exposureFraction)
    || exposureFraction < 0 || exposureFraction > 1) vetoes.push('EXPOSURE_INVALID_OR_OVER_LIMIT');
  const uniqueVetoes = [...new Set(vetoes)];
  roles.push({ role: 'risk', status: uniqueVetoes.length ? 'VETO' : 'RESEARCH_SCREEN_ONLY',
    vetoes: uniqueVetoes, evidenceRefs: data ? [data.hash] : [],
    reason: 'Deterministic veto cannot be overridden by sentiment, summaries or role votes.' });
  const outcome = uniqueVetoes.length ? 'SKIP' : 'WAIT';
  roles.push({ role: 'decision', status: outcome, evidenceRefs: roles.flatMap(row => row.evidenceRefs ?? []),
    reason: outcome === 'SKIP' ? uniqueVetoes.join('; ')
      : 'Research evidence is available; no execution rights or profitability certification.' });
  const result = { schema: 'atlas.council.v1', mode: 'DETERMINISTIC_ADVISORY_RESEARCH',
    now: at, strategyId, outcome, roles, vetoes: uniqueVetoes,
    independentAIModels: 0, deterministicRoles: 6, realOrdersEnabled: false, realOrdersPlaced: 0,
    paperOrdersEnabled: false, paperLedgerWritten: false };
  return freeze({ ...result, traceHash: digest(result) });
}
