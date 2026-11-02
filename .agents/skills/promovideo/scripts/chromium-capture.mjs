// Receive every compositor frame directly, bypassing Playwright's 25fps recorder.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

export async function startCapture(context,page,out,viewport) {
  const framesDir=path.join(out,'frames');
  await mkdir(framesDir,{recursive:true});
  const cdp=await context.newCDPSession(page);
  const frames=[],writes=[];
  let accepting=true, failure=null;
  const start=Date.now()/1000;
  await page.screenshot({path:path.join(framesDir,'initial.png')});
  frames.push({file:'initial.png',time:0});
  cdp.on('Page.screencastFrame',event => {
    cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(e=>{failure=e;});
    if(!accepting) return;
    const name=`frame-${String(frames.length).padStart(6,'0')}.png`;
    const time=Math.max(0,event.metadata.timestamp-start);
    frames.push({file:name,time});
    writes.push(writeFile(path.join(framesDir,name),Buffer.from(event.data,'base64')).catch(e=>{failure=e;}));
  });
  await cdp.send('Page.startScreencast',{format:'png',maxWidth:viewport.width,maxHeight:viewport.height,everyNthFrame:1});
  return {
    start,
    async stop(ffmpeg) {
      const duration=Date.now()/1000-start;
      accepting=false;
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      if(failure) throw failure;
      if(frames.length<2) throw Error('Chromium delivered no compositor frames.');
      // Preserve timestamps and holds. Converting to 60fps does not invent frames.
      const ordered=frames.filter((f,i)=>!i || f.time>frames[i-1].time);
      let concat='ffconcat version 1.0\n';
      for(let i=0;i<ordered.length;i++) {
        const dt=(ordered[i+1]?.time ?? duration)-ordered[i].time;
        if(dt<=0) continue;
        concat+=`file '${ordered[i].file}'\noption framerate 1000\nduration ${dt.toFixed(6)}\n`;
      }
      concat+=`file '${ordered.at(-1).file}'\noption framerate 1000\n`;
      await writeFile(path.join(framesDir,'frames.ffconcat'),concat);
      await new Promise((resolve,reject)=>{
        const proc=spawn(ffmpeg,['-y','-v','error','-f','concat','-safe','0','-i',path.join(framesDir,'frames.ffconcat'),'-t',String(duration),'-vf','fps=60','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'prototype.mp4')],{stdio:'inherit'});
        proc.on('error',reject);proc.on('exit',code=>code===0?resolve():reject(Error(`Capture encode failed: ${code}`)));
      });
      const intervals=ordered.slice(1).map((f,i)=>f.time-ordered[i].time).filter(dt=>dt>0 && dt<.1).sort((a,b)=>a-b);
      const median=intervals.length?intervals[Math.floor(intervals.length/2)]:null;
      const metrics={duration,deliveredFrames:ordered.length,medianActiveCadenceFps:median?Number((1/median).toFixed(1)):null,exportFps:60};
      await writeFile(path.join(out,'frames.json'),JSON.stringify({metrics,frames:ordered},null,2));
      return metrics;
    }
  };
}
