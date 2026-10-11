export const categories = { study:'学习', work:'工作', life:'生活', health:'健康' };
export const defaultSettings = { startHour:9, endHour:18, lunchBreak:true, skipWeekends:false, buffer:15 };
export const uid = () => globalThis.crypto.randomUUID();
export const dayKey = date => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const dateAt = (day, time='00:00') => new Date(`${day}T${time}:00`);
export const localInput = value => { const d = new Date(value); return `${dayKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const addDays = (date, count) => { const d = new Date(date); d.setDate(d.getDate()+count); return d; };
export const overlap = (a,b,buffer=0) => +new Date(a.start) < +new Date(b.end)+buffer*60000 && +new Date(a.end) > +new Date(b.start)-buffer*60000;
const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(+new Date(value));
export const validEvent = e => !!e && typeof e.id==='string' && typeof e.title==='string' && e.title.trim().length>0 && e.title.length<=500 && Object.hasOwn(categories,e.category) && validDate(e.start) && validDate(e.end) && +new Date(e.end)>+new Date(e.start) && typeof e.notes==='string';
export const validTask = t => !!t && typeof t.id==='string' && typeof t.title==='string' && t.title.trim().length>0 && t.title.length<=500 && Number.isInteger(t.minutes) && t.minutes>=15 && t.minutes<=1440 && validDate(t.deadline) && [1,2,3].includes(t.priority) && Object.hasOwn(categories,t.category) && typeof t.done==='boolean';
export function validateBackup(data) {
  if (!data || data.version!==1 || !Array.isArray(data.events) || !Array.isArray(data.tasks) || data.events.length>10000 || data.tasks.length>10000 || !data.events.every(validEvent) || !data.tasks.every(validTask)) throw new Error('备份内容或版本无效。');
  if (new Set(data.events.map(e=>e.id)).size!==data.events.length || new Set(data.tasks.map(t=>t.id)).size!==data.tasks.length) throw new Error('备份包含重复 ID。');
  const s=data.settings;
  if (!s || !Number.isInteger(s.startHour) || !Number.isInteger(s.endHour) || s.startHour<0 || s.endHour>24 || s.startHour>=s.endHour || typeof s.lunchBreak!=='boolean' || typeof s.skipWeekends!=='boolean' || ![0,5,10,15,30,60].includes(s.buffer)) throw new Error('备份的排程设置无效。');
  return data;
}

export function parseSchedule(text, referenceDay) {
  const reference=dateAt(referenceDay);
  if (!Number.isFinite(+reference)) return [];
  let activeDay=referenceDay, dateWarning='未提供日期，暂用参考日期，请核对', previousTitle='', invalidDate=false;
  const drafts=[];
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.normalize('NFKC').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1').trim();
    if (!line) continue;
    const consumed=[];
    const times=[...line.matchAll(/(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:\s*:\s*(\d{2})|点(?:(\d{1,2})分?|(半))?)/g)];
    const date=[...line.matchAll(/(?:(\d{4})\s*[-/.年]\s*)?(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*(?:日|号)?/g)].find(match=>!times.some(t=>match.index<t.index+t[0].length&&match.index+match[0].length>t.index));
    if(date) {
      const y=+(date[1]||reference.getFullYear()), m=+date[2], d=+date[3], parsed=new Date(y,m-1,d);
      if(y>=1900 && y<=2200 && parsed.getFullYear()===y && parsed.getMonth()===m-1 && parsed.getDate()===d) {
        activeDay=dayKey(parsed); invalidDate=false; dateWarning=date[1]?'':'年份未提供，暂用参考日期的年份，请核对';
      } else { invalidDate=true; activeDay=referenceDay; dateWarning='日期无效，请修改草稿日期后勾选'; }
      consumed.push([date.index,date[0].length]);
    } else {
      const rel=line.match(/今天|明天|后天/);
      if(rel) { activeDay=dayKey(addDays(reference,['今天','明天','后天'].indexOf(rel[0]))); invalidDate=false; dateWarning=`“${rel[0]}”按参考日期解释，请核对`; consumed.push([rel.index,rel[0].length]); }
      if(/周[一二三四五六日天]|星期/.test(line)) dateWarning+='；星期未自动转换，请核对日期';
    }
    const remove=() => { let title=line; for(const [i,n] of [...consumed].sort((a,b)=>b[0]-a[0])) title=title.slice(0,i)+title.slice(i+n); return title.replace(/^[\s\-–—~～至到:：,，;；|]+|[\s\-–—~～至到:：,，;；|]+$/g,''); };
    if (!times.length) { previousTitle=remove() || previousTitle; continue; }
    const clock=(t,inherited='') => { let h=+t[2], m=+(t[3]||t[4]||(t[5]?30:0)); if(h>23||m>59) return null; const p=t[1]||inherited; if(['下午','晚上','中午'].includes(p)&&h<12) h+=12; if(['上午','凌晨','早上'].includes(p)&&h===12) h=0; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };
    const startClock=clock(times[0]); if(!startClock) continue;
    const start=dateAt(activeDay,startClock); let end=new Date(+start+3600000), warnings=dateWarning?[dateWarning]:[];
    if(times.length>=2) {
      const endClock=clock(times[1],times[0][1]); if(!endClock) continue;
      end=dateAt(activeDay,endClock);
      if(end<=start) { end=addDays(end,1); warnings.push('结束按次日解释，请核对'); }
      if(times.length>2) warnings.push('有多个时间，仅提取第一组；请把每条日程分成独立行');
    } else warnings.push('未提供结束时间，暂设 60 分钟');
    consumed.push(...times.map(t=>[t.index,t[0].length]));
    const title=remove()||previousTitle||'图片日程';
    drafts.push({id:uid(),title,start:start.toISOString(),end:end.toISOString(),category:'study',notes:`图片文字：${raw}`,source:raw,warning:warnings.join('；'),selected:!invalidDate});
    previousTitle='';
  }
  return drafts;
}

export function proposePlan(tasks, events, settings, fromDay, now=new Date()) {
  const occupied=[...events], first=dateAt(fromDay), result=[];
  if(!(settings.startHour<settings.endHour) || !Number.isFinite(+first)) return result;
  const ordered=tasks.filter(t=>!t.done&&!events.some(e=>e.taskId===t.id)).sort((a,b)=>b.priority-a.priority||+new Date(a.deadline)-+new Date(b.deadline)||a.id.localeCompare(b.id));
  for(const task of ordered) {
    let found=null;
    if(!validTask(task)) { result.push({task,event:null,reason:'任务信息无效'}); continue; }
    const initial=dateAt(dayKey(new Date(Math.max(+first,+now))));
    for(let offset=0; offset<=90&&!found; offset++) {
      const day=addDays(initial,offset); if(day>new Date(task.deadline)) break;
      if(settings.skipWeekends && [0,6].includes(day.getDay())) continue;
      const begin=new Date(day); begin.setHours(settings.startHour,0,0,0);
      const finish=new Date(day); finish.setHours(settings.endHour,0,0,0);
      const lunchStart=new Date(day); lunchStart.setHours(12,0,0,0); const lunchEnd=new Date(day); lunchEnd.setHours(13,0,0,0);
      let candidate=new Date(Math.max(+begin,+now));
      const round=(15-candidate.getMinutes()%15)%15;
      candidate.setMinutes(candidate.getMinutes()+round,0,0); if(candidate<now) candidate.setMinutes(candidate.getMinutes()+15);
      while(candidate<finish) {
        const end=new Date(+candidate+task.minutes*60000);
        if(end>finish||end>new Date(task.deadline)) break;
        const event={id:uid(),title:task.title,start:candidate.toISOString(),end:end.toISOString(),category:task.category,notes:'来自个人时间规划',taskId:task.id};
        const lunch=settings.lunchBreak && candidate<lunchEnd && end>lunchStart;
        if(!lunch&&!occupied.some(e=>overlap(event,e,settings.buffer))) { found=event; occupied.push(event); break; }
        candidate=new Date(+candidate+15*60000);
      }
    }
    result.push({task,event:found,reason:found?'已避开日程、休息和缓冲时间':'截止前没有足够的连续空闲时间（最多查找 90 天）'});
  }
  return result;
}
