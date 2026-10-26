// Conservative Vercel ignore-command. Exit 0 skips a build, exit 1 builds.
// Only on production/main, after comparing with Vercel's LAST SUCCESSFUL
// deployment SHA (not merely HEAD^). New PR branches must build all code.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const ONLY_STATIC_PAPER=new Set([
 'frontend/public/cloud-paper.json',
 'frontend/public/cloud-paper-daybook.json'
]);

export function decideBuild(changedPaths,{
 vercelEnv='',gitRef='',hasPreviousDeployment=false,
 hasPrivatePaperToken=false,forceBuild=false,
}={}){
 if(forceBuild)return {skip:false,reason:'force_build_requested'};
 // In particular, a PR's latest commit may contain only docs while earlier
 // commits changed the app; never cancel its first preview build.
 if(vercelEnv!=='production'||gitRef!=='main')
  return {skip:false,reason:'preview_or_unknown_branch_must_build'};
 if(!hasPreviousDeployment)
  return {skip:false,reason:'previous_successful_deployment_not_verified'};
 if(!Array.isArray(changedPaths)||changedPaths.length===0)
  return {skip:false,reason:'unknown_changed_files'};
 if(changedPaths.some(path=>typeof path!=='string'||path.trim()!==path||
   path.includes('..')||path.length>400))
  return {skip:false,reason:'untrusted_changed_path'};
 const docsOnly=changedPaths.every(path=>path==='README.md'||path.startsWith('docs/'));
 if(docsOnly)return {skip:true,reason:'nonruntime_docs_since_last_successful_deployment'};
 const paperOnly=changedPaths.every(path=>ONLY_STATIC_PAPER.has(path));
 if(paperOnly&&hasPrivatePaperToken)
  return {skip:true,reason:'live_private_paper_source_configured'};
 return {skip:false,reason:paperOnly?'no_live_private_paper_source':'runtime_or_market_data_change'};
}

export function getChanges(git='git',cwd=process.cwd(),previousSuccessfulSha=''){
 // This is a Vercel documented BUILD-TIME system variable, and identifies
 // the previous successful deployment for the same project/branch.
 // Fail open to BUILD if absent, shallow, malformed or non-ancestor.
 if(!/^[a-f0-9]{40}$/i.test(previousSuccessfulSha))
  throw Error('PREVIOUS_SUCCESSFUL_DEPLOYMENT_SHA_NOT_PROVEN');
 execFileSync(git,['cat-file','-e',previousSuccessfulSha+'^{commit}'],{
  cwd,timeout:2500,stdio:['ignore','ignore','ignore']
 });
 execFileSync(git,['merge-base','--is-ancestor',previousSuccessfulSha,'HEAD'],{
  cwd,timeout:2500,stdio:['ignore','ignore','ignore']
 });
 // Reconcile ALL commits since the last successful deployment, not HEAD^.
 // Paths are repository-root-relative even from the Vercel frontend cwd.
 const paths=execFileSync(git,['diff','--name-only','--no-ext-diff','-z',
  previousSuccessfulSha,'HEAD'],{
  cwd,encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']
 });
 return paths.split('\0').filter(Boolean);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{
  const env=process.env;
  const productionMain=env.VERCEL_ENV==='production'&&
    env.VERCEL_GIT_COMMIT_REF==='main';
  const previous=productionMain?env.VERCEL_GIT_PREVIOUS_SHA||'':'';
  const paths=productionMain?getChanges('git',process.cwd(),previous):[];
  result=decideBuild(paths,{
   vercelEnv:env.VERCEL_ENV||'',
   gitRef:env.VERCEL_GIT_COMMIT_REF||'',
   hasPreviousDeployment:productionMain&&previous.length===40,
   hasPrivatePaperToken:typeof env.ATLAS_PAPER_READ_TOKEN==='string'&&
     env.ATLAS_PAPER_READ_TOKEN.trim().length>=20,
   forceBuild:env.ATLAS_FORCE_BUILD==='1'
  });
 }catch{
  result={skip:false,reason:'unable_to_verify_last_successful_deployment_diff'};
 }
 // Never log tokens, changed source data or account metadata.
 process.stdout.write('Atlas build gate: '+result.reason+
  '; '+(result.skip?'skip':'build')+'\n');
 process.exitCode=result.skip?0:1;
}
