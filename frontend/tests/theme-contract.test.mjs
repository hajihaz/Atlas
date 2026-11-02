import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx'),css=read('../src/styles.css'),html=read('../index.html');
test('light theme is the default for first-time visitors',()=>{
 assert.match(html,/data-theme="light"/);
 assert.match(app,/return 'light';/);
 assert.match(css,/html\[data-theme="light"\]/);
});
test('theme toggle is accessible and cannot change execution authority',()=>{
 assert.match(app,/aria-label=\{theme==='light'/);
 assert.match(app,/window\.localStorage\.getItem\('atlas\.theme\.preference'\)/);
 assert.match(app,/window\.localStorage\.setItem\('atlas\.theme\.preference',theme\)/);
 assert.match(app,/document\.documentElement\.dataset\.theme=theme/);
 assert.doesNotMatch(app,/toggleLiveTrading|enableLiveMode/);
});
test('simple paper pages retain responsive and reduced-motion support',()=>{
 assert.match(css,/\.atlas-simple-grid/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
