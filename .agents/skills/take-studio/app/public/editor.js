const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
const palette = [['Bright Green','#9fe870'],['Forest Green','#163300'],['Bright Yellow','#ffeb69'],['Dark Gold','#3a341c'],['Bright Blue','#a0e1e1'],['Bright Pink','#ffd7ef'],['Dark Maroon','#320707']];
const sampleStoryboard = 'hold 1\nclick Get started\nhold 0.7\nselector #name\ntype Studio North\nclick Create workspace\nhold 1.8';
const ratios = { landscape: 16 / 9, square: 1, portrait: 9 / 16 };
let prototype;
let settingsOpen = false;
let colour = palette[0][1];
let image = '';
let mode = 'preview';
let currentVideo;
let annotationTime = 0;
let comments = [];
const storageKey = 'take-studio:last-review';
const readStorage = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function status(message) { (ui.editor.hidden ? ui.startStatus : ui.status).textContent = message; }
function setSettings(open) {
  settingsOpen = open;
  ui.settings.hidden = !open;
  ui.editor.classList.toggle('without-sidebar', !open);
  ui.settingsToggle.setAttribute('aria-expanded', String(open));
  ui.settingsToggle.setAttribute('aria-label',open ? 'Close video settings' : 'Open video settings');
  ui.render.hidden = !open || !prototype;
  layout();
}
function showEditor() {
  ui.startScreen.hidden = true;
  ui.editor.hidden = false;
  ui.settingsToggle.hidden = false;
}
function stamp(time) {
  const ticks = Math.floor((time || 0) * 10);
  return `${String(Math.floor(ticks / 600)).padStart(2, '0')}:${String(Math.floor(ticks / 10) % 60).padStart(2, '0')}.${ticks % 10}`;
}
function layout() {
  if (ui.editor.hidden) return;
  if (mode === 'preview') {
    ui.stage.removeAttribute('style');
    ui.stage.classList.add('explore');
    ui.prototypePreview.removeAttribute('style');
    Object.assign(ui.prototypePreview.style,{width:`${Math.max(640,ui.stageWrap.clientWidth)}px`,height:'100%',left:'50%',transform:'translateX(-50%)'});
    ui.stage.classList.remove('mobile-preview');
    return;
  }
  ui.stage.classList.remove('explore', 'mobile-preview');
  const ratio = ratios[mode === 'review' ? currentVideo.format : ui.format.value];
  const box = ui.stageWrap.getBoundingClientRect();
  const padding = getComputedStyle(ui.stageWrap);
  const width = Math.max(1, Math.min(box.width - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight),
    (box.height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom)) * ratio));
  ui.stage.style.width = `${width}px`;
  ui.stage.style.height = `${width / ratio}px`;
  ui.stage.style.backgroundColor = colour;
  ui.stage.style.backgroundImage = image ? `url("${image}")` : '';
  const mobile = ui.viewport.value === 'mobile';
  const [appWidth, appHeight] = mobile ? [390, 844] : [1200, 750];
  const scale = Math.min(width * .84 / appWidth, width / ratio * .84 / appHeight);
  Object.assign(ui.prototypePreview.style, {
    width: `${appWidth}px`, height: `${appHeight}px`,
    transform: `translate(-50%, -50%) scale(${scale})`, borderRadius: mobile ? '32px' : '14px'
  });
}
function setMode(next) {
  if (next === 'preview' && !prototype) return;
  mode = next;
  document.body.classList.toggle('reviewing', next === 'review');
  const reviewing = next === 'review';
  if (!reviewing) ui.video.pause();
  ui.prototypePreview.hidden = reviewing;
  ui.video.hidden = !reviewing;
  ui.previewTab.setAttribute('aria-pressed', String(!reviewing));
  ui.reviewTab.setAttribute('aria-pressed', String(reviewing));
  ui.feedback.hidden = !reviewing;
  ui.settingsBody.hidden = reviewing;
  ui.subtitle.textContent = reviewing ? 'Scrub to a moment and leave feedback.' : 'Click through your prototype to plan your storyboard.';
  ui.timelineHint.textContent = reviewing ? 'Select a marker to jump to its comment.' :
    currentVideo ? 'Open Review to scrub and leave feedback.' : 'Create a video to scrub and leave timestamped feedback.';
  updateTime();
  drawComments();
  layout();
}
function startPrototype(project, name, storyboard = '') {
  prototype = project;
  ui.sourceName.textContent = name;
  ui.storyboard.value = storyboard || readStorage('take-studio:storyboard-draft','');
  syncControls();

  ui.prototypePreview.src = project.url;
  ui.previewTab.disabled = false;
  showEditor();
  setSettings(false);
  setMode('preview');
  status('');
}
ui.settingsToggle.onclick = () => setSettings(!settingsOpen);
ui.closeSettings.onclick = () => { setSettings(false); ui.settingsToggle.focus(); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && settingsOpen) { setSettings(false); ui.settingsToggle.focus(); } });
ui.restart.onclick = () => {
  if (!prototype) return;
  ui.prototypePreview.src = prototype.url;
  setMode('preview');
};
function setImage(data, name = '') {
  image = data;
  ui.imageName.textContent = name;
  ui.removeImage.hidden = !image;
  for (const button of ui.swatches.querySelectorAll('button')) button.setAttribute('aria-pressed', String(!image && colour === button.dataset.colour));
  if (prototype) setMode('preview');
}
for (const [name, hex] of palette) {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.background = hex;
  button.dataset.colour = hex;
  button.title = name;
  button.setAttribute('aria-label', name);
  button.onclick = () => {
    colour = hex;
    customColour.value = hex; ui.hexColour.value = ''; ui.hexColour.removeAttribute('aria-invalid');
    ui.image.value = '';
    setImage('');
  };
  ui.swatches.append(button);
}
const customColour = document.createElement('input');
customColour.type = 'color';
customColour.value = colour;
customColour.setAttribute('aria-label', 'Custom background colour');
customColour.oninput = () => {
  colour = customColour.value;
  ui.image.value = '';
  setImage('');
};
customColour.hidden = true;
ui.swatches.append(customColour);

