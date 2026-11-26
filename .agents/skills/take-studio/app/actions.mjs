const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const nameMatch=s=>new RegExp('^\\s*'+escape(s).replace(/\s+/g,'\\s+')+'\\s*$','i');
async function onscreen(locator){
 const result=[];
 for(let i=0;i<await locator.count();i++){
  const el=locator.nth(i);
  if(!await el.isVisible()||!await el.isEnabled())continue;
  if(await el.evaluate(e=>{const r=e.getBoundingClientRect();const x=Math.max(0,r.left)+Math.min(r.width,innerWidth-Math.max(0,r.left))/2;const y=Math.max(0,r.top)+Math.min(r.height,innerHeight-Math.max(0,r.top))/2;if(r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth)return false;const hit=document.elementFromPoint(x,y);return !!hit&&(e===hit||e.contains(hit)||hit.contains(e)||e.closest('label')===hit);}))result.push(el);
 }
 return result;
}
export async function resolveTarget(app,step){
 const {action,value}=step;
 if(action==='selector'){const items=await onscreen(app.locator(value));if(items.length===1)return items[0];}
 if(action==='click'){
  for(const loc of [app.getByRole('button',{name:nameMatch(value)}),app.getByRole('link',{name:nameMatch(value)}),app.getByLabel(nameMatch(value)),app.getByText(nameMatch(value))]){const items=await onscreen(loc);if(items.length===1)return items[0];if(items.length>1)throw Error(`More than one “${value}” is on screen. Use a more specific name.`);}
 }
 if(action==='pick'){
  // Existing recipient-list semantics; only inspect the current, visible list.
  const selectors=/recipient|contact/.test(value)?['.send-flow__list .wds-list-item-view','.send-flow__list > li','[aria-label*="recipient" i] [role="listitem"]','[role="list"] [role="listitem"]']:['[role="listbox"] [role="option"]','[role="list"] [role="listitem"]'];
  for(const selector of selectors){const items=await onscreen(app.locator(selector));if(items.length>=step.index)return items[step.index-1];}
 }
 if(action==='type'||action==='amount'){
  const options=step.field?[app.getByLabel(nameMatch(step.field)),app.getByPlaceholder(nameMatch(step.field))]:[app.locator('input:focus,textarea:focus'),app.locator('input[inputmode="decimal"],input[inputmode="numeric"],input[type="number"]'),app.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="search"]),textarea')];
  for(const locator of options){const items=await onscreen(locator);if(items.length===1)return items[0];}
 }
 throw Error(action==='pick'?`No visible ${value} list contains item ${step.index}.`:action==='type'||action==='amount'?'Choose a field, for example “enter 100 in Amount”.':`“${value}” isn't available on this screen. Check the step before it or use the control's visible name.`);
}
export async function waitTarget(app,step){
 let last;
 for(let i=0;i<16;i++){try{return await resolveTarget(app,step)}catch(e){last=e;await new Promise(r=>setTimeout(r,250));}}
 throw last;
}
