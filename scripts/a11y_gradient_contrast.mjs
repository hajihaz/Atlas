// Supplements axe's gradient-background incompletes with sampled rendered pixels.
// This is bounded evidence, not a WCAG conformance certificate.
export function contrastRatio(foreground, background, alpha=1){
  if(!Array.isArray(foreground)||!Array.isArray(background)||foreground.length!==3||background.length!==3
    ||![...foreground,...background,alpha].every(Number.isFinite)||alpha<0||alpha>1
    ||[...foreground,...background].some(c=>c<0||c>255))throw Error('Invalid sRGB contrast sample');
  const fg=foreground.map((v,i)=>v*alpha+background[i]*(1-alpha));
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
  const a=luminance(fg),b=luminance(background);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
export async function sampleGradientContrast(page,axeResult){
  const checks=axeResult.incomplete.filter(v=>v.id==='color-contrast');
  const targets=[...new Set(checks.flatMap(c=>c.nodes).filter(n=>n.target.length===1&&typeof n.target[0]==='string')
    .map(n=>n.target[0]))].slice(0,500);
  if(!targets.length)return {measuredTextRuns:0,failures:[],manual:[],method:'No gradient checks required'};
  // Align document coordinates with the full-page raster, including sticky headers.
  await page.evaluate(()=>scrollTo(0,0));
  const collected=await page.evaluate(selectors=>{
    const runs=[],manual=[],seen=new Set();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(const selector of selectors){
      let element;try{element=document.querySelector(selector);}catch{}
      if(!element){manual.push({selector,reason:'Node changed before sampling'});continue;}
      if(element.closest('[disabled],[aria-disabled="true"]')){manual.push({selector,reason:'Inactive control contrast exemption needs review'});continue;}
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
      let text;
      while((text=walker.nextNode())){
        if(!text.textContent?.trim()||seen.has(text))continue;seen.add(text);
        const parent=text.parentElement;
        if(!(parent instanceof HTMLElement)){manual.push({selector,reason:'Non-HTML text needs manual review'});continue;}
        if(parent.closest('[aria-hidden="true"],[inert],script,style'))continue;
        const css=getComputedStyle(parent);
        if(css.visibility!=='visible'||css.display==='none')continue;
        const fontSize=parseFloat(css.fontSize),bold=parseInt(css.fontWeight)>=700;
        let opacity=1;
        for(let e=parent;e;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);
        ctx.clearRect(0,0,1,1);ctx.fillStyle=css.color;ctx.fillRect(0,0,1,1);
        const rgba=[...ctx.getImageData(0,0,1,1).data];
        const range=document.createRange();range.selectNodeContents(text);
        for(const r of range.getClientRects()){
          if(r.width<1||r.height<1)continue;
          runs.push({selector,text:text.textContent.trim().slice(0,100),foreground:rgba.slice(0,3),
            alpha:opacity*rgba[3]/255,required:fontSize>=24||bold&&fontSize>=18.667?3:4.5,
            rect:{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}});
        }
      }
    }
    return {runs,manual};
  },targets);
  const style=await page.addStyleTag({content:'*{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}'});
  let png;
  try{png=await page.screenshot({fullPage:true,animations:'disabled'});}
  finally{await style.evaluate(el=>el.remove());}
  const sampled=await page.evaluate(async({base64,runs})=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    return runs.map(run=>{
      const {x,y,width,height}=run.rect,samples=[];
      for(const dx of [0.1,0.3,0.5,0.7,0.9])for(const dy of [0.2,0.5,0.8]){
        const px=Math.floor(x+width*dx),py=Math.floor(y+height*dy);
        if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;
        const rgba=ctx.getImageData(px,py,1,1).data;
        samples.push([...rgba].slice(0,3).map(v=>v*rgba[3]/255+255*(1-rgba[3]/255)));
      }
      return {...run,samples};
    });
  },{base64:png.toString('base64'),runs:collected.runs});
  const failures=[],manual=[...collected.manual];let measured=0,min=21;
  for(const run of sampled){
    if(!run.samples.length){manual.push({selector:run.selector,reason:'Outside sampled screenshot'});continue;}
    const ratio=Math.min(...run.samples.map(background=>contrastRatio(run.foreground,background,run.alpha)));
    min=Math.min(min,ratio);measured++;
    if(ratio+0.005<run.required)failures.push({...run,samples:undefined,minimumRatio:Number(ratio.toFixed(3))});
  }
  return {method:'15 rendered background samples per HTML text line; text fill hidden while layout/color backgrounds are preserved',
    measuredTextRuns:measured,minimumObservedRatio:Number(min.toFixed(3)),failures,manual,
    fullContrastCertification:false};
}