async function registerProject(payload) {
  return getJSON(await fetch('/api/prototypes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }));
}
function encodeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
let loadingFolder = false;
async function chooseFolder(event) {
  const entries = [...event.target.files].map(file => [file.webkitRelativePath.split('/'), file]);
  event.target.value = '';
  if (!entries.length || loadingFolder) return;
  loadingFolder = true;
  try {
    status('Opening prototype folder…');
    const rootName = entries[0][0][0];
    const allowed = entries.filter(([parts]) => parts.slice(1).every(part =>
      !part.startsWith('.') && part !== 'node_modules' && part !== '__MACOSX'));
    const entriesByPath = allowed.map(([parts, file]) => [parts.slice(1).join('/'), file]);
    const byPath = new Map(entriesByPath);
    const manifest = byPath.get('package.json');
    const source = manifest && typeof JSON.parse(await manifest.text()).scripts?.build === 'string';
    const outputFolders = ['dist/', 'build/', 'out/'];
    const built = outputFolders.find(prefix => byPath.has(prefix + 'index.html'));
    const buildRoot = source ? '' : built ?? (byPath.has('index.html') ? '' : undefined);
    if (buildRoot === undefined) throw Error('Choose a folder containing index.html or package.json.');
    const selected = entriesByPath.filter(([path]) => path.startsWith(buildRoot) &&
      (!source || !outputFolders.some(prefix => path.startsWith(prefix))));
    if (source) status('Installing dependencies and building the prototype…');
    if (selected.length > 2500 || selected.reduce((size, [, file]) => size + file.size, 0) > 40_000_000) {
      throw Error('Choose a prototype folder under 40 MB with at most 2,500 files.');
    }
    const files = [];
    for (const [path, file] of selected) files.push([path.slice(buildRoot.length), await encodeFile(file)]);
    startPrototype(await registerProject({ files }), rootName);
  } catch (error) { status(error.message); }
  finally { loadingFolder = false; }
}
ui.folder.onchange = ui.changeFolder.onchange = chooseFolder;
ui.sample.onclick = async () => {
  if (loadingFolder) return;
  loadingFolder = true;
  try { startPrototype(await registerProject({ sample: true }), 'Sample prototype', sampleStoryboard); }
  catch (error) { status(error.message); }
  finally { loadingFolder = false; }
};
ui.image.onchange = () => {
  const file = ui.image.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 7_000_000) {
    ui.image.value = '';
    return status('Choose a PNG, JPEG, or WebP under 7 MB.');
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const asset = new Image();
      asset.src = reader.result;
      await asset.decode();
      setImage(reader.result, file.name);
      status('');
    } catch { status('The selected image could not be opened.'); }
  };
  reader.onerror = () => status('The selected image could not be read.');
  reader.readAsDataURL(file);
};
ui.removeImage.onclick = () => { ui.image.value = ''; setImage(''); };
ui.viewport.onchange = ui.format.onchange = () => setMode('preview');
ui.previewTab.onclick = () => setMode('preview');
ui.reviewTab.onclick = () => setMode('review');
new ResizeObserver(layout).observe(ui.stageWrap);

