import { requireThat, rawDigest, freeze, digest } from './core.mjs';
import { importDataset, importCoinDCX } from './data.mjs';

export function ingestCandleJson(raw, manifest, { providerFormat = 'NORMALIZED' } = {}) {
  requireThat(typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 8000000,
    'IMPORT_PAYLOAD_SIZE_LIMIT');
  requireThat(rawDigest(raw) === manifest?.provenance?.rawSha256, 'RAW_PAYLOAD_HASH_MISMATCH');
  let records;
  try { records = JSON.parse(raw); } catch { requireThat(false, 'INVALID_IMPORT_JSON'); }
  requireThat(Array.isArray(records), 'IMPORT_ARRAY_REQUIRED');
  let dataset;
  if (providerFormat === 'COINDCX') dataset = importCoinDCX(records, manifest);
  else {
    requireThat(providerFormat === 'NORMALIZED', 'UNSUPPORTED_IMPORT_FORMAT');
    dataset = importDataset({ ...manifest, schema: 'atlas.market.v1', candles: records });
  }
  return freeze({ dataset, receipt: { schema: 'atlas.import-receipt.v1',
    payloadSha256: rawDigest(raw), normalizedHash: dataset.hash,
    rowCount: dataset.candles.length, dataKind: dataset.provenance.kind,
    transformations: providerFormat === 'COINDCX'
      ? ['NEWEST_FIRST_ORDER_NORMALIZED', 'PUBLICATION_ASSUMED_AT_CLOSE'] : [],
    qualityChecked: true, externallyAudited: false, realOrdersEnabled: false,
    receiptHash: digest({ payloadSha256: rawDigest(raw), normalizedHash: dataset.hash }) } });
}
