export const categories = { study:'学习', work:'工作', life:'生活', health:'健康' };
export const defaultSettings = { startHour:9, endHour:18, lunchBreak:true, skipWeekends:false, buffer:15 };
export const uid = () => globalThis.crypto.randomUUID();
export const dayKey = date => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const dateAt = (day, time='00:00') => new Date(`${day}T${time}:00`);
export const localInput = value => { const d = new Date(value); return `${dayKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const addDays = (date, count) => { const d = new Date(date); d.setDate(d.getDate()+count); return d; };
export const startOfWeek = day => {
  const date=dateAt(dayKey(day instanceof Date?day:dateAt(day)));
  return addDays(date,-((date.getDay()+6)%7));
};

// Clip events to local calendar days, then assign separate lanes to overlaps.
export function layoutWeek(events, anchorDay) {
  const monday=startOfWeek(anchorDay);
  return Array.from({length:7},(_,index)=>{
    const date=addDays(monday,index), nextDay=addDays(date,1), day=dayKey(date);
    const segments=events.filter(e=>validEvent(e)&&+new Date(e.start)<+nextDay&&+new Date(e.end)>+date).map(event=>{
      const start=new Date(Math.max(+date,+new Date(event.start))),end=new Date(Math.min(+nextDay,+new Date(event.end)));
      const startMinute=start.getHours()*60+start.getMinutes();
      const endMinute=+end===+nextDay?1440:Math.max(startMinute+1,end.getHours()*60+end.getMinutes());
      return {event,day,start:start.toISOString(),end:end.toISOString(),startMinute,endMinute,
        continuesBefore:+new Date(event.start)<+date,continuesAfter:+new Date(event.end)>+nextDay,lane:0,laneCount:1};
    }).sort((a,b)=>+new Date(a.start)-+new Date(b.start)||+new Date(b.end)-+new Date(a.end)||a.event.id.localeCompare(b.event.id));
    let group=[],groupEnd=0,laneEnds=[];
    const finish=()=>{for(const item of group)item.laneCount=laneEnds.length;group=[];laneEnds=[];groupEnd=0;};
    for(const segment of segments){
      if(group.length&&+new Date(segment.start)>=groupEnd)finish();
      let lane=laneEnds.findIndex(end=>end<=+new Date(segment.start));
      if(lane<0)lane=laneEnds.length;
      segment.lane=lane;laneEnds[lane]=+new Date(segment.end);group.push(segment);groupEnd=Math.max(groupEnd,+new Date(segment.end));
    }
    finish();
    return {day,date,segments};
  });
}
export const overlap = (a,b,buffer=0) => +new Date(a.start) < +new Date(b.end)+buffer*60000 && +new Date(a.end) > +new Date(b.start)-buffer*60000;
const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(+new Date(value));
export const validEvent = e => !!e && typeof e.id==='string' && typeof e.title==='string' && e.title.trim().length>0 && e.title.length<=500 && Object.hasOwn(categories,e.category) && validDate(e.start) && validDate(e.end) && +new Date(e.end)>+new Date(e.start) && typeof e.notes==='string';
export const validTask = t => !!t && typeof t.id==='string' && typeof t.title==='string' && t.title.trim().length>0 && t.title.length<=500 && Number.isInteger(t.minutes) && t.minutes>=15 && t.minutes<=1440 && validDate(t.deadline) && [1,2,3].includes(t.priority) && Object.hasOwn(categories,t.category) && typeof t.done==='boolean';
export function validateBackup(data) {
  if (!data || data.version!==1 || !Array.isArray(data.events) || !Array.isArray(data.tasks) || data.events.length>10000 || data.tasks.length>10000 || !data.events.every(validEvent) || !data.tasks.every(validTask)) throw new Error('备份内容或版本无效。');
  if (new Set(data.events.map(e=>e.id)).size!==data.events.length || new Set(data.tasks.map(t=>t.id)).size!==data.tasks.length) throw new Error('备份包含重复 ID。');
  const s=data.settings;
  if (!s || !Number.isInteger(s.startHour) || !Number.isInteger(s.endHour) || s.startHour<0 || s.endHour>24 || s.startHour>=s.endHour || typeof s.lunchBreak!=='boolean' || typeof s.skipWeekends!=='boolean' || ![0,5,10,15,30,60].includes(s.buffer)) throw new Error('备份的排程设置无效。');
  if (data.semester!==undefined) validateSemester(data.semester);
  if (data.holidayCalendars!==undefined) {
    if (!Array.isArray(data.holidayCalendars) || data.holidayCalendars.length>100) throw new Error('假期日历无效。');
    data.holidayCalendars.forEach(c=>validateHolidayCalendar(c,c.year));
    if (new Set(data.holidayCalendars.map(c=>c.year)).size!==data.holidayCalendars.length) throw new Error('假期年份重复。');
  }
  return data;
}

const validDay = day => typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+dateAt(day)) && dayKey(dateAt(day))===day;
const validClock = clock => typeof clock==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock);
export function validateSemester(s) {
  if (!s || typeof s.id!=='string' || !s.id || typeof s.name!=='string' || s.name.length>100 || !validDay(s.start) || +s.start.slice(0,4)<1900 || +s.start.slice(0,4)>2199 || !Number.isInteger(s.weeks) || s.weeks<1 || s.weeks>52 || !Array.isArray(s.templates) || s.templates.length>100) throw new Error('请填写有效的开始日期和 1–52 周的学期长度，固定课程最多 100 条。');
  if (!s.templates.every(t=>t && typeof t.id==='string' && t.id && typeof t.title==='string' && t.title.trim() && t.title.length<=500 && Number.isInteger(t.weekday) && t.weekday>=1 && t.weekday<=7 && validClock(t.start) && (validClock(t.end)||t.end==='24:00') && t.end>t.start && Object.hasOwn(categories,t.category) && typeof t.notes==='string' && t.notes.length<=5000) || new Set(s.templates.map(t=>t.id)).size!==s.templates.length) throw new Error('固定课程需要有效的星期、标题和当天起止时间；跨午夜课程请拆成两条。');
  if(s.excludedOccurrences!==undefined && (!Array.isArray(s.excludedOccurrences)||s.excludedOccurrences.length>10000||!s.excludedOccurrences.every(id=>typeof id==='string'&&id.startsWith(`semester:${s.id}:`))||new Set(s.excludedOccurrences).size!==s.excludedOccurrences.length))throw new Error('学期单次课程删除记录无效。');
  return s;
}
export const semesterEnd = s => dayKey(addDays(dateAt(s.start),s.weeks*7-1));
export const semesterYears = s => Array.from({length:+semesterEnd(s).slice(0,4)-+s.start.slice(0,4)+1},(_,i)=>+s.start.slice(0,4)+i);
export function validateHolidayCalendar(c,year) {
  const official = url => { try { const u=new URL(url); return u.protocol==='https:' && (u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn')); } catch { return false; } };
  if (!c || !Number.isInteger(year) || year<1900 || year>2200 || c.year!==year || !Array.isArray(c.papers) || !c.papers.length || c.papers.length>50 || !c.papers.every(official) || !Array.isArray(c.days) || !c.days.length || c.days.length>366 || !c.days.every(d=>d && validDay(d.date) && +d.date.slice(0,4)===year && typeof d.name==='string' && d.name.trim() && d.name.length<=100 && typeof d.isOffDay==='boolean') || !c.days.some(d=>d.isOffDay) || new Set(c.days.map(d=>d.date)).size!==c.days.length) throw new Error(`${year} 年假期数据无效，未用于排课。`);
  return {year,papers:[...c.papers],days:c.days.map(({date,name,isOffDay})=>({date,name,isOffDay})),...(['official-notice','community'].includes(c.source)?{source:c.source}:{}),...(typeof c.fetchedAt==='string'&&Number.isFinite(+new Date(c.fetchedAt))?{fetchedAt:c.fetchedAt}:{})};
}
// Offline fallback transcribed from the State Council's published annual notices.
const holidayRanges = (year,paper,ranges) => ({year,papers:[paper],source:'official-notice',days:ranges.flatMap(([name,start,end])=>{
  const days=[];for(let d=dateAt(`${year}-${start}`);dayKey(d)<=`${year}-${end}`;d=addDays(d,1))days.push({date:dayKey(d),name,isOffDay:true});return days;
})});
export const bundledHolidays = [
  holidayRanges(2025,'https://www.gov.cn/zhengce/content/202411/content_6986382.htm',[
    ['元旦','01-01','01-01'],['春节','01-28','02-04'],['清明节','04-04','04-06'],['劳动节','05-01','05-05'],['端午节','05-31','06-02'],['国庆节、中秋节','10-01','10-08']]),
  holidayRanges(2026,'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',[
    ['元旦','01-01','01-03'],['春节','02-15','02-23'],['清明节','04-04','04-06'],['劳动节','05-01','05-05'],['端午节','06-19','06-21'],['中秋节','09-25','09-27'],['国庆节','10-01','10-07']])
];
export function holidayMap(calendars=bundledHolidays) {
  return new Map(calendars.flatMap(c=>validateHolidayCalendar(c,c.year).days.filter(d=>d.isOffDay).map(d=>[d.date,d.name])));
}
export async function fetchHolidayYear(year,fetcher=globalThis.fetch) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {
    // Same-origin data is collected from government notices during publication.
    try {
      const official=await fetcher('./official-holidays.json',{signal:controller.signal,cache:'no-store'});
      if(official.ok){const body=await official.json();if(body.version===1&&Array.isArray(body.calendars)){const calendar=body.calendars.find(c=>c.year===year&&c.source==='official-notice');if(calendar)return validateHolidayCalendar(calendar,year);}}
    } catch(error) { if(controller.signal.aborted)throw error; }
    const response=await fetcher(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`${year} 年假期尚未获取（HTTP ${response.status}），请在公布后重试。`);
    return {...validateHolidayCalendar(await response.json(),year),source:'community'};
  } catch(error) {
    if(error.name==='AbortError')throw new Error(`${year} 年假期获取超时，请检查网络后重试。`);
    if(error instanceof TypeError)throw new Error(`${year} 年假期无法联网获取，请检查网络后重试。`);
    throw error;
  } finally { clearTimeout(timeout); }
}
export function generateSemester(s,calendars,{allowMissing=false}={}) {
  validateSemester(s);
  const valid=calendars.map(c=>validateHolidayCalendar(c,c.year));
  const missing=semesterYears(s).filter(year=>!valid.some(c=>c.year===year));
  if(missing.length&&!allowMissing)throw new Error(`缺少 ${missing.join('、')} 年假期数据。`);
  const holidays=holidayMap(valid),events=[],skipped=[];
  for(let i=0;i<s.weeks*7;i++){
    const date=addDays(dateAt(s.start),i),day=dayKey(date),weekday=(date.getDay()+6)%7+1;
    for(const t of s.templates.filter(t=>t.weekday===weekday)) {
      if(holidays.has(day)){skipped.push({day,title:t.title,holiday:holidays.get(day)});continue;}
      events.push({id:`semester:${s.id}:${t.id}:${day}`,semesterId:s.id,templateId:t.id,occurrenceDay:day,title:t.title,start:dateAt(day,t.start).toISOString(),end:dateAt(day,t.end).toISOString(),category:t.category,notes:t.notes,...(missing.includes(date.getFullYear())?{holidayPending:true}:{})});
    }
  }
  return {events,skipped,missingYears:missing};
}
const occurrenceFields=['title','start','end','category','notes'];
const occurrenceOrigin = e => Object.fromEntries(occurrenceFields.map(key=>[key,e[key]]));
export function semesterCalendars(data) {
  return [...bundledHolidays.filter(c=>!(data.holidayCalendars||[]).some(saved=>saved.year===c.year)),...(data.holidayCalendars||[])];
}
// Keep the calendar and planner in sync, while preserving single-instance edits/deletions.
export function syncSemesterData(input,previous=input) {
  if(!input.semester)return input;
  const next=structuredClone(input),s=next.semester,result=generateSemester(s,semesterCalendars(next),{allowMissing:true});
  const existing=new Map(next.events.filter(e=>e.semesterId===s.id).map(e=>[e.id,e])),excluded=new Set(s.excludedOccurrences||[]);
  const prior=previous.semester?.id===s.id?previous.semester:s;
  const generated=result.events.filter(e=>!excluded.has(e.id)).map(e=>{
    const old=existing.get(e.id),template=prior.templates.find(t=>t.id===e.templateId);
    const oldOrigin=old?.semesterOrigin||(template?{title:template.title,start:dateAt(e.occurrenceDay,template.start).toISOString(),end:dateAt(e.occurrenceDay,template.end).toISOString(),category:template.category,notes:template.notes}:null);
    const origin=occurrenceOrigin(e),updated={...e,semesterOrigin:origin};
    if(old&&oldOrigin)for(const key of occurrenceFields)if(old[key]!==oldOrigin[key])updated[key]=old[key];
    return updated;
  });
  next.events=replaceSemesterEvents(next.events,s,generated);
  return validateBackup(next);
}
export const officialNoticeSources = {
  2025:['https://www.gov.cn/zhengce/content/202411/content_6986382.htm'],
  2026:['https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm','https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html']
};
export function parseOfficialNotice(html,year,url) {
  // Parsing is performed in Node during publication; HTML is never executed.
  const traditional={'國':'国','務':'务','辦':'办','廳':'厅','關':'关','於':'于','節':'节','勞':'劳','動':'动','慶':'庆','調':'调','休':'休','佈':'布','經':'经','準':'准','計':'计'};
  const text=String(html).replace(/<!--[^]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,hex,decimal)=>{const code=parseInt(hex||decimal,hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):' ';}).replace(/&(?:nbsp|ensp|emsp);/g,' ').normalize('NFKC').replace(/[國務辦廳關於節勞動慶調休佈經準計]/g,c=>traditional[c]).replace(/\s+/g,' ');
  if(!text.includes(`国务院办公厅关于${year}年部分节假日安排的通知`) && !text.replace(/\s/g,'').includes(`国务院办公厅关于${year}年部分节假日安排的通知`))throw new Error(`${year} 年官方通知标题不匹配。`);
  const records=[],names=new Set();
  for(const match of text.matchAll(/(元旦|春节|清明节|劳动节|端午节|中秋节|国庆节(?:、中秋节)?)\s*[:：]\s*([^。]+)/g)){
    const name=match[1],sentence=match[2].replace(/[（(][^）)]*[）)]/g,'');
    if(!/放假/.test(sentence))continue;
    const range=sentence.match(/(\d{1,2})月(\d{1,2})日\s*(?:(?:至|—|-)\s*(?:(\d{1,2})月)?(\d{1,2})日)?/);
    if(!range)throw new Error(`${name} 日期无法解析。`);
    const date=(m,d)=>`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,start=date(+range[1],+range[2]),end=date(+(range[3]||range[1]),+(range[4]||range[2]));
    if(!validDay(start)||!validDay(end)||end<start)throw new Error(`${name} 日期无效。`);
    const days=Math.round((dateAt(end)-dateAt(start))/86400000)+1,count=sentence.match(/(?:共|放假)\s*(\d+)天/);
    if(days<1||days>10||!count||+count[1]!==days)throw new Error(`${name} 放假天数不匹配。`);
    if(names.has(name))continue;
    names.add(name);for(let day=dateAt(start);dayKey(day)<=end;day=addDays(day,1))records.push({date:dayKey(day),name,isOffDay:true});
  }
  if(names.size<6||!['元旦','春节','清明节','劳动节','端午节'].every(n=>names.has(n))||![...names].some(n=>n.startsWith('国庆节'))||![...names].some(n=>n.includes('中秋节')))throw new Error(`${year} 年官方通知不完整。`);
  return validateHolidayCalendar({year,papers:[url],days:records,source:'official-notice',fetchedAt:new Date().toISOString()},year);
}
export function replaceSemesterEvents(existing,s,generated) {
  const retained=existing.filter(e=>e.semesterId!==s.id),events=[...retained,...generated];
  if(events.length>10000 || new Set(events.map(e=>e.id)).size!==events.length || !events.every(validEvent))throw new Error('排课后日程数量过多或 ID 冲突，请减少学期课程。');
  return events;
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

