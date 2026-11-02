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
    case 'click': await target(step).click({timeout}); break;
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
  await page.screenshot({path:path.join(out,'first.png')});
  const capture=await startCapture(context,page,out,viewport);
  const trimStart=0;
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
  // Keep capture aspect ratio rather than squeezing a desktop view into a phone.
  if(viewport.width/viewport.height !== 390/844) throw Error('Capture saved. Set a matching phone size/overlay box before rendering this nonstandard viewport.');
  await writeFile(path.join(out,'storyboard.json'),JSON.stringify(storyboard,null,2));
  console.log(path.join(out,'storyboard.json'));
} finally { await browser.close(); }