function updateTime() {
  const length = Number.isFinite(ui.video.duration) ? ui.video.duration : 0;
  const reviewing = mode === 'review' && length > 0;
  ui.play.disabled = ui.scrub.disabled = ui.annotate.disabled = !reviewing;
  ui.time.textContent = stamp(reviewing ? ui.video.currentTime : 0);
  ui.duration.textContent = stamp(reviewing ? length : 0);
  ui.scrub.max = reviewing ? length : 0;
  ui.scrub.value = reviewing ? ui.video.currentTime : 0;
  ui.play.textContent = ui.video.paused ? '▶' : 'Ⅱ';
  ui.play.setAttribute('aria-label', ui.video.paused ? 'Play' : 'Pause');
}
function jump(time) {
  ui.video.pause();
  ui.video.currentTime = time;
  updateTime();
}
function drawComments() {
  ui.comments.replaceChildren();
  ui.markers.replaceChildren();
  if (mode !== 'review') return;
  if (!comments.length) ui.comments.textContent = 'No comments yet.';
  for (const { time, text } of comments) {
    const button = document.createElement('button');
    const label = document.createElement('strong');
    label.textContent = stamp(time);
    button.append(label, document.createTextNode(text));
    button.onclick = () => jump(time);
    ui.comments.append(button);
    if (!(ui.video.duration > 0)) continue;
    const marker = document.createElement('button');
    marker.style.left = `${time / ui.video.duration * 100}%`;
    marker.title = `${stamp(time)} · ${text}`;
    marker.setAttribute('aria-label', marker.title);
    marker.onclick = () => { jump(time); button.focus(); };
    ui.markers.append(marker);
  }
}
ui.play.onclick = () => ui.video.paused ? ui.video.play().catch(error => status(error.message)) : ui.video.pause();
ui.scrub.oninput = () => jump(Number(ui.scrub.value));
for (const event of ['timeupdate', 'play', 'pause', 'emptied']) ui.video.addEventListener(event, updateTime);
ui.video.addEventListener('loadedmetadata', () => { updateTime(); drawComments(); });
ui.video.addEventListener('error', () => status('This browser could not play the video. Download the MP4 or try another browser.'));
function closeComment() { ui.commentForm.hidden = true; ui.commentText.value = ''; }
ui.annotate.onclick = () => {
  ui.video.pause();
  setSettings(true);
  annotationTime = ui.video.currentTime;
  ui.commentTime.textContent = `Comment at ${stamp(annotationTime)}`;
  ui.commentForm.hidden = false;
  ui.commentText.focus();
};
ui.cancel.onclick = closeComment;
ui.commentForm.onsubmit = event => {
  event.preventDefault();
  const text = ui.commentText.value.trim();
  if (!text) return;
  comments = [...comments, { time: annotationTime, text }].sort((a, b) => a.time - b.time);
  if (!store(`take-studio:comments:${currentVideo.id}`, comments)) status('Browser storage is full. This comment is available until the page closes.');
  closeComment();
  drawComments();
};
async function openVideo(project) {
  if (project.briefId) {
    try {
      const saved = await getJSON(await fetch(`/api/briefs/${project.briefId}/settings`));
      colour = saved.colour; customColour.value = colour;
      ui.format.value = saved.format; ui.viewport.value = saved.viewport;
      ui.speed.value = String(saved.speed); ui.pace.value = saved.pace; ui.cursor.checked = saved.cursor;
      ui.storyboard.value = saved.storyboard;
      syncControls();
      setImage(saved.image, saved.image ? 'Saved background' : '');
    } catch (error) { status(error.message); }
  }
  showEditor();
  currentVideo = project;
  comments = readStorage(`take-studio:comments:${project.id}`, []);
  closeComment();
  ui.video.src = `/video/${project.id}.mp4`;
  ui.download.href = ui.video.src;
  ui.download.hidden = false;
  ui.reviewTab.disabled = false;
  setSettings(true);
  setMode('review');
}
async function getJSON(response) {
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'The video request failed.');
  return result;
}
let pendingBrief = readStorage('take-studio:pending-brief', null);
let checkingBrief = false;
async function readAppearance() {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { window.removeEventListener('message', receive); resolve({colourScheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',nativePhone:false,deviceLabel:'',appSearch:'',verified:false}); }, 2500);
    function receive(event) {
      if (event.source !== ui.prototypePreview.contentWindow || event.origin !== new URL(prototype.url).origin || event.data?.type !== 'take-studio:appearance' || event.data.requestId !== requestId) return;
      clearTimeout(timeout); window.removeEventListener('message',receive); resolve(event.data.appearance);
    }
    window.addEventListener('message',receive);
    ui.prototypePreview.contentWindow.postMessage({type:'take-studio:appearance-request',requestId},new URL(prototype.url).origin);
  });
}
function settingsPayload() {
  return { projectId: prototype.id, colour, image, format: ui.format.value,
    viewport: ui.viewport.value, speed: Number(ui.speed.value), pace: ui.pace.value,
    cursor: ui.cursor.checked, storyboard: ui.storyboard.value,
    review: currentVideo ? { videoId: currentVideo.id, comments } : null };
}
ui.render.onclick = async () => {
  if (!prototype || !ui.storyboard.value.trim()) return status('Describe what you want to show in the storyboard.');
  ui.render.disabled = true;
  ui.copyFallback.hidden = true;
  try {
    const appearance = await readAppearance();
    const brief = await getJSON(await fetch('/api/briefs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...settingsPayload(),appearance})
    }));
    pendingBrief = { id: brief.id, format: ui.format.value };
    store('take-studio:pending-brief', pendingBrief);
    try {
      await navigator.clipboard.writeText(brief.text);
      status('Brief copied. Paste it into your project chat.');
    } catch {
      ui.briefText.value = brief.text;
      ui.copyFallback.hidden = false;
      ui.briefText.focus();
      ui.briefText.select();
      status('Your brief is ready. Copy the text below into your project chat.');
    }
  } catch (error) { status(error.message); }
  finally { ui.render.disabled = false; }
};
async function checkBrief() {
  if (!pendingBrief || checkingBrief) return;
  checkingBrief = true;
  const expected = pendingBrief.id;
  try {
    const result = await getJSON(await fetch(`/api/briefs/${expected}`));
    if (pendingBrief?.id !== expected) return;
    if (result.status === 'rendering') {
      ui.renderBadge.hidden = false;
      status(result.message);
    } else if (result.status === 'ready') {
      const project = { id: result.videoId, format: result.format, briefId:expected };
      store(storageKey, project);
      pendingBrief = null; store('take-studio:pending-brief', null);
      ui.renderBadge.hidden = true;
      await openVideo(project);
      status('Video ready. Add comments, then copy a brief for your next edit.');
    } else if (result.status === 'failed') {
      ui.renderBadge.hidden = true;
      status(result.message);
    }
  } catch { /* The editor may be restarting. Keep the saved brief for the next check. */ }
  finally { checkingBrief = false; }
}
setInterval(checkBrief, 3000);
checkBrief();

