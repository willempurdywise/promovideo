import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Record compositor updates, retaining their real timestamps (including static holds).
export async function captureFrames(context,page,directory,width,height) {
 const cdp=await context.newCDPSession(page);
 const initial=join(directory,'initial.jpg');await page.screenshot({path:initial,quality:100});
 const start=Date.now()/1000,frames=[{path:initial,time:0}],writes=new Set();
 let accepting=true,failure;
 cdp.on('Page.screencastFrame',event=>{
  cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(e=>failure=e);
  if(!accepting)return;
  const time=event.metadata.timestamp-start;
  if(time<=frames.at(-1).time)return;
  const path=join(directory,`frame-${frames.length}.jpg`);frames.push({path,time});
  const pending=writeFile(path,Buffer.from(event.data,'base64')).catch(e=>failure=e).finally(()=>writes.delete(pending));writes.add(pending);
 });
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:100,maxWidth:width,maxHeight:height,everyNthFrame:1});
 return {async stop(){
  const duration=Date.now()/1000-start;accepting=false;
  await cdp.send('Page.stopScreencast');await Promise.all(writes);await cdp.detach();
  if(failure)throw failure;
  if(frames.length<2)throw Error('The browser did not deliver capture frames.');
  const intervals=frames.slice(1).map((f,i)=>f.time-frames[i].time).filter(dt=>dt>0&&dt<.1).sort((a,b)=>a-b);
  return {frames,duration,metrics:{duration,deliveredFrames:frames.length,medianActiveCadenceFps:intervals.length?+(1/intervals[Math.floor(intervals.length/2)]).toFixed(1):null,exportFps:60}};
 }};
}
