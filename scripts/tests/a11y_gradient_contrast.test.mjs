import test from 'node:test';
import assert from 'node:assert/strict';
import {contrastRatio} from '../a11y_gradient_contrast.mjs';
test('WCAG sRGB ratio has independently known black/white and identical-color values',()=>{
 assert.equal(contrastRatio([0,0,0],[255,255,255]),21);
 assert.equal(contrastRatio([255,255,255],[0,0,0]),21);
 assert.equal(contrastRatio([71,71,71],[71,71,71]),1);
 assert(contrastRatio([119,119,119],[255,255,255])<4.5);
 assert(contrastRatio([118,118,118],[255,255,255])>=4.5);
});
test('transparent text is composited with the rendered background rather than treated as opaque',()=>{
 assert.equal(contrastRatio([0,0,0],[255,255,255],0),1);
 assert(contrastRatio([0,0,0],[255,255,255],0.5)<4.5);
 for(const bad of [[[-1,0,0],[255,255,255],1],[[0,0,0],[256,0,0],1],[[0,0,0],[255,255,255],NaN]])
  assert.throws(()=>contrastRatio(...bad));
});
