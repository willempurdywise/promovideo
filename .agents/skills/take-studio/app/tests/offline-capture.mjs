import {chromium} from 'playwright';
import {captureOffline} from '../capture-offline.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory=await mkdtemp('/tmp/take-offline-test-');
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:320,height:240}});
 const page=await context.newPage();await page.clock.install();
 await page.setContent('<style>div{width:40px;height:40px;background:red;transition:transform .5s linear}</style><div></div>');
 await page.evaluate(()=>{window.transitionEnds=0;document.querySelector('div').addEventListener('transitionend',()=>window.transitionEnds++);});
 const capture=await captureOffline(context,page,directory,320,240);
 await page.locator('div').evaluate(el=>el.style.transform='translateX(120px)');
 await capture.advance(500);
 const position=await page.locator('div').evaluate(el=>el.getBoundingClientRect().x);
 assert.ok(Math.abs(position-128)<0.01,`Transition endpoint ${position}`);
 await capture.advance(34);
 assert.equal(await page.evaluate(()=>window.transitionEnds),1,'Native transitionend still fires exactly once');
 const result=await capture.stop();
 assert.equal(result.frames.length,33);
 assert.equal(new Set(result.evidence.slice(0,30).map(f=>f.hash)).size,30,'All 30 moving frames must be unique');
 for(let i=1;i<result.frames.length;i++)assert.ok(Math.abs(result.frames[i].time-result.frames[i-1].time-1/60)<1e-8);
 console.log('PASS: 30 distinct frames in a native 500 ms transition, exact 1/60 second spacing, unchanged endpoint and one native completion event.');
}finally{await browser.close();await rm(directory,{recursive:true,force:true});}
