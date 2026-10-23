// Conservative Vercel ignore-command. Exit 0 = skip build, 1 = build.
// Never skip a real application, workflow, market-data schema, or IPO change.
// Pure data-only cloud snapshots may be skipped ONLY when the server-side
// private GitHub read endpoint is configured. Default to BUILD on uncertainty.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const ONLY_STATIC_PAPER=new Set([
 'frontend/public/cloud-paper.json',
 'frontend/public/cloud-paper-daybook.json'
]);

export function decideBuild(changedPaths,{
 vercelEnv='',hasPrivatePaperToken=false,forceBuild=false,
}={}){
 if(forceBuild||!['production','preview','development'].includes(vercelEnv))
  return {skip:false,reason:'not_a_known_vercel_build_context'};
 if(!Array.isArray(changedPaths)||changedPaths.length===0)
  return {skip:false,reason:'unknown_changed_files'};
 if(changedPaths.some(path=>typeof path!=='string'||path.trim()!==path||
   path.includes('..')||path.length>400))
  return {skip:false,reason:'untrusted_changed_path'};
 const docsOnly=changedPaths.every(path=>path==='README.md'||path.startsWith('docs/'));
 if(docsOnly)return {skip:true,reason:'only_nonruntime_documentation'};
 const paperOnly=changedPaths.every(path=>ONLY_STATIC_PAPER.has(path));
 if(paperOnly&&hasPrivatePaperToken)
  return {skip:true,reason:'live_private_paper_source_configured'};
 return {skip:false,reason:paperOnly?'no_live_private_paper_source':'runtime_or_market_data_change'};
}

export function getChanges(git='git',cwd=process.cwd()){
 // Vercel may shallow-clone; if HEAD^ is absent, don't risk skipping a build.
 // The root path from git diff-tree is independent of the frontend cwd.
 const parent=execFileSync(git,['rev-parse','--verify','HEAD^'],{
  cwd,encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']
 }).trim();
 const paths=execFileSync(git,['diff','--name-only','--no-ext-diff','-z',parent,'HEAD'],{
  cwd,encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']
 });
 return paths.split('\0').filter(Boolean);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{
  const changes=getChanges();
  result=decideBuild(changes,{
   vercelEnv:process.env.VERCEL_ENV||'',
   hasPrivatePaperToken:typeof process.env.ATLAS_PAPER_READ_TOKEN==='string'&&
     process.env.ATLAS_PAPER_READ_TOKEN.trim().length>=20,
   forceBuild:process.env.ATLAS_FORCE_BUILD==='1'
  });
 }catch{
  result={skip:false,reason:'unable_to_inspect_git_diff'};
 }
 // Avoid logging source paths, credentials, account metadata or balances.
 process.stdout.write('Atlas build gate: '+result.reason+
  '; '+(result.skip?'skip':'build')+'\n');
 process.exitCode=result.skip?0:1;
}
