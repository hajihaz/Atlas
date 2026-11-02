/** Private top-volume view of an immutable official NSE cash EOD ZIP receipt. */
import {nseReferenceSpec} from './nse-reference-archive.js';
const fail=reason=>{const e=Error('NSE_EOD_TOP_BLOCKED: '+reason);e.atlasDiagnostic='NSE EOD top '+reason;throw e;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
function csvCells(line){
 const cells=[];let cell='',quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(ch===','&&!quoted){cells.push(cell);cell=''}else cell+=ch;
 }
 if(quoted)fail('invalid CSV quotation');cells.push(cell);return cells;
}
async function unzipSingleCsv(bytes,expectedName){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0||v.getUint16(end+10,true)!==1)fail('ZIP directory invalid');
 const central=v.getUint32(end+16,true);
 if(central+46>bytes.length||v.getUint32(central,true)!==0x02014b50||v.getUint16(central+10,true)!==8)fail('ZIP entry invalid');
 const compressed=v.getUint32(central+20,true),plain=v.getUint32(central+24,true),nameLength=v.getUint16(central+28,true),
  local=v.getUint32(central+42,true);
 if(compressed<100||compressed>1800000||plain<100||plain>2000000||central+46+nameLength>bytes.length||
  new TextDecoder().decode(bytes.slice(central+46,central+46+nameLength))!==expectedName||
  local+30>bytes.length||v.getUint32(local,true)!==0x04034b50||v.getUint16(local+8,true)!==8)fail('ZIP file identity or size');
 const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
 if(start+compressed>bytes.length||start+compressed>central)fail('ZIP compressed bounds');
 const output=new Uint8Array(await new Response(new Blob([bytes.slice(start,start+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
 if(output.length!==plain)fail('ZIP decompressed size mismatch');
 return new TextDecoder('utf-8',{fatal:true}).decode(output).replace(/^\ufeff/,'');
}
export async function readNseEodTop(env,day){
 const spec=nseReferenceSpec(day,'eod');
 if(!env.HISTORY_DB||!env.NSE_REFERENCE_ARCHIVE)fail('private source archive unavailable');
 const receipt=await env.HISTORY_DB.prepare('SELECT * FROM nse_reference_receipts WHERE source_date=? AND kind=?').bind(day,'eod').first();
 if(!receipt)fail('dated official EOD source missing');
 if(receipt.source_url!==spec.url||!Number.isFinite(Date.parse(receipt.source_last_modified))||
  Date.parse(receipt.source_last_modified)<Date.parse(day+'T10:00:00Z')||
  receipt.kv_key!==`nse-reference/${day}/eod/${receipt.body_sha256}`||
  !/^[a-f0-9]{64}$/.test(receipt.body_sha256))fail('official EOD receipt provenance');
 const raw=await env.NSE_REFERENCE_ARCHIVE.get(receipt.kv_key,'arrayBuffer');
 if(!(raw instanceof ArrayBuffer))fail('official EOD ZIP missing');
 const bytes=new Uint8Array(raw);
 if(bytes.length!==receipt.body_bytes||await hash(bytes)!==receipt.body_sha256)fail('official EOD ZIP hash mismatch');
 const csv=await unzipSingleCsv(bytes,spec.url.split('/').at(-1).replace(/\.zip$/,''));
 const lines=csv.trimEnd().split(/\r?\n/),header=csvCells(lines[0]);
 const required=['TradDt','Sgmt','FinInstrmTp','SctySrs','ISIN','TckrSymb','OpnPric','HghPric','LwPric','ClsPric','TtlTradgVol','TtlTrfVal','TtlNbOfTxsExctd'];
 const columns=Object.fromEntries(required.map(k=>[k,header.indexOf(k)]));
 if(required.some(k=>columns[k]<0)||lines.length<1500||lines.length>10000)fail('official EOD CSV structure');
 const seen=new Set(),stocks=[];
 for(let i=1;i<lines.length;i++){
  const c=csvCells(lines[i]);if(c.length!==header.length||c[columns.TradDt]!==day)fail('official EOD CSV row identity');
  if(c[columns.Sgmt]!=='CM'||c[columns.FinInstrmTp]!=='STK'||c[columns.SctySrs]!=='EQ')continue;
  const symbol=c[columns.TckrSymb],isin=c[columns.ISIN],volume=Number(c[columns.TtlTradgVol]),
   open=Number(c[columns.OpnPric]),high=Number(c[columns.HghPric]),low=Number(c[columns.LwPric]),close=Number(c[columns.ClsPric]),
   turnover=Number(c[columns.TtlTrfVal]),trades=Number(c[columns.TtlNbOfTxsExctd]);
  if(!/^[A-Z0-9&-]{1,30}$/.test(symbol)||!/^IN[A-Z0-9]{10}$/.test(isin)||seen.has(symbol)||
   !Number.isSafeInteger(volume)||volume<0||![open,high,low,close,turnover].every(Number.isFinite)||
   open<=0||high<Math.max(open,close,low)||low>Math.min(open,close,high)||turnover<0||
   !Number.isSafeInteger(trades)||trades<0)fail('official EQ EOD values');
  seen.add(symbol);stocks.push({symbol,isin,volumeShares:volume,open,high,low,close,turnoverRupees:turnover,tradeCount:trades});
 }
 if(stocks.length<1500||stocks.length>4000)fail('official EQ coverage outside bounds');
 stocks.sort((a,b)=>b.volumeShares-a.volumeShares||a.symbol.localeCompare(b.symbol));
 return {schema:'atlas.nse-eod-top.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,
  evidenceClass:'OFFICIAL_NSE_END_OF_DAY_EQ_SERIES_NOT_0940_AND_NOT_NORMAL_MASTER_QUALIFIED',
  sourceSha256:receipt.body_sha256,sourcePublishedAt:receipt.source_last_modified,
  totalEqStocks:stocks.length,top:stocks.slice(0,20).map((x,i)=>({rank:i+1,...x}))};
}
