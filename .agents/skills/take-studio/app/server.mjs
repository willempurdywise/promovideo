import { captureOffline } from './capture-offline.mjs';
import { saveBrief, loadBrief } from './briefs.mjs';
import { parseStoryboard } from './storyboard.mjs';
import { resolveTarget } from './actions.mjs';
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { prepareProject, projectAsset, projectHeaders, serveProject, unpack } from './prototypes.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const output = process.env.TAKE_OUTPUT_DIR || join(root, 'renders');
const port = Number(process.env.PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const files = new Map([['/', ['index.html', 'text/html']], ['/editor.css', ['editor.css', 'text/css']], ['/editor.js', ['editor.js', 'text/javascript']], ['/sample.html', ['sample.html', 'text/html']]]);
const formats = { landscape: [1920, 1080], square: [1080, 1080], portrait: [1080, 1920] };
const jobs = new Map();
const projects = new Map();
const captureStages = new Map();
const liveURL = process.env.TAKE_PROTOTYPE_URL ? new URL(process.env.TAKE_PROTOTYPE_URL) : null;
if (liveURL && (!['http:', 'https:'].includes(liveURL.protocol) || liveURL.hostname !== '127.0.0.1' ||
  liveURL.origin === origin || liveURL.username || liveURL.password)) {
  throw Error('TAKE_PROTOTYPE_URL must be a separate http(s)://127.0.0.1 prototype address.');
}
const assetOrigins = new Set((process.env.TAKE_ASSET_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean).map(s=>new URL(s).origin));
const liveId = liveURL ? randomUUID() : null;
if (liveURL) projects.set(liveId, { liveURL });
let active = false;
let preparing = false;


function validate(data) {
  if (!projects.has(data.projectId)) throw Error('Choose your prototype folder again before rendering.');
  if (!Object.hasOwn(formats, data.format) || !['desktop', 'mobile'].includes(data.viewport)) throw Error('Choose a valid format and viewport.');
  if (!/^#[0-9a-f]{6}$/i.test(data.colour)) throw Error('Choose a valid background colour.');
  if (data.image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image)) throw Error('Choose a PNG, JPEG, or WebP background.');
  if (typeof data.storyboard !== 'string' || data.storyboard.length > 4000) throw Error('Keep the storyboard under 4,000 characters.');
  if (![.75,1,1.25].includes(data.speed ?? 1) || !['readable','slow','brisk'].includes(data.pace ?? 'readable') || (data.cursor !== undefined && typeof data.cursor !== 'boolean')) throw Error('Choose valid timing and cursor settings.');
  return parseStoryboard(data.storyboard);
}

async function render(job, data, steps, project) {
  const temp = await mkdtemp(join(tmpdir(), 'prototype-video-'));
  let captureBrowser;
  const stagePath = `/__capture-stage/${job.id}`;
  try {
    const bundled = join(root, '..', '.venv', 'bin', 'python');
    const localEncoder = join(root, '.ffmpeg');
    const ffmpeg = process.env.FFMPEG_PATH || (existsSync(localEncoder) && localEncoder) || await promisify(execFile)(bundled, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'])
      .then(result => result.stdout.trim()).catch(() => 'ffmpeg');
    const [width, height] = formats[data.format];
    const [appWidth, appHeight] = data.viewport === 'mobile' ? [390, 844] : [1440, 844];
    const scale = Math.min(width * .84 / appWidth, height * .84 / appHeight);
    captureBrowser = await chromium.launch({
      chromiumSandbox: true,
      args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--disable-frame-rate-limit','--disable-gpu-vsync']
    });
    const browser = captureBrowser;
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', colorScheme: data.appearance?.colourScheme || 'light', reducedMotion:'no-preference' });
    const stage = project.liveURL ? `${origin}${stagePath}` : 'https://stage.invalid/';
    const prototype = project.liveURL?.href || 'https://prototype.invalid/';
    const iframeSource = prototype.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    if (project.liveURL) {
      await context.routeWebSocket('**/*', socket => {
        const target = new URL(socket.url());
        if (target.host === project.liveURL.host) socket.connectToServer();
        else socket.close();
      });
    }
    const cursor = '<div id="cursor"></div>';
    const speed = data.speed ?? 1;
    const pause = {readable:900,slow:1500,brisk:450}[data.pace ?? 'readable'];
    const stageHtml = `<!doctype html>
        <style>body{margin:0;width:100vw;height:100vh;display:grid;place-items:center;background:${data.colour} ${data.image ? `url('${data.image}') center / cover no-repeat` : ''}}
        iframe{width:${appWidth}px;height:${appHeight}px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(${scale});border:0;border-radius:${data.viewport === 'mobile' ? 32 : 14}px;background:white;box-shadow:0 24px 85px #0005} #cursor{opacity:${data.cursor === false ? 0 : 1};display:none;position:absolute;width:18px;height:18px;border:2px solid white;border-radius:50%;background:#171919;box-shadow:0 1px 5px #0008;pointer-events:none;transform:translate(-50%,-50%);transition:left .2s ease,top .2s ease,background .12s}</style>
        <div id="capture-frame"><iframe sandbox="allow-scripts allow-same-origin allow-forms" src="${iframeSource}"></iframe></div>${cursor}`;
    if (project.liveURL) captureStages.set(stagePath, stageHtml);
    await context.route('**/*', route => {
      const url = route.request().url();
      if (project.liveURL && new URL(url).origin === project.liveURL.origin) return route.continue();
      if (assetOrigins.has(new URL(url).origin) && route.request().method()==='GET' && ['image','font','media','stylesheet'].includes(route.request().resourceType())) return route.continue();
      if (project.assets && url.startsWith(prototype) && route.request().method() === 'GET') {
        const asset = projectAsset(project.assets, url, route.request().isNavigationRequest() ? 'document' : '');
        return route.fulfill(asset ? { ...asset, headers: projectHeaders } : { status: 404, body: 'File not found.' });
      }
      if (url === stage && route.request().isNavigationRequest()) {
        return project.liveURL ? route.continue() : route.fulfill({ contentType: 'text/html', body: stageHtml });
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.clock.install();
    page.setDefaultTimeout(3500);
    await page.goto(data.appearance?.nativePhone ? prototype : stage, { timeout: 8000 });
    let app = data.appearance?.nativePhone ? page : page.frameLocator('iframe');
    let nativePhone=false;
    await app.locator('body').waitFor();
    await delay(1000);
    if(data.viewport==='mobile' && data.appearance?.nativePhone){
      await page.locator('.df-phone').first().waitFor({state:'visible'});
      if(data.appearance.deviceLabel){
        await page.locator('.df-picker__chevron').first().locator('..').click();
        await page.getByRole('button',{name:data.appearance.deviceLabel,exact:true}).last().click();
      }
      const phone=page.locator('.df-phone').first();
      const dimensions=await phone.locator('.df-phone__inner').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight}));
      await phone.evaluate(el=>el.classList.add('take-capture-phone'));
      await page.evaluate(({dimensions,width,height,colour,image,cursor})=>{
        const style=document.createElement('style');
        const scale=Math.min(width*.84/dimensions.width,height*.84/dimensions.height);
        style.textContent=`html,body,#root,.df-wrap,.df-gallery-scroll{background:transparent!important;overflow:hidden!important}.df-top-bar,.df-gallery-label,.df-gallery-item:not(:first-child){display:none!important}.take-capture-phone{position:fixed!important;top:50%!important;left:50%!important;margin:0!important;width:${dimensions.width}px!important;height:${dimensions.height}px!important;transform:translate(-50%,-50%) scale(${scale})!important}.take-capture-phone .df-phone__inner{transform:none!important;position:relative}#cursor{opacity:${cursor?1:0};display:none;position:fixed;width:18px;height:18px;border:2px solid white;border-radius:50%;background:#171919;pointer-events:none;transform:translate(-50%,-50%);z-index:2147483647}`;
        document.head.append(style);
        document.documentElement.style.setProperty('background',`${colour} ${image?`url('${image}') center / cover no-repeat`:''}`,'important');
        const marker=document.createElement('div');marker.id='cursor';document.body.append(marker);
      },{dimensions,width,height,colour:data.colour,image:data.image,cursor:data.cursor!==false});
      if(data.appearance.appSearch){
        await phone.locator('iframe').evaluate((frame,search)=>{const url=new URL(frame.src);url.search=search;frame.src=url.href;},data.appearance.appSearch);
      }
      app=app.frameLocator('iframe[title="Mobile App Preview"]');
      await app.locator('body').waitFor();await delay(1000);
      nativePhone=true;
    }
    const inspectImages = async () => app.locator('body').evaluate(async () => {
      await document.fonts.ready;
      const visible=[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;});
      await Promise.all(visible.map(img=>Promise.race([img.decode().catch(()=>{}),new Promise(r=>setTimeout(r,8000))])));
      return visible.filter(img=>!img.complete||!img.naturalWidth).map(img=>img.currentSrc||img.src);
    });
    const readyImages = async () => {
      let timeout;
      try {
        return await Promise.race([inspectImages(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Prototype images did not finish loading.')),10000);})]);
      } finally { clearTimeout(timeout); }
    };
    const missing=await readyImages();
    if(missing.length)throw Error(`Some prototype images could not load (${new URL(missing[0],prototype).hostname}). Check the image source before recording.`);
    const capture = await captureOffline(context,page,temp,width,height,speed);
    let captured;
    const actionTimings=[];
    try {
      await capture.advance(1200);
      for (const [index, step] of steps.entries()) {
        const {action,value}=step;
        job.message = `Capturing step ${index + 1} of ${steps.length}`;
        actionTimings.push({step:index+1,label:step.label,time:capture.time});
        if (capture.time > 90) throw Error('Capture stopped or exceeded the 90-second limit.');
        try {
          if (action === 'hold') await capture.advance(Number(value) * 1000 * speed);

          if (action === 'scroll') await capture.scroll(app,Number(value));
          if (['click','selector','pick','type','amount'].includes(action)) {
            let target,lastError;
            for(let attempt=0;attempt<16;attempt++){
              try{target=await resolveTarget(app,step);break;}catch(error){lastError=error;await capture.advance(250);}
            }
            if(!target)throw lastError;
            await target.waitFor({ state: 'visible' });
            const box = await target.boundingBox();
            const point = {x:box.x+box.width/2,y:box.y+box.height/2};
            await page.locator('#cursor').evaluate((marker, point) => {
              Object.assign(marker.style, { display: 'block', left: `${point.x}px`, top: `${point.y}px` });
            }, point);
            await page.mouse.move(point.x, point.y);
            await capture.advance(240);
            await page.mouse.click(point.x, point.y);
            if(action==='type'||action==='amount'){await target.fill('');for(const character of value){await target.pressSequentially(character,{delay:0});await capture.advance(90);}}
            await page.locator('#cursor').evaluate(marker => {
              marker.style.background = '#8265fc';
              setTimeout(() => { marker.style.background = '#171919'; }, 180);
            });
          }
        } catch (error) {
          console.warn(`Storyboard step ${index + 1}: ${error.message.split('\n')[0]}`);
          const previous=steps.slice(0,index).reverse().find(s=>['click','pick'].includes(s.action));
          throw Error(`Step ${index + 1}: ${error.message.split('\n')[0]}${previous ? ` The last navigation was: ${previous.label}. Check that the prototype includes the next screen.` : ''}`);
        }
        if (action !== 'hold') {await capture.advance(pause * speed);const missing=await readyImages();if(missing.length)throw Error(`Step ${index+1}: an image from ${new URL(missing[0],prototype).hostname} could not load.`);}
      }
      await capture.advance(500);
    } finally {
      captured = await capture.stop();
    }
    job.message = 'Encoding MP4';
    const {frames,duration,metrics}=captured;
    const timeline = frames.map(({ path, time }, index) =>
      `file '${path}'\noption framerate 1000\nduration ${Math.max(.01, (frames[index + 1]?.time ?? duration) - time)}`).join('\n');
    const manifest = join(temp, 'frames.txt');
    await writeFile(manifest, `ffconcat version 1.0\n${timeline}\nfile '${frames.at(-1).path}'\noption framerate 1000\n`);
    const encoded = join(temp, 'video.mp4');
    await runEncoder(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifest,
      '-t', String(duration/speed), '-vf', `setpts=PTS/${speed},fps=60`, '-c:v', 'libx264', '-threads', '4', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', encoded]);
    await runEncoder(ffmpeg, ['-v', 'error', '-xerror', '-i', encoded, '-f', 'null', '-']);
    await mkdir(output, { recursive: true });
    await rename(encoded, join(output, `${job.id}.mp4`)).catch(async error => {
      if (error.code !== 'EXDEV') throw error;
      await writeFile(join(output, `${job.id}.mp4`), await readFile(encoded));
    });
    await writeFile(join(output,`${job.id}.capture.json`),JSON.stringify({metrics,evidence:captured.evidence,actionTimings,appearance:data.appearance,framing:nativePhone?'native phone preview':'app viewport'},null,2));
    job.status = 'ready';
  } finally {
    captureStages.delete(stagePath);
    await captureBrowser?.close();
    await rm(temp, { recursive: true, force: true });
  }
}

function runEncoder(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    process.stderr.on('data', chunk => { error = (error + chunk).slice(-2000); });
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve() : reject(Error(error || 'Video encoding failed.')));
  });
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  const path = req.url?.split('?')[0];
  try {
    if (req.method === 'GET' && captureStages.has(path)) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      return res.end(captureStages.get(path));
    }
    if (req.method === 'GET' && files.has(path)) {
      const [file, type] = files.get(path);
      const body = await readFile(join(root, 'public', file));
      res.writeHead(200, {
        'Content-Type': type,
        ...(path === '/' && { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src http://127.0.0.1:*; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'" })
      });
      return res.end(body);
    }
    if (req.method === 'GET' && path === '/api/live-prototype') {
      return json(res, 200, liveURL ? { id: liveId, url: liveURL.href } : null);
    }
    if (req.method === 'POST' && path === '/api/prototypes') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: 'Open the editor from its local address.' });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 56_000_000) return json(res, 413, { error: 'The prototype folder is too large.' });
        chunks.push(chunk);
      }
      const submitted = JSON.parse(Buffer.concat(chunks).toString());
      if (preparing) return json(res, 409, { error: 'Another prototype is opening. Try again when it finishes.' });
      preparing = true;
      let assets;
      try {
        assets = submitted.sample ? new Map([['index.html', await readFile(join(root, 'public', 'sample.html'))]]) :
          await prepareProject(unpack(submitted.files));
      } finally {
        preparing = false;
      }
      const preview = await serveProject(assets);
      if (projects.size >= 5) {
        const oldest = [...projects.keys()].find(key => key !== liveId);
        projects.get(oldest).preview.close();
        projects.delete(oldest);
      }
      const id = randomUUID();
      projects.set(id, { assets, preview });
      return json(res, 201, { id, url: preview.url });
    }
    if (req.method === 'POST' && path === '/api/briefs') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return json(res,403,{error:'Open the editor from its local address.'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>13_000_000)return json(res,413,{error:'The background image is too large.'});}
      const data=JSON.parse(body);
      const project=projects.get(data.projectId);
      if(!project)throw Error('Open your prototype again before copying a brief.');
      return json(res,201,await saveBrief(output,data,project.liveURL?.href || project.preview.url,origin));
    }
    const settingsId = /^\/api\/briefs\/([a-f0-9-]{36})\/settings$/.exec(path)?.[1];
    if(req.method==='GET' && settingsId){
      const brief=await loadBrief(output,settingsId);
      let image='';
      if(brief.backgroundImage) image=`data:image/${brief.backgroundImage.split('.').at(-1)};base64,${(await readFile(brief.backgroundImage)).toString('base64')}`;
      return json(res,200,{...brief,image});
    }
    const briefStatusId = /^\/api\/briefs\/([a-f0-9-]{36})$/.exec(path)?.[1];
    if(req.method==='GET' && briefStatusId){
      const brief=await loadBrief(output,briefStatusId);
      const job=[...jobs.values()].reverse().find(job=>job.briefId===briefStatusId);
      if(job)return json(res,200,{...job,videoId:job.id,format:brief.format});
      try {return json(res,200,JSON.parse(await readFile(join(output,'briefs',briefStatusId,'result.json'),'utf8')));}
      catch(error){if(error.code!=='ENOENT')throw error;return json(res,200,{status:'waiting'});}
    }
    if (req.method === 'POST' && path === '/api/storyboard') {
      if (req.headers.origin !== origin) return json(res,403,{error:'Open the editor from its local address.'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)return json(res,413,{error:'Storyboard is too long.'});}
      try { return json(res,200,{steps:parseStoryboard(JSON.parse(body).storyboard)}); }
      catch(error){return json(res,400,{error:error.message});}
    }
    if (req.method === 'POST' && path === '/api/render') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: 'Open the editor from its local address.' });
      if (active) return json(res, 409, { error: 'Another video is rendering. Try again when it finishes.' });
      active = true;
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 13_000_000) return json(res, 413, { error: 'The uploaded files are too large.' });
          chunks.push(chunk);
        }
        let data = JSON.parse(Buffer.concat(chunks).toString());
        if (data.briefId) {
          const brief = await loadBrief(output,data.briefId);
          const projectId = [...projects].find(([,p])=>(p.liveURL?.href || p.preview?.url) === brief.prototypeURL)?.[0];
          let image='';
          if(brief.backgroundImage){const type=brief.backgroundImage.split('.').at(-1);image=`data:image/${type};base64,${(await readFile(brief.backgroundImage)).toString('base64')}`;}
          data={...brief,briefId:brief.id,projectId,image,storyboard:data.storyboard};
        }
        const steps = validate(data);
        const job = { id: randomUUID(), briefId:data.briefId, status: 'rendering', message: 'Opening prototype' };
        jobs.set(job.id, job);
        render(job, data, steps, projects.get(data.projectId)).catch(error => {
          job.status = 'failed';
          job.message = error.message;
        }).finally(async () => {
          active = false;
          if(data.briefId)await writeFile(join(output,'briefs',data.briefId,'result.json'),JSON.stringify({...job,videoId:job.id,format:data.format})).catch(error=>console.error('Could not save review status:',error.message));
        });
        return json(res, 202, job);
      } finally {
        if (!res.headersSent || res.statusCode !== 202) active = false;
      }
    }
    const jobId = /^\/api\/render\/([a-f0-9-]{36})$/.exec(path)?.[1];
    if (req.method === 'GET' && jobId && jobs.has(jobId)) return json(res, 200, jobs.get(jobId));
    const videoId = /^\/video\/([a-f0-9-]{36})\.mp4$/.exec(path)?.[1];
    if (req.method === 'GET' && videoId) {
      const file = join(output, `${videoId}.mp4`);
      const { size } = await stat(file);
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(range ? 206 : 200, {
        'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
        ...(range && { 'Content-Range': `bytes ${start}-${end}/${size}` })
      });
      const stream = createReadStream(file, { start, end });
      res.on('close', () => stream.destroy());
      return stream.pipe(res);
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    return json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'File not found.' : error.message });
  }
}).listen(port, '127.0.0.1', () => console.log(`Video canvas: ${origin}/`));
