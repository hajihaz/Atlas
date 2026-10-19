// Run at Vite build-time so published summary is derived from exactly
// the checked-in raw cloud-paper.json source. No market access / orders.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildCloudPaperSummary} from '../frontend/src/lib/cloudPaperDaybook.js';
const source=fileURLToPath(new URL('../frontend/public/cloud-paper.json',import.meta.url));
const target=fileURLToPath(new URL('../frontend/public/cloud-paper-daybook.json',import.meta.url));
const data=JSON.parse(await readFile(source,'utf8'));
const summary=buildCloudPaperSummary(data);
const serialized=JSON.stringify(summary,null,2)+'\n';
if(Buffer.byteLength(serialized)>250000)throw Error('Source-backed daybook output too large');
await writeFile(target,serialized,'utf8');
console.log('Atlas source-backed paper daybook built:',JSON.stringify({
 status:summary.status,source:summary.source,strategies:summary.strategies.length,
 days:summary.strategies.reduce((n,s)=>n+s.days.length,0),
 hypotheticalFills:summary.strategies.reduce((n,s)=>n+s.modeledFillsInRetainedHistory,0),
 actualCapitalINR:0
}));