setImage('');
const previous = readStorage(storageKey, null);
if (previous && Object.hasOwn(ratios, previous.format) && /^[a-f0-9-]{36}$/.test(previous.id)) {
  ui.resume.hidden = false;
  ui.reviewTab.disabled = false;
  ui.reviewTab.onclick = () => currentVideo ? setMode('review') : openVideo(previous);
  ui.resume.onclick = () => {
    ui.previewTab.disabled = true;
    openVideo(previous);
  };
}

fetch('/api/live-prototype').then(getJSON).then(project => {
  if (!project || prototype || loadingFolder) return;
  if (currentVideo) {
    prototype = project; ui.sourceName.textContent = 'Project preview';
    ui.prototypePreview.src = project.url; ui.previewTab.disabled = false; setSettings(true);
    return;
  }
  startPrototype(project, 'Project preview');
  ui.viewport.value = 'mobile';
  setSettings(false);
}).catch(error => status(error.message));

ui.storyboard.addEventListener('input',()=>store('take-studio:storyboard-draft',ui.storyboard.value));
ui.exampleStory.onclick=()=>{ui.storyboard.value='Tap Send, choose the first recipient and enter 100. Open the recipient currency pill and change it to euros. Pause for 2 seconds, then end the video.';ui.storyboard.dispatchEvent(new Event('input'));ui.storyboard.focus();};

