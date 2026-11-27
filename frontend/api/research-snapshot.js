// Only the two public reports written by the Atlas publisher are eligible here.
import {buildCloudPaperSummary} from '../src/lib/cloudPaperDaybook.js';
import {createHash} from 'node:crypto';
import {validatePublisherIpoSnapshot} from '../lib/publisherIpoValidation.js';

const files = Object.freeze({ipo:'ipo-feed.json', paper:'cloud-paper.json'});
const refUrl = 'https://api.github.com/repos/hajihaz/Atlas/git/ref/heads/data/atlas-runtime';

async function readBytes(url, limit, signal) {
  const response = await fetch(url, {headers:{'User-Agent':'Atlas-research-reader'}, signal, redirect:'error'});
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw Error('snapshot unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw Error('snapshot exceeds size limit');
  return bytes;
}

export async function readSnapshot(kind) {
  if (!Object.hasOwn(files, kind)) throw Error('invalid feed');
  const signal = AbortSignal.timeout(7000);
  const ref = JSON.parse(await readBytes(refUrl, 8000, signal));
  if (ref.ref !== 'refs/heads/data/atlas-runtime' || !/^[a-f0-9]{40}$/.test(ref.object?.sha))
    throw Error('invalid runtime revision');
  const base = 'https://raw.githubusercontent.com/hajihaz/Atlas/'+ref.object.sha+'/frontend/public/';
  const [manifestBytes, bytes] = await Promise.all([
    readBytes(base+'runtime-publication.json', 8000, signal),
    readBytes(base+files[kind], 500000, signal)
  ]);
  const manifest = JSON.parse(manifestBytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (manifest.schema !== 'atlas.public-research-publication.v1' ||
      manifest.mode !== 'PREVIEW_RESEARCH_ONLY' || manifest.actualCapitalINR !== 0 ||
      manifest.realOrdersEnabled !== false || manifest.sha256?.['frontend/public/'+files[kind]] !== sha)
    throw Error('invalid public manifest');
  const data = JSON.parse(bytes);
  const sourceAt = kind === 'ipo' ? data.generatedAt : data.lastRunAt;
  if (!Number.isFinite(Date.parse(sourceAt)) || Date.parse(sourceAt) > Date.now()+60000 ||
      sourceAt !== manifest.sourceClocks?.[kind]) throw Error('invalid source clock');
  if (kind === 'ipo') validatePublisherIpoSnapshot(data);
  else if (data.schema !== 1 || data.mode !== 'SCHEDULED_VIRTUAL_PAPER' ||
           data.actualCapitalINR !== 0 || data.realOrdersEnabled !== false ||
           !Array.isArray(data.sessions) || data.sessions.length > 5) throw Error('invalid paper report');
  return {data, revision:ref.object.sha, sourceAt};
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'method_not_allowed'});
  }
  const daybook = req.query?.feed === 'daybook';
  if (!daybook && (typeof req.query?.feed !== 'string' || !Object.hasOwn(files,req.query.feed)))
    return res.status(404).json({error:'unknown_report'});
  try {
    const {data,revision,sourceAt} = await readSnapshot(daybook?'paper':req.query.feed);
    const body=daybook?buildCloudPaperSummary(data):data;
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=60');
    res.setHeader('X-Atlas-Revision',revision);
    res.setHeader('X-Atlas-Source-At',sourceAt);
    return res.status(200).json(body);
  } catch {
    return res.status(503).json({error:'verified_public_report_unavailable'});
  }
}
