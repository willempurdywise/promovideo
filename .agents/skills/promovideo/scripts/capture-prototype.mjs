#!/usr/bin/env node
// Drive a real local prototype; preserve its own DOM, content and animations.
import {chromium} from 'playwright';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {startCapture} from './chromium-capture.mjs';

const [recipeFile, destination] = process.argv.slice(2);
const ffmpeg=process.env.WISE_FFMPEG;
if(!ffmpeg) throw Error('Set WISE_FFMPEG to an FFmpeg executable (imageio_ffmpeg.get_ffmpeg_exe()).');
if (!recipeFile || !destination) throw Error('Usage: node capture-prototype.mjs journey.json output-directory');
const recipe = JSON.parse(await readFile(recipeFile, 'utf8'));
const url = new URL(recipe.url);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Capture a locally running prototype, not a production app.');
const out = path.resolve(destination);
await mkdir(out,{recursive:true});
const viewport = recipe.viewport ?? {width:390,height:844};
const desktop = recipe.device === 'desktop' || viewport.width >= 768;
let recording = false;
let pointer = {x:viewport.width*.75,y:viewport.height*.75};
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport, reducedMotion:'no-preference', colorScheme:recipe.colorScheme ?? 'light'});
const page = await context.newPage();

const actions = [];
const target = spec => {
  if (spec.role) return page.getByRole(spec.role,{name:spec.name,exact:true});
  if (spec.testId) return page.getByTestId(spec.testId);
  if (spec.selector) return page.locator(spec.selector);
  throw Error('A target requires role/name, testId, or selector.');
};
async function act(step) {
  const timeout = step.timeout ?? 10000;
  switch(step.action) {
    case 'click': {
      const el=target(step);
      if(desktop && recording) {
        await el.waitFor({state:'visible',timeout});
        await el.scrollIntoViewIfNeeded({timeout});
        const box=await el.boundingBox();
        if(!box) throw Error('Click target has no visible bounds');
        const to={x:box.x+box.width/2,y:box.y+box.height/2};
        const from={...pointer}, duration=step.moveMs ?? 650, start=Date.now();
        do {
          const u=Math.min(1,(Date.now()-start)/Math.max(1,duration)), ease=u*u*(3-2*u);
          pointer={x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease};
          await page.mouse.move(pointer.x,pointer.y);
          await page.waitForTimeout(16);
        } while(Date.now()-start<duration);
        await page.mouse.move(to.x,to.y); pointer=to;
        await page.waitForTimeout(step.hoverMs ?? 220);
        await el.click({timeout,delay:100});
        await page.waitForTimeout(step.holdMs ?? 2200);
      } else await el.click({timeout});
      break;
    }
    case 'fill': await target(step).fill(step.value,{timeout}); break;
    case 'type': await target(step).pressSequentially(step.value,{delay:step.delay ?? 90,timeout}); break;
    case 'press': await target(step).press(step.key,{timeout}); break;
    case 'waitFor': await target(step).waitFor({state:'visible',timeout}); break;
    case 'pause': await page.waitForTimeout(step.ms); break;
    case 'scroll': {
      const el = target(step);
      // Multiple short swipes. Only scroll position changes; app styling is untouched.
      for (const swipe of step.swipes) {
        await el.evaluate(async (node, swipe) => {
          const start=node.scrollTop, at=performance.now(), duration=swipe.duration ?? 450;
          await new Promise(resolve => {
            const tick = now => {
              const u=Math.min(1,(now-at)/duration);
              node.scrollTop=start+swipe.dy*(u*u*(3-2*u));
              if(u<1) requestAnimationFrame(tick); else resolve();
            }; requestAnimationFrame(tick);
          });
        },swipe);
        await page.waitForTimeout(swipe.pause ?? 600);
      } break;
    }
    default: throw Error('Unsupported action: '+step.action);
  }
}
try {
  await page.goto(recipe.url,{waitUntil:'domcontentloaded'});
  if(recipe.ready) await target(recipe.ready).waitFor({state:'visible'});
  await page.evaluate(() => document.fonts.ready);
  for(const step of recipe.setup ?? []) await act(step);
  await page.waitForTimeout(recipe.settle ?? 300);
  if(desktop) await page.evaluate(({x,y}) => {
    const cursor=document.createElement('div'); cursor.id='promovideo-cursor';
    cursor.style.cssText=`position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:32px;transform:translate(${x}px,${y}px)`;
    cursor.innerHTML='<svg viewBox="0 0 26 32"><path d="M2 2 L2 26 L8 20 L13 30 L18 27 L13 18 L23 18 Z" fill="white" stroke="#21231D" stroke-width="2"/></svg>';
    document.body.append(cursor);
    document.addEventListener('mousemove', e => {cursor.style.transform=`translate(${e.clientX}px,${e.clientY}px)`},true);
    document.addEventListener('mousedown', () => {cursor.style.scale='.86'},true);
    document.addEventListener('mouseup', () => {cursor.style.scale='1'},true);
  },pointer);
  await page.screenshot({path:path.join(out,'first.png')});
  const capture=await startCapture(context,page,out,viewport);
  recording=true;
  const trimStart=0;
  if(desktop) await page.waitForTimeout(recipe.initialHold ?? 2200);
  for(const step of recipe.steps) {
    const start=Date.now()/1000-capture.start;
    await act(step);
    actions.push({action:step.action,start,end:Date.now()/1000-capture.start});
  }
  await page.waitForTimeout(recipe.finalHold ?? 1200);
  const duration=Date.now()/1000-capture.start;
  if(duration>60) throw Error('Capture exceeds 60 seconds. Split the journey into shorter recordings.');
  await page.screenshot({path:path.join(out,'last.png')});
  const metrics=await capture.stop(ffmpeg);
  await context.close();
  await writeFile(path.join(out,'capture.json'),JSON.stringify({url:recipe.url,viewport,trimStart,duration,actions,metrics,note:'Direct Chromium compositor capture; every delivered frame retained with timestamps. 60fps export holds frames when Chromium delivers fewer updates. Cadence excludes long static holds and is not a guarantee of 60 unique frames per second.'},null,2));
  const presentation=recipe.presentation ?? {};
  const storyboard={...presentation, native_capture:'capture.json', screens:{prototype:{file:'first.png',flatten_radius:0}},scenes:[{screen:'prototype',hold:duration,overlays:[{file:'prototype.mp4',box:[0,0,390,844],trim_start:trimStart,max_duration:duration,fps:60,loop:false}]}]};
  if(desktop) {
    const formats={'1:1':[1080,1080],'16:9':[1920,1080],'9:16':[1080,1920]};
    const [cw,ch]=formats[presentation.format ?? '1:1'];
    const margin=Math.round(Math.min(cw,ch)*.08);
    const scale=Math.min((cw-2*margin)/viewport.width,(ch-2*margin-48)/viewport.height);
    storyboard.device='desktop'; storyboard.viewport=[viewport.width,viewport.height];
    storyboard.scenes[0].overlays[0].box=[0,0,Math.round(viewport.width*scale),Math.round(viewport.height*scale)];
  }
  // Keep capture aspect ratio rather than squeezing a desktop view into a phone.
  if(!desktop && viewport.width/viewport.height !== 390/844) throw Error('Capture saved. Set a matching phone size/overlay box before rendering this nonstandard viewport.');
  await writeFile(path.join(out,'storyboard.json'),JSON.stringify(storyboard,null,2));
  console.log(path.join(out,'storyboard.json'));
} finally { await browser.close(); }
