import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sampleGradientContrast} from '../a11y_gradient_contrast.mjs';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {chromium}=require('playwright-core');

test('rendered gradient samples distinguish readable and unreadable text after scrolling',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});
 await page.setContent(`<style>body{margin:0;background:white;color:#222;font:16px Arial}
 header{position:fixed;top:0;height:50px;width:100%;background:#123;color:white}
 main{padding-top:60px}p{padding:12px;background:linear-gradient(white,#eee)}
 .low{color:#aaa} .spacer{height:1400px}</style>
 <header>Fixed header</header><main><p class="good">Readable gradient label</p>
 <p class="low">Insufficient gradient label</p><div class="spacer"></div>
 <p class="bottom">Readable lower label</p></main>`);
 const axeResult={incomplete:[{id:'color-contrast',nodes:['.good','.low','.bottom'].map(s=>({target:[s]}))}]};
 for(const scroll of [0,1000]){
  await page.evaluate(y=>scrollTo(0,y),scroll);
  const result=await sampleGradientContrast(page,axeResult);
  assert.deepEqual([...new Set(result.failures.map(f=>f.selector))],['.low']);
  assert.equal(result.measuredTextRuns,3);
 }
});
