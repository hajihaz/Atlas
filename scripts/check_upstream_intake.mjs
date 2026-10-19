// Atlas upstream dependency intake guard — source-only, offline and zero-cost.
// This is not a CVE scanner. It prevents unreviewed installs from entering core paths.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const REGISTRY=resolve(ROOT,'docs/operations/atlas-open-source-audit.json');
const MUST_HOLD=new Map([['freqtrade','GPL-3.0'],['vectorbt','Commons Clause'],
  ['finbert','code only']]);
export const APPROVED_KINDS=new Set(['REFERENCE_ONLY','ISOLATED_EVALUATION','LEGAL_HOLD']);
export const FOREIGN_MODULES=new Set(['tradingagents','finrl_trading','nautilus_trader',
  'freqtrade','qlib','finrobot','hummingbot','vectorbt','finbert']);

export function verifyAuditManifest(data){
 const errors=[];
 if(data?.schemaVersion!==1||data.auditedAt!=='2026-10-20'||
   data.realCapitalEnabled!==false||!Array.isArray(data.upstream)||
   data.upstream.length!==10)errors.push('invalid 10-repository audit header');
 const all=data?.upstream??[];
 const ids=new Set(),names=new Set();
 for(const x of all){
   if(!x||typeof x!=='object'){errors.push('nonobject repository');continue;}
   if(typeof x.id!=='string'||ids.has(x.id))errors.push('duplicate or missing id');
   ids.add(x.id);
   if(typeof x.repository!=='string'||names.has(x.repository)||
      x.url!=='https://github.com/'+x.repository)errors.push('duplicate or invalid repository URL');
   names.add(x.repository);
   if(!/^[a-f0-9]{40}$/.test(x.pinnedCommit??''))errors.push('unpinned upstream: '+x.id);
   if(!/^2026-\d\d-\d\d$/.test(x.lastCommitDate??''))errors.push('missing snapshot date: '+x.id);
   if(!APPROVED_KINDS.has(x.decision))errors.push('unsafe or missing decision: '+x.id);
   if(typeof x.license!=='string'||!x.license.length||
      typeof x.blocker!=='string'||!x.blocker.length||
      typeof x.inspectedCodePath!=='string'||!x.inspectedCodePath.length)
      errors.push('missing source/license/risk evidence: '+x.id);
   if(x.directInstallApproved!==false||x.liveTradingAllowed!==false||
     x.installedByThisAudit!==false)errors.push('nonzero execution/install authorization: '+x.id);
 }
 for(const [id,match] of MUST_HOLD){
   const x=all.find(x=>x.id===id);
   if(!x||x.decision!=='LEGAL_HOLD'||!x.license.toLowerCase().includes(match.toLowerCase()))
      errors.push('missing explicit legal hold for '+id);
 }
 if(all.find(x=>x.id==='finrlx')?.repository!=='AI4Finance-Foundation/FinRL-Trading')
   errors.push('FinRL-X identity not verified');
 return errors;
}
function filesIn(directory,output=[]){
 if(!existsSync(directory))return output;
 for(const ent of readdirSync(directory,{withFileTypes:true})){
   if(ent.name==='node_modules'||ent.name==='dist'||ent.name==='__pycache__'||ent.name==='.git')continue;
   const p=join(directory,ent.name);
   if(ent.isDirectory())filesIn(p,output);
   else if(ent.isFile()&&['.py','.js','.mjs','.ts','.tsx'].includes(extname(p)))output.push(p);
 }
 return output;
}
export function findUnapprovedImports(paths){
 const failures=[];
 for(const p of paths){
   const source=readFileSync(p,'utf8');
   for(const line of source.split('\n')){
     const trimmed=line.trim();
     // Only actual import/require syntax. Comments, docs and names in strings do not count.
     const python=trimmed.match(/^(?:from|import)\s+([A-Za-z_][\w.]*)/);
     const js=trimmed.match(/^import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/)
       ??trimmed.match(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/);
     const imported=(js?.[1]??python?.[1]??'').split(/[./]/)[0].replace(/^@/,'');
     if(FOREIGN_MODULES.has(imported))failures.push(p+': unapproved '+imported+' dependency');
   }
 }
 return failures;
}
export function checkRepo(root=ROOT){
 const json=JSON.parse(readFileSync(resolve(root,'docs/operations/atlas-open-source-audit.json'),'utf8'));
 const sourceFiles=['src/atlas','frontend/src','frontend/api','frontend/lib']
   .flatMap(d=>filesIn(resolve(root,d)));
 return [...verifyAuditManifest(json),...findUnapprovedImports(sourceFiles)];
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=checkRepo();
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
 else console.log('Atlas upstream intake: 10/10 pinned and classified; no new unapproved code imports.');
}