const reviewLink = new URLSearchParams(location.search);
if (/^[a-f0-9-]{36}$/.test(reviewLink.get('video') || '') && /^[a-f0-9-]{36}$/.test(reviewLink.get('brief') || '')) {
  fetch(`/api/briefs/${reviewLink.get('brief')}/settings`).then(getJSON).then(saved => {
    const project={id:reviewLink.get('video'),briefId:saved.id,format:saved.format};
    store(storageKey,project); return openVideo(project);
  }).catch(error=>status(error.message));
}

function syncControls() {
  for (const button of ui.formatSegments.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.value===ui.format.value));
  for (const button of ui.cursorSegments.querySelectorAll('button')) button.setAttribute('aria-pressed',String((button.dataset.value==='yes')===ui.cursor.checked));
  const index=['0.75','1','1.25'].indexOf(ui.speed.value);
  ui.timing.value=String(Math.max(0,index));
  ui.timing.style.setProperty('--progress',`${Math.max(0,index)*50}%`);
  ui.timing.setAttribute('aria-valuetext',`${ui.speed.value} times playback speed, ${ui.pace.selectedOptions[0].textContent.toLowerCase()} pauses`);
  ui.hexColour.value=palette.some(([,hex])=>hex.toLowerCase()===colour.toLowerCase())?'':colour;
}
ui.optionsToggle.onclick=()=>{
  const open=ui.prototypeOptions.hidden;
  ui.prototypeOptions.hidden=!open;
  ui.optionsToggle.setAttribute('aria-expanded',String(open));
};
for(const button of ui.formatSegments.querySelectorAll('button')) button.onclick=()=>{
  ui.format.value=button.dataset.value;syncControls();setMode('preview');
};
for(const button of ui.cursorSegments.querySelectorAll('button')) button.onclick=()=>{
  ui.cursor.checked=button.dataset.value==='yes';syncControls();
};
ui.timing.oninput=()=>{
  const index=Number(ui.timing.value);
  ui.speed.value=['0.75','1','1.25'][index];ui.pace.value=['slow','readable','brisk'][index];syncControls();
};
ui.pace.onchange=syncControls;
ui.hexColour.onchange=()=>{
  let value=ui.hexColour.value.trim();if(!value.startsWith('#'))value='#'+value;
  if(!/^#[a-f0-9]{6}$/i.test(value)){ui.hexColour.setAttribute('aria-invalid','true');return status('Enter a 6-digit hex colour.');}
  ui.hexColour.removeAttribute('aria-invalid');colour=value;customColour.value=value;ui.image.value='';setImage('');status('');
};
syncControls();

ui.prototypePreview.addEventListener('load',()=>{
  if(!prototype)return;
  ui.prototypePreview.contentWindow.postMessage({type:'take-studio:presentation'},new URL(prototype.url).origin);
});
