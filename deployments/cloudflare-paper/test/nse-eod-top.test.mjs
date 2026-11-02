import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {readNseEodTop} from '../src/nse-eod-top.js';
import {nseReferenceSpec} from '../src/nse-reference-archive.js';
const DAY='2026-10-19';
function zipped(){
 const name=nseReferenceSpec(DAY,'eod').url.split('/').at(-1).replace('.zip','');
 const header='TradDt,Sgmt,FinInstrmTp,SctySrs,ISIN,TckrSymb,OpnPric,HghPric,LwPric,ClsPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,Name';
 const rows=Array.from({length:1501},(_,i)=>`${DAY},CM,STK,EQ,IN${String(i).padStart(10,'0')},TST${String(i).padStart(4,'0')},100,101,99,100,${i+1},${(i+1)*100},${i+1},"A, B"`);
 const plain=Buffer.from(header+'\n'+rows.join('\n')+'\n'),compressed=deflateRawSync(plain),filename=Buffer.from(name);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(plain.length,24);central.writeUInt16LE(filename.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+compressed.length,16);
 return Buffer.concat([local,filename,compressed,central,filename,end]);
}
function env(bytes){const sha=createHash('sha256').update(bytes).digest('hex'),url=nseReferenceSpec(DAY,'eod').url;
 const row={source_date:DAY,kind:'eod',source_url:url,source_last_modified:DAY+'T11:00:00Z',body_sha256:sha,
  body_bytes:bytes.length,kv_key:`nse-reference/${DAY}/eod/${sha}`};
 return {HISTORY_DB:{prepare:()=>({bind:()=>({first:async()=>row})})},NSE_REFERENCE_ARCHIVE:{get:async()=>Uint8Array.from(bytes).buffer}};
}
test('private official EOD ZIP ranks whole-day EQ volume with exact source hash',async()=>{
 const source=env(zipped()),result=await readNseEodTop(source,DAY);
 assert.equal(result.totalEqStocks,1501);assert.equal(result.top.length,20);
 assert.equal(result.top[0].symbol,'TST1500');assert.equal(result.top[0].volumeShares,1501);
 assert.match(result.evidenceClass,/NOT_0940/);assert.equal(result.realOrdersEnabled,false);
 const changed=zipped();changed[100]^=1;
 const tampered=env(zipped());tampered.NSE_REFERENCE_ARCHIVE.get=async()=>Uint8Array.from(changed).buffer;
 await assert.rejects(readNseEodTop(tampered,DAY),/ZIP hash mismatch/);
});
test('missing or tampered official ZIP is rejected before ranking',async()=>{
 const bytes=zipped(),source=env(bytes);source.NSE_REFERENCE_ARCHIVE.get=async()=>null;
 await assert.rejects(readNseEodTop(source,DAY),/ZIP missing/);
 const corrupt=env(bytes);corrupt.NSE_REFERENCE_ARCHIVE.get=async()=>Uint8Array.from(Buffer.concat([bytes,Buffer.from('extra')])).buffer;
 await assert.rejects(readNseEodTop(corrupt,DAY),/ZIP hash mismatch/);
});
