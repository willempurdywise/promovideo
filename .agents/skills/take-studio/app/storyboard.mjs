const verbs='click|tap|press|select|choose|pick|type|enter|add|set|hold|wait|pause|scroll';
const clean=s=>s.trim().replace(/^["“']|["”']$/g,'');
export function parseStoryboard(storyboard) {
 if(typeof storyboard!=='string'||storyboard.length>4000)throw Error('Keep your storyboard under 4,000 characters.');
 const lines=storyboard.trim().replace(/[.!]$/,'').split(new RegExp('\\n|\\s*[,;]\\s*(?=(?:then\\s+)?(?:'+verbs+')\\b)|\\.\\s+(?=(?:then\\s+)?(?:'+verbs+')\\b)|\\s+(?:and\\s+then|then|and)\\s+(?=(?:'+verbs+')\\b)','i')).map(s=>s.trim().replace(/^(?:then|please)\s+/i,'')).filter(Boolean);
 if(!lines.length)throw Error('Describe what you want to show first.');
 const steps=[];
 for(const line of lines){
  let m;
  if(m=/^selector\s+(.+)$/i.exec(line))steps.push({action:'selector',value:m[1],label:`Click ${m[1]}`});
  else if(m=/^(?:click|tap|press|select|choose|pick)(?:\s+on)?\s+(?:the\s+)?(first|second|third|\d+)(?:st|nd|rd|th)?\s+(recipient|contact|item|option)(?:\s+in\s+(?:the\s+)?list)?$/i.exec(line)) {const index=({first:1,second:2,third:3})[m[1].toLowerCase()]??Number(m[1]);if(index<1||index>25)throw Error('Choose an item between 1 and 25.');steps.push({action:'pick',value:m[2].toLowerCase(),index,label:`Select ${m[1]} ${m[2]}`});}
  else if(m=/^(?:click|tap|press|select|choose|pick)(?:\s+on)?\s+(.+)$/i.exec(line)){const value=clean(m[1].replace(/^the\s+/i,'').replace(/\s+button$/i,''));steps.push({action:'click',value,label:`Click “${value}”`});}
  else if(m=/^(?:add|set)(?:\s+(?:the\s+)?amount(?:\s+to)?)?\s+([£$€]?\d[\d,.]*)(?:\s+[A-Z]{3})?$/i.exec(line)){const value=m[1].replace(/[£$€,]/g,'');steps.push({action:'amount',value,label:`Enter ${value} in the amount field`});}
  else if(m=/^(?:type|enter)\s+(.+?)(?:\s+(?:into|in)\s+(?:the\s+)?(.+?)(?:\s+field)?)?$/i.exec(line)){const value=clean(m[1]);const field=m[2]&&clean(m[2]);steps.push({action:'type',value,...(field?{field}:{}),label:`Type “${value}”${field?` in “${field}”`:''}`});}
  else if(m=/^(?:hold|wait|pause)(?:\s+for)?\s+(\d+(?:\.\d+)?)(?:\s*(?:seconds?|secs?|s))?$/i.exec(line)) steps.push({action:'hold',value:m[1],label:`Wait ${m[1]} seconds`});
  else if(m=/^scroll\s+(?:(up|down)\s+)?(-?\d+)(?:\s*(?:px|pixels))?$/i.exec(line)){const value=String(Number(m[2])*(m[1]?.toLowerCase()==='up'?-1:1));steps.push({action:'scroll',value,label:`Scroll ${Number(value)<0?'up':'down'} ${Math.abs(Number(value))} pixels`});}
  else throw Error(`I couldn't turn “${line}” into a step. Try “click Send”, “select the first recipient”, “add 100”, or “wait 2 seconds”.`);
 }
 if(steps.length>25)throw Error('Keep the storyboard to 25 steps or fewer.');
 for(const {action,value} of steps)if(!value || action==='hold' && !(Number(value)>=.2&&Number(value)<=10) || action==='scroll' && Math.abs(Number(value))>3000)throw Error('Use pauses between 0.2 and 10 seconds and scrolls up to 3,000 pixels.');
 return steps;
}
