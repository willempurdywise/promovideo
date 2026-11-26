import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Render the original browser animation timelines, rather than sampling wall-clock video.
// JS timers/rAF use Playwright's clock; CSS/WAAPI keep their original effects and easing.
export async function captureOffline(context,page,directory,width,height,speed=1) {
 await page.clock.pauseAt((await page.evaluate(()=>Date.now()))+20);
 const frames=[],evidence=[];
 const step=1000*speed/60;
 let elapsed=0,targetTime=0,stopped=false;
 async function sample(initial=false) {
  let active=0;
  for(const frame of page.frames()){
   active+=await frame.evaluate(({elapsed,initial})=>{
    const state=window.__takeTimelineState ??= new WeakMap();
    let count=0;
    for(const animation of document.getAnimations()){
     let entry=state.get(animation);
     if(!entry){
      entry={start:elapsed,offset:initial?Number(animation.currentTime)||0:0,rate:animation.playbackRate,skip:animation.playState==='paused'||animation.playState==='finished',finished:false};
      state.set(animation,entry);
      if(!entry.skip){animation.pause();animation.currentTime=entry.offset;}
     }
     if(entry.skip||entry.finished)continue;
     const time=entry.offset+(elapsed-entry.start)*entry.rate;
     const end=animation.effect?.getComputedTiming().endTime;
     animation.currentTime=Math.max(0,time);
     if(typeof end==='number'&&Number.isFinite(end)&&time>=end-0.001&&entry.rate>0){animation.currentTime=end;animation.finish();entry.finished=true;}
     else count++;
    }
    void document.documentElement.offsetHeight;
    return count;
   },{elapsed,initial});
  }
  return active;
 }
 await sample(true);
 async function tick(){
  // Register transitions created by the preceding input before advancing time.
  await sample();
  await page.clock.runFor(step);
  elapsed+=step;
  const activeAnimations=await sample();
  const buffer=await page.screenshot({type:'png',animations:'allow',caret:'initial',timeout:10000});
  const path=join(directory,`frame-${String(frames.length).padStart(6,'0')}.png`);
  await writeFile(path,buffer);
  const hash=createHash('sha256').update(buffer).digest('hex');
  frames.push({path,time:(frames.length*step)/1000});
  evidence.push({frame:frames.length-1,time:elapsed/1000,activeAnimations,hash});
 }
 return {
  get time(){return elapsed/1000;},
  async advance(ms){
   if(stopped)throw Error('Capture has stopped.');
   targetTime+=ms;
   if(targetTime>90000)throw Error('Capture exceeds the 90-second limit.');
   while(elapsed+0.0001<targetTime)await tick();
  },
  async scroll(app,amount){
   const start=await app.locator('html').evaluate(()=>window.scrollY);
   for(let i=1;i<=30;i++){
    const u=i/30,ease=u*u*(3-2*u);
    await app.locator('html').evaluate((_,y)=>window.scrollTo({top:y,behavior:'instant'}),start+amount*ease);
    await this.advance(step);
   }
  },
  async stop(){
   stopped=true;
   const duration=frames.length*step/1000;
   const changes=evidence.filter((f,i)=>i&&f.hash!==evidence[i-1].hash);
   return {frames,duration,metrics:{mode:'offline-native-timelines',duration,renderedFrames:frames.length,sourceSampleFps:60/speed,exportFps:60,changedFrames:changes.length,activeAnimationSamples:evidence.filter(f=>f.activeAnimations>0).length},evidence};
  }
 };
}
