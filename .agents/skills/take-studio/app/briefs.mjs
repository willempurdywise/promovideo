import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function validateBrief(data) {
  if(data.appearance && (!['light','dark'].includes(data.appearance.colourScheme) || typeof data.appearance.nativePhone !== 'boolean' || typeof data.appearance.deviceLabel !== 'string' || data.appearance.deviceLabel.length>80 || typeof data.appearance.appSearch !== 'string' || data.appearance.appSearch.length>400)) throw Error('Check the prototype appearance.');
  if (!['landscape','square','portrait'].includes(data.format) || !['mobile','desktop'].includes(data.viewport)) throw Error('Choose a format and viewport.');
  if (!/^#[0-9a-f]{6}$/i.test(data.colour)) throw Error('Choose a background colour.');
  if (data.image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image)) throw Error('Choose a PNG, JPEG or WebP background.');
  if (typeof data.storyboard !== 'string' || !data.storyboard.trim() || data.storyboard.length > 4000) throw Error('Describe your storyboard in 4,000 characters or fewer.');
  if (![.75,1,1.25].includes(data.speed) || !['readable','slow','brisk'].includes(data.pace) || typeof data.cursor !== 'boolean') throw Error('Choose speed, pauses and cursor settings.');
  if (data.review && (!/^[a-f0-9-]{36}$/.test(data.review.videoId) || !Array.isArray(data.review.comments) || data.review.comments.length > 100 || data.review.comments.some(c=>!Number.isFinite(c.time)||c.time<0||typeof c.text!=='string'||c.text.length>1000))) throw Error('Check your review comments.');
}
export async function saveBrief(output, data, prototypeURL, origin) {
  validateBrief(data);
  const id = randomUUID();
  const directory = join(output, 'briefs', id);
  await mkdir(directory, { recursive:true });
  let backgroundImage = null;
  if (data.image) {
    const [,type,base64] = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(data.image);
    backgroundImage = join(directory, `background.${type}`);
    await writeFile(backgroundImage, Buffer.from(base64,'base64'));
  }
  const {image, ...settings} = data;
  const brief = { id, ...settings, prototypeURL, editorURL:origin, backgroundImage,
    viewportSize: data.viewport==='mobile'?[390,844]:[1440,844], createdAt:new Date().toISOString() };
  const file = join(directory,'brief.json');
  await writeFile(file, JSON.stringify(brief,null,2));
  const format = {landscape:'16:9 — 1920 × 1080',square:'1:1 — 1080 × 1080',portrait:'9:16 — 1080 × 1920'}[data.format];
  const text = `Use $take-studio to create or revise this prototype video, then return it to Take Studio for review.

Brief file: ${file}
Take Studio: ${origin}
Prototype: ${prototypeURL}
Format: ${format}
Viewport: ${data.viewport} — ${brief.viewportSize.join(' × ')}
Background: ${backgroundImage || data.colour}
Theme: ${data.appearance?.colourScheme || 'not saved'}${data.appearance?.verified===false?' (system preference; prototype theme not verified)':''}
Framing: ${data.appearance?.nativePhone ? 'native phone preview, including iOS status bar and device frame; preserve its actual screen dimensions' : 'app viewport'}
Capture: native animation timelines sampled at 60 fps, lossless source frames
Playback speed: ${data.speed}×
Reading pauses: ${data.pace}; explicit storyboard pauses are final-video seconds.
Cursor: ${data.cursor?'on':'off'}

Storyboard:
${data.storyboard}
${data.review ? `\nPrevious video: ${join(output,data.review.videoId+'.mp4')}\nTimestamped feedback (seconds in the previous video):\n${data.review.comments.map(c=>`${c.time.toFixed(1)}s: ${c.text}`).join('\n') || 'No comments.'}\n` : ''}
Inspect and rehearse the actual prototype to interpret the storyboard. Resolve descriptive controls such as “recipient currency pill” from the live UI; do not require exact button names. Do not invent missing screens or change the prototype to make the journey work.
Read the brief file for the saved settings and background. After rehearsal, POST JSON to ${origin}/api/render with Origin: ${origin} and Content-Type: application/json. Use {"briefId":"${id}","storyboard":"<verified explicit commands, one per line>"}. The server restores the saved presentation settings. Supported capture commands: selector <inspected CSS selector>, click <visible name>, type <value> (focused input), enter <value> in <field>, hold <seconds>, scroll <pixels>. Do not pass the original prose directly to the capture parser.
Poll the returned /api/render/<id> until ready. Inspect the MP4 visually before handing it back; Take Studio will load it automatically. If the journey cannot be captured with these commands, explain the specific limitation. Use the original brief and comments when making revisions.`;
  await writeFile(join(directory,'brief.txt'),text);
  return {id,text,file};
}
export async function loadBrief(output,id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid video brief.');
  return JSON.parse(await readFile(join(output,'briefs',id,'brief.json'),'utf8'));
}
