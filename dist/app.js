import {categories,defaultSettings,uid,dayKey,dateAt,localInput,addDays,startOfWeek,layoutWeek,overlap,validEvent,validTask,validateBackup,parseSchedule,proposePlan,validateSemester,semesterEnd,semesterYears,bundledHolidays,holidayMap,fetchHolidayYear,generateSemester,replaceSemesterEvents} from './core.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={calendar:'M4 5h16v16H4z M7 3v4 M17 3v4 M4 10h16 M8 14h1 M15 14h1 M8 17h1',scan:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 9h10 M7 13h10 M7 17h5',plan:'M4 5h16v16H4z M8 9l1 1 2-3 M14 9h3 M8 16l1 1 2-3 M14 16h3',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 2v3l-5 3-2-1-3 1-5-3v-3l-2-2 2-5 3-1z',plus:'M12 5v14 M5 12h14',left:'M15 5l-7 7 7 7',right:'M9 5l7 7-7 7',close:'M6 6l12 12 M18 6L6 18',edit:'M4 16v4h4L20 8l-4-4z M13 7l4 4',trash:'M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',upload:'M4 15v6h16v-6 M12 16V3 M7 8l5-5 5 5',download:'M4 15v6h16v-6 M12 3v13 M7 11l5 5 5-5',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',check:'M5 12l4 4L19 6',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.calendar}"/></svg>`;
const KEY='timecanvas.data.v1';
const blank=()=>({version:1,events:[],tasks:[],settings:{...defaultSettings}});
let data=blank(), loadError='', rawBackup='';
try { rawBackup=localStorage.getItem(KEY)||''; if(rawBackup) data=validateBackup(JSON.parse(rawBackup)); }
catch { loadError='无法读取本机数据，已暂停写入。请先导出原始备份，再恢复有效备份。'; }
let tab='calendar', selected=dayKey(new Date()), month=new Date(new Date().getFullYear(),new Date().getMonth(),1), filter='', drafts=[], ocrText='', referenceDay=selected, imageURL='', busy=false, proposals=[], planSnapshot='', planFrom=selected;
let calendarMode='week',weekScroll={anchor:'',top:8*64,left:0};
let semesterPreview=null,semesterSnapshot='',holidayBusy=false,holidayStatus='',newSemesterId=uid();
const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
const semesterConfig=()=>data.semester||{id:newSemesterId,name:'我的学期',start:selected,weeks:16,templates:[]};
const calendars=()=>[...bundledHolidays.filter(c=>!(data.holidayCalendars||[]).some(saved=>saved.year===c.year)),...(data.holidayCalendars||[])];
try { const saved=localStorage.getItem('timecanvas.calendarMode');if(['week','month'].includes(saved))calendarMode=saved; } catch {}
const formatDate=(value,options={month:'long',day:'numeric',weekday:'long'})=>new Intl.DateTimeFormat('zh-CN',options).format(new Date(value));
const time=value=>formatDate(value,{hour:'2-digit',minute:'2-digit',hour12:false});
const eventRange=e=>`${formatDate(e.start,{month:'numeric',day:'numeric'})} ${time(e.start)}–${dayKey(e.start)===dayKey(e.end)?'':formatDate(e.end,{month:'numeric',day:'numeric'})+' '}${time(e.end)}`;
let toastTimer;
function toast(message,undo=null) {
  const node=$('#toast');node.textContent=message;node.classList.toggle('has-action',!!undo);
  if(undo){const button=document.createElement('button');button.type='button';button.textContent='撤销';button.onclick=undo;node.append(button);}
  node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),undo?8000:4000);
}
function commit(next) {
  if(loadError) { toast(loadError); return false; }
  try { validateBackup(next); localStorage.setItem(KEY,JSON.stringify(next)); data=next; return true; }
  catch(error) { toast('保存失败：'+error.message+' 请检查浏览器存储空间。'); return false; }
}
function change(fn) { const next=structuredClone(data); fn(next); if(commit(next)) { render(); return true; } return false; }
const nav=()=>[['calendar','calendar','日历'],['semester','calendar','学期课表'],['import','scan','图片导入'],['planner','plan','个人规划'],['settings','settings','设置']].map(([id,symbol,title])=>`<button data-tab="${id}" class="${tab===id?'active':''}" ${tab===id?'aria-current="page"':''}>${icon(symbol)}<span>${title}</span></button>`).join('');
function render() {
  const previousWeek=$('#week-scroll');
  if(previousWeek)weekScroll={anchor:previousWeek.dataset.week,top:previousWeek.scrollTop,left:previousWeek.scrollLeft};
  const titles={calendar:['我的日历','留一点时间，给自己。'],semester:['学期课表','一份固定课表，安排整个学期。'],import:['图片导入','把图片里的安排，放进你的日历。'],planner:['个人规划','让重要的事，都有自己的时间。'],settings:['使用与设置','按你的节奏，安排每一天。']};
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">${icon('calendar')}</div><div>时序<small>TIME CANVAS</small></div></div><nav class="nav" aria-label="主导航">${nav()}</nav><div class="sidebar-foot"><span class="status-dot"></span>你的时间，由你安排<p>日程保存在此设备<br>图片在浏览器中识别</p></div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">YOUR TIME, YOUR PACE</div><h1>${titles[tab][0]}</h1><p class="date-label">${titles[tab][1]}</p></div>${tab==='calendar'?`<button class="btn primary" data-action="new-event">${icon('plus')}新建日程</button>`:tab==='planner'?`<button class="btn primary" data-action="new-task">${icon('plus')}添加任务</button>`:''}</header>${loadError?`<div class="load-error" role="alert">${esc(loadError)}</div>`:''}<section id="content">${tab==='calendar'?calendarView():tab==='semester'?semesterView():tab==='import'?importView():tab==='planner'?plannerView():settingsView()}</section></main><nav class="bottom-nav" aria-label="底部导航">${nav()}</nav></div>`;
  bind();
  const week=$('#week-scroll');
  if(week){
    const earliest=layoutWeek(data.events,selected).flatMap(d=>d.segments).reduce((minute,s)=>Math.min(minute,s.startMinute),8*60);
    week.scrollTop=weekScroll.anchor===week.dataset.week?weekScroll.top:Math.max(0,Math.floor(earliest/60)-1)*64;
    week.scrollLeft=weekScroll.anchor===week.dataset.week?weekScroll.left:0;
  }
}
function eventCard(e, showDate=false) {
  const conflict=data.events.some(other=>other.id!==e.id&&overlap(e,other));
  return `<article class="event-card ${esc(e.category)}"><div class="event-time">${time(e.start)}<small>${dayKey(e.start)!==dayKey(e.end)?'次日 ':''}${time(e.end)}</small></div><div class="event-body"><button class="event-title" data-edit-event="${esc(e.id)}">${esc(e.title)}</button><p class="subtle">${showDate?formatDate(e.start,{month:'numeric',day:'numeric'})+' · ':''}${categories[e.category]}${e.taskId?' · 已规划':''}${e.semesterId?' · 学期课程':''}</p>${conflict?'<span class="badge warn">时间重叠</span>':''}</div><button class="tiny-btn" aria-label="编辑 ${esc(e.title)}" data-edit-event="${esc(e.id)}">${icon('edit')}</button></article>`;
}
function calendarView() {
  return `<div class="view-toolbar"><div class="view-switch" role="group" aria-label="日历视图"><button data-calendar-mode="week" aria-pressed="${calendarMode==='week'}" class="${calendarMode==='week'?'active':''}">周课表</button><button data-calendar-mode="month" aria-pressed="${calendarMode==='month'}" class="${calendarMode==='month'?'active':''}">月历</button></div><p class="subtle">${calendarMode==='week'?'点空白时间添加课程，点课程修改或删除':'选择日期查看当天安排'}</p></div>${calendarMode==='week'?weekView():monthView()}`;
}
function weekView(){
  const days=layoutWeek(data.events,selected),first=days[0].date,last=days[6].date,today=dayKey(new Date());
  const weekEvents=[...new Map(days.flatMap(d=>d.segments.map(s=>[s.event.id,s.event]))).values()];
  const dayEvents=days.find(d=>d.day===selected)?.segments.map(s=>s.event)||[];
  const holidays=holidayMap(calendars());
  const headers=days.map((d,i)=>`<button class="week-day-heading ${d.day===today?'is-today':''} ${d.day===selected?'is-selected':''}" data-day="${d.day}" aria-label="选择${formatDate(d.date)}" aria-pressed="${d.day===selected}"><strong>周${['一','二','三','四','五','六','日'][i]}</strong><span>${formatDate(d.date,{month:'numeric',day:'numeric'})}</span>${holidays.has(d.day)?`<small class="week-holiday">${esc(holidays.get(d.day))} · 放假</small>`:''}</button>`).join('');
  const columns=days.map(d=>{
    const slots=Array.from({length:48},(_,i)=>{const minute=i*30,hour=String(Math.floor(minute/60)).padStart(2,'0'),clock=`${hour}:${minute%60?'30':'00'}`;return `<button class="week-slot" data-slot-day="${d.day}" data-slot-minute="${minute}" aria-label="添加${formatDate(d.date)} ${clock}课程"></button>`;}).join('');
    const blocks=d.segments.map(s=>{
      const e=s.event,top=s.startMinute/60*64,height=(s.endMinute-s.startMinute)/60*64;
      const label=`${e.title}，${formatDate(d.date)}，${time(s.start)}至${s.endMinute===1440?'24:00':time(s.end)}，点击编辑或删除`;
      return `<button class="week-event ${esc(e.category)} ${height<37?'compact':''}" data-edit-event="${esc(e.id)}" style="top:${top}px;height:${Math.max(16,height)}px;left:calc(${s.lane/s.laneCount*100}% + 3px);width:calc(${100/s.laneCount}% - 6px)" aria-label="${esc(label)}" title="${esc(label)}"><strong>${esc(e.title)}</strong><span>${time(s.start)}–${s.endMinute===1440?'24:00':time(s.end)}</span>${s.continuesBefore||s.continuesAfter?'<small>跨日课程</small>':''}</button>`;
    }).join('');
    return `<div class="week-day-column ${d.day===today?'is-today':''}" data-column-day="${d.day}">${slots}${blocks}</div>`;
  }).join('');
  const hourLabels=Array.from({length:25},(_,h)=>`<span class="week-hour-label" style="top:${h*64}px">${String(h).padStart(2,'0')}:00</span>`).join('');
  return `<section class="panel week-panel"><div class="week-top"><div><div class="eyebrow">WEEKLY TIMETABLE</div><h2>${formatDate(first,{year:'numeric',month:'numeric',day:'numeric'})}–${formatDate(last,{month:'numeric',day:'numeric'})}</h2><p class="subtle">本周 ${weekEvents.length} 项日程 · 时间范围 00:00–24:00</p></div><div class="month-controls"><button class="btn ghost" data-action="today">本周</button><button class="icon-btn" data-week="-1" aria-label="上一周">${icon('left')}</button><button class="icon-btn" data-week="1" aria-label="下一周">${icon('right')}</button></div></div><label class="week-date-picker">跳转日期<input type="date" id="week-date" value="${selected}"></label><div class="week-scroll" id="week-scroll" data-week="${dayKey(first)}" tabindex="0" role="region" aria-label="周课表，横向滑动查看七天，纵向滑动查看一天的时间"><div class="week-canvas"><div class="week-heading-row"><div class="week-corner">时间</div>${headers}</div><div class="week-body"><div class="week-time-axis">${hourLabels}</div>${columns}</div></div></div><div class="week-bottom"><div class="legend">${Object.entries(categories).map(([key,label])=>`<span><i class="dot ${key}"></i>${label}</span>`).join('')}</div><p class="hint">手机上可左右滑动查看七天，上下滑动查看 24 小时。重叠课程会并排显示。</p></div></section><section class="panel week-agenda"><div class="panel-head"><div><h2>${formatDate(dateAt(selected),{month:'long',day:'numeric',weekday:'long'})}</h2><p class="subtle">${dayEvents.length} 项日程 · 点课程修改时间或删除</p></div><button class="btn primary" data-action="new-event">${icon('plus')}添加课程</button></div>${dayEvents.length?dayEvents.map(e=>eventCard(e)).join(''):'<p class="hint">这一天还没有课程，在课表中点一个空白时间段即可添加。</p>'}</section>`;
}
function monthView() {
  const first=new Date(month); const offset=(first.getDay()+6)%7; const start=addDays(first,-offset);
  const dayEvents=data.events.filter(e=>+new Date(e.start)<+addDays(dateAt(selected),1)&&+new Date(e.end)>+dateAt(selected)).sort((a,b)=>+new Date(a.start)-+new Date(b.start));
  const monthEvents=data.events.filter(e=>new Date(e.start).getMonth()===month.getMonth()&&new Date(e.start).getFullYear()===month.getFullYear());
  const hours=monthEvents.reduce((sum,e)=>sum+(new Date(e.end)-new Date(e.start))/3600000,0);
  const cells=Array.from({length:42},(_,i)=> { const d=addDays(start,i), key=dayKey(d), eventCategories=[...new Set(data.events.filter(e=>+new Date(e.start)<+addDays(d,1)&&+new Date(e.end)>+d).map(e=>e.category))].slice(0,4); return `<button class="day ${d.getMonth()!==month.getMonth()?'dim':''} ${key===selected?'selected':''} ${key===dayKey(new Date())?'today':''}" data-day="${key}" aria-label="${formatDate(d)}，${eventCategories.length?'有日程':'无日程'}" aria-pressed="${key===selected}"><span>${d.getDate()}</span><div class="dots">${eventCategories.map(c=>`<i class="dot ${c}"></i>`).join('')}</div></button>`; }).join('');
  return `<div class="hero"><div><div class="eyebrow">MAKE ROOM FOR WHAT MATTERS</div><h2>有安排，也有留白。</h2><p>从一张课表、一件待办开始，<br>把学习与生活，安排成自己的节奏。</p></div><div class="hero-art" aria-hidden="true"><span></span></div></div><div class="grid-main"><div class="panel"><div class="panel-head"><h2>${formatDate(month,{year:'numeric',month:'long'})}</h2><div class="month-controls"><button class="btn ghost" data-action="today">今天</button><button class="icon-btn" data-month="-1" aria-label="上个月">${icon('left')}</button><button class="icon-btn" data-month="1" aria-label="下个月">${icon('right')}</button></div></div><div class="calendar">${['一','二','三','四','五','六','日'].map(d=>`<div class="weekday">周${d}</div>`).join('')}${cells}</div><div class="legend">${Object.entries(categories).map(([key,label])=>`<span><i class="dot ${key}"></i>${label}</span>`).join('')}</div></div><div class="panel"><div class="agenda-header"><div class="eyebrow">DAILY AGENDA</div><div class="agenda-date">${formatDate(dateAt(selected),{month:'long',day:'numeric'})}<small>${formatDate(dateAt(selected),{weekday:'long'})}</small></div><p class="subtle">${dayEvents.length?`${dayEvents.length} 项日程 · 点按即可编辑`:'今天的时间，等待你的安排'}</p></div>${dayEvents.length?dayEvents.map(e=>eventCard(e)).join(''):`<div class="empty">${icon('calendar')}<h3>给这一天一个小计划</h3><p>添加课程、约会，或专属的学习时间。</p><button class="btn ghost" data-tab="import">${icon('scan')}从图片导入</button></div>`}<button class="btn add-day" data-action="new-event">${icon('plus')}添加日程</button></div></div><div class="stats"><div class="stat"><div class="subtle">本月日程</div><div class="number">${monthEvents.length}<small>项</small></div></div><div class="stat"><div class="subtle">已安排时长</div><div class="number">${Number(hours.toFixed(1))}<small>小时</small></div></div><div class="stat"><div class="subtle">待完成任务</div><div class="number">${data.tasks.filter(t=>!t.done).length}<small>项</small></div></div></div><div class="footer-line">${icon('shield')}数据仅保存在当前设备，建议定期导出备份。</div><div class="search"><label class="field">搜索日程<input id="search" type="search" placeholder="搜索课程或事项名称" value="${esc(filter)}"></label><div id="search-results" class="search-results">${searchResults()}</div></div>`;
}
function searchResults(){return filter?data.events.filter(e=>e.title.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>+new Date(a.start)-+new Date(b.start)).slice(0,50).map(e=>eventCard(e,true)).join('')||'<p class="subtle">没有找到日程。</p>':'';}
function draftCard(d) {
  return `<article class="draft" data-draft="${d.id}"><header><label><input type="checkbox" data-draft-field="selected" ${d.selected?'checked':''}>导入这条日程</label><button class="tiny-btn" data-remove-draft="${d.id}" aria-label="移除草稿">${icon('close')}</button></header><label class="field">标题<input data-draft-field="title" value="${esc(d.title)}" maxlength="500"></label><div class="field-row"><label class="field">开始<input type="datetime-local" data-draft-field="start" value="${localInput(d.start)}"></label><label class="field">结束<input type="datetime-local" data-draft-field="end" value="${localInput(d.end)}"></label></div><label class="field">类别<select data-draft-field="category">${categoryOptions(d.category)}</select></label><p class="source">原文：${esc(d.source)}</p>${d.warning?`<p class="hint">⚑ ${esc(d.warning)}</p>`:''}</article>`;
}
function importView() {
  return `<p class="section-intro">选一张课程安排、通知或聊天截图，识别后逐条核对，再加入日历。</p><div class="two-cols"><div class="panel"><div class="panel-head"><h2>01 / 读取图片</h2>${icon('scan')}</div><label class="upload">${icon('upload')}<strong>${busy?'正在识别…':'选择图片或拍照'}</strong><small>支持 PNG、JPEG、WebP · 最大 15 MB</small><input id="image-file" type="file" accept="image/*" ${busy?'disabled':''}></label>${imageURL?`<img src="${esc(imageURL)}" alt="所选图片预览" class="image-preview">`:''}<div id="ocr-progress" class="progress" aria-live="polite">${busy?'正在加载识别引擎，请稍候…':''}</div><label class="field">参考日期<input id="reference-day" type="date" value="${referenceDay}"></label><label class="field">识别文字（可修改）<textarea id="ocr-text" placeholder="2026年10月12日\n09:00–10:30 高等数学\n下午2点–3点 小组讨论">${esc(ocrText)}</textarea></label><button class="btn primary full" data-action="parse" ${busy?'disabled':''}>${icon('spark')}解析为日程草稿</button><p class="hint">图片在浏览器内处理，首次识别需联网加载引擎和语言包。日期或时间缺失时会标注推定值，请核对。复杂表格课表建议按行修改识别文字。</p></div><div class="panel"><div class="panel-head"><h2>02 / 核对与导入</h2><span class="badge">${drafts.length} 条草稿</span></div><div class="callout">每条草稿都可以修改。确认标题、日期和时间后，勾选需要的日程再导入。</div><div id="draft-list">${drafts.length?drafts.map(draftCard).join(''):`<div class="empty">${icon('scan')}<h3>日程草稿会出现在这里</h3><p>可从图片识别，也可直接粘贴文字解析。</p></div>`}</div><button class="btn primary full top-gap" data-action="import-drafts" ${drafts.some(d=>d.selected)?'':'disabled'}>${icon('check')}导入已选日程</button></div></div>`;
}
function plannerView() {
  const tasks=[...data.tasks].sort((a,b)=>Number(a.done)-Number(b.done)||b.priority-a.priority);
  const taskCards=tasks.map(t=> { const scheduled=data.events.find(e=>e.taskId===t.id); return `<article class="task-card ${t.done?'done':''}"><input type="checkbox" data-complete-task="${t.id}" ${t.done?'checked':''} aria-label="完成 ${esc(t.title)}"><div class="task-copy"><h3>${esc(t.title)}</h3><p class="subtle">${t.minutes} 分钟 · ${['','低','中','高'][t.priority]}优先级 · ${categories[t.category]}</p><p class="subtle">截止 ${formatDate(t.deadline,{month:'numeric',day:'numeric'})} ${time(t.deadline)}</p>${scheduled?`<p class="task-status">已安排 ${eventRange(scheduled)}</p>`:''}</div><button class="tiny-btn" data-edit-task="${t.id}" aria-label="编辑 ${esc(t.title)}">${icon('edit')}</button></article>`; }).join('');
  const results=proposals.map(p=>`<article class="proposal"><h3>${esc(p.task.title)}</h3>${p.event?`<p class="slot">${eventRange(p.event)}</p>`:'<span class="badge warn">暂时无法安排</span>'}<p>${esc(p.reason)}</p></article>`).join('');
  return `<p class="section-intro">告诉时序你想做什么、需要多久、何时完成。根据你的空闲时间，生成可确认的安排。</p><div class="two-cols"><div class="panel"><div class="panel-head"><h2>我的待办</h2><span class="badge">${tasks.filter(t=>!t.done).length} 待完成</span></div><div class="task-list">${taskCards||`<div class="empty">${icon('plan')}<h3>先写下一件想完成的事</h3><p>比如：阅读 30 分钟、复习一章内容。</p><button class="btn" data-action="new-task">${icon('plus')}添加任务</button></div>`}</div></div><div class="panel"><div class="panel-head"><h2>安排到空闲时间</h2>${icon('spark')}</div><div class="callout">可用时间 ${String(data.settings.startHour).padStart(2,'0')}:00–${String(data.settings.endHour).padStart(2,'0')}:00${data.settings.lunchBreak?'，12:00–13:00 午休':''}。优先安排高优先级任务，任务之间预留 ${data.settings.buffer} 分钟。</div><label class="field">从哪一天开始<input type="date" id="plan-from" value="${planFrom}"></label><button class="btn primary full" data-action="propose-plan">${icon('spark')}生成时间规划</button><p class="hint">任务安排为连续时段，避免已有日程。可在设置中调整可用时间，安排后也能在日历中修改。</p>${proposals.length?`<div class="top-gap">${results}</div><button class="btn primary full top-gap" data-action="apply-plan" ${proposals.some(p=>p.event)?'':'disabled'}>${icon('check')}确认加入日历</button>`:''}</div></div>`;
}
function semesterView() {
  const s=semesterConfig(),available=calendars(),years=semesterYears(s),missing=years.filter(y=>!available.some(c=>c.year===y));
  const courses=[...s.templates].sort((a,b)=>a.weekday-b.weekday||a.start.localeCompare(b.start));
  const disabled=holidayBusy?'disabled':'';
  const cards=courses.map(t=>`<article class="semester-course ${esc(t.category)}"><div><span class="badge">${weekdays[t.weekday-1]} · ${t.start}–${t.end}</span><h3>${esc(t.title)}</h3>${t.notes?`<p class="subtle">${esc(t.notes)}</p>`:''}</div><div class="row"><button class="tiny-btn" data-edit-template="${esc(t.id)}" aria-label="编辑固定课程 ${esc(t.title)}" ${disabled}>${icon('edit')}</button><button class="tiny-btn" data-delete-template="${esc(t.id)}" aria-label="删除固定课程 ${esc(t.title)}" ${disabled}>${icon('trash')}</button></div></article>`).join('');
  const preview=semesterPreview;
  return `<p class="section-intro">设置学期长度，再添加每周固定的课程。预览后一次性加入日历，仍可单独编辑或删除某次课程。</p><div class="two-cols semester-grid"><section class="panel"><h2>01 / 学期设置</h2><form id="semester-form"><label class="field">学期名称<input name="name" maxlength="100" value="${esc(s.name)}" ${disabled}></label><div class="field-row"><label class="field">开始日期<input type="date" name="start" required value="${s.start}" ${disabled}></label><label class="field">学期长度（周）<input type="number" name="weeks" min="1" max="52" step="1" required value="${s.weeks}" ${disabled}></label></div><p class="callout" id="semester-end">共 ${s.weeks} 周 · 最后一天 ${semesterEnd(s)}（含当天）</p><button class="btn" type="submit" ${disabled}>保存学期设置</button></form><div class="top-gap"><h2>国家假期</h2><p class="hint">跳过国务院公布的整段放假日期，包括连休中的周末。补班日不调课、不补课，仍按当天星期安排。周末固定课程在非假期照常排课。</p><div class="holiday-years">${years.map(y=>{const c=available.find(c=>c.year===y);return `<p><span class="badge ${c?'':'warn'}">${y} 年 · ${c?'已取得':'未取得'}</span>${c?` <a href="${esc(c.papers[0])}" target="_blank" rel="noopener">国务院通知 ↗</a>`:''}</p>`;}).join('')}</div><button class="btn" type="button" data-semester-action="holidays" ${disabled}>${icon('download')}${holidayBusy?'正在获取假期…':'联网更新国家假期'}</button><p class="hint" role="status">${esc(holidayStatus||'内置 2025、2026 年已公布安排，离线也能排课。联网更新通过 holiday-cn 同步国务院通知；更新后需要重新预览并确认排课。')}</p>${missing.length?`<p class="callout">尚未取得 ${missing.join('、')} 年假期数据。可保存固定课表；取得覆盖整个学期的数据后才能生成，避免遗漏假期。</p>`:''}<a class="subtle" href="https://github.com/NateScarlet/holiday-cn" target="_blank" rel="noopener">假期数据同步项目 ↗</a></div></section><section class="panel"><div class="panel-head"><h2>02 / 固定周课表</h2><span class="badge">${courses.length} 门 / 周</span></div><div class="row wrap"><button class="btn primary" data-semester-action="add" ${disabled}>${icon('plus')}添加固定课程</button><button class="btn" data-semester-action="copy" ${disabled}>使用日历当前周</button></div><p class="hint">当前周为 ${dayKey(startOfWeek(selected))} 起的七天。可先从图片导入课程，再把这一周复制为固定课表；相同课程不会重复复制。跨午夜课程请拆成当天两段。</p><div class="semester-courses">${cards||'<div class="empty"><h3>添加一周的课程</h3><p>选择星期、开始时间和结束时间，之后按周重复。</p></div>'}</div><p class="hint">修改固定课表后，需要重新预览并确认，日历中的课程才会更新。</p><button class="btn primary full" data-semester-action="preview" ${disabled||!courses.length?'disabled':''}>${icon('spark')}预览整个学期排课</button></section></div>${preview?`<section class="panel semester-preview top-gap"><div class="panel-head"><h2>03 / 确认排课</h2><span class="badge">${preview.events.length} 次课程</span></div><div class="callout">${esc(s.name)} · ${s.start}–${semesterEnd(s)}<br>生成 ${preview.events.length} 次课程，因假期跳过 ${preview.skipped.length} 次。<br>替换当前学期已生成的 ${preview.replaced} 条课程，保留其他 ${preview.retained} 条日程。</div><p class="hint">重新生成将覆盖本学期课程的单次修改，并恢复手动删除的课次。固定课表已删除的课程将从本学期日历移除。确认前请核对下面的预览。</p>${preview.conflicts?`<label class="toggle semester-conflict"><input id="semester-conflict-ok" type="checkbox">${preview.conflicts} 次课程有时间重叠，我已核对并接受重叠。</label>`:''}<details open><summary>排课预览（前 30 次，共 ${preview.events.length} 次）</summary><div class="semester-list">${preview.events.slice(0,30).map(e=>`<p><strong>${esc(e.title)}</strong><span>${eventRange(e)} · ${weekdays[(new Date(e.start).getDay()+6)%7]}</span></p>`).join('')||'<p>全部课次落在假期，没有课程需要生成。</p>'}</div></details>${preview.skipped.length?`<details><summary>假期停课（前 30 次，共 ${preview.skipped.length} 次）</summary><div class="semester-list">${preview.skipped.slice(0,30).map(e=>`<p><strong>${esc(e.title)}</strong><span>${e.day} · ${esc(e.holiday)}</span></p>`).join('')}</div></details>`:''}<div class="row wrap top-gap"><button class="btn primary" data-semester-action="apply">${icon('check')}确认排课并更新日历</button><button class="btn" data-semester-action="cancel">取消预览</button></div></section>`:''}`;
}
function readSemesterForm() {
  const s=structuredClone(semesterConfig()),form=$('#semester-form');
  if(form){const f=new FormData(form);s.name=String(f.get('name')).trim();s.start=String(f.get('start'));s.weeks=Number(f.get('weeks'));}
  return validateSemester(s);
}
function saveSemester(s) {
  const next=structuredClone(data);next.semester=s;
  if(!commit(next))return false;
  semesterPreview=null;render();return true;
}
async function updateHolidays(s,onlyMissing=false) {
  if(holidayBusy)return false;
  const years=semesterYears(s).filter(y=>!onlyMissing||!calendars().some(c=>c.year===y));
  if(!years.length)return true;
  holidayBusy=true;holidayStatus='正在获取 '+years.join('、')+' 年的国务院放假安排…';render();
  try {
    const results=await Promise.allSettled(years.map(y=>fetchHolidayYear(y))),next=structuredClone(data),messages=[];
    next.holidayCalendars=next.holidayCalendars||[];
    results.forEach((result,i)=>{
      if(result.status==='fulfilled'){next.holidayCalendars=next.holidayCalendars.filter(c=>c.year!==years[i]);next.holidayCalendars.push(result.value);messages.push(`${years[i]} 年已更新`);}
      else messages.push(`${years[i]} 年获取失败：${result.reason.message.replace(/[。.]$/,'')}；${calendars().some(c=>c.year===years[i])?'继续使用已保存数据':'此年份暂不能生成课程'}`);
    });
    semesterPreview=null;holidayStatus=messages.join('；');
    if(results.some(r=>r.status==='fulfilled'))commit(next);
    return results.every(r=>r.status==='fulfilled');
  } finally {holidayBusy=false;render();}
}
function previewSemester(s) {
  const result=generateSemester(s,calendars()),retained=data.events.filter(e=>e.semesterId!==s.id);
  replaceSemesterEvents(data.events,s,result.events);
  const ids=new Set(result.events.map(e=>e.id)),conflicts=new Set(),ordered=[...retained,...result.events].sort((a,b)=>+new Date(a.start)-+new Date(b.start));
  let active=[];
  for(const e of ordered){active=active.filter(other=>new Date(other.end)>new Date(e.start));for(const other of active){if(ids.has(e.id))conflicts.add(e.id);if(ids.has(other.id))conflicts.add(other.id);}active.push(e);}
  semesterPreview={...result,replaced:data.events.length-retained.length,retained:retained.length,conflicts:conflicts.size};
  semesterSnapshot=JSON.stringify(data);render();$('.semester-preview')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function bindSemester() {
  if($('#semester-form')){
    $('#semester-form').onsubmit=e=>{e.preventDefault();try{if(saveSemester(readSemesterForm()))toast('学期设置已保存，请重新预览排课。');}catch(error){toast(error.message);}};
    $('#semester-form').oninput=()=>{try{const s=readSemesterForm();$('#semester-end').textContent=`共 ${s.weeks} 周 · 最后一天 ${semesterEnd(s)}（含当天）`;}catch{$('#semester-end').textContent='请填写有效开始日期和 1–52 周。';}semesterPreview=null;$('.semester-preview')?.remove();};
  }
  document.querySelectorAll('[data-semester-action]').forEach(button=>button.onclick=async()=>{
    const action=button.dataset.semesterAction;
    try {
      if(action==='cancel'){semesterPreview=null;render();return;}
      if(action==='apply'){
        if(!semesterPreview||semesterSnapshot!==JSON.stringify(data)){toast('日程或课表已变更，请重新预览排课。');return;}
        if(semesterPreview.conflicts&&!$('#semester-conflict-ok')?.checked){toast('请核对并勾选接受时间重叠，或先修改固定课表。');return;}
        const s=data.semester,next=structuredClone(data);next.events=replaceSemesterEvents(data.events,s,semesterPreview.events);
        if(commit(next)){const count=semesterPreview.events.length;semesterPreview=null;selected=s.start;month=new Date(dateAt(selected).getFullYear(),dateAt(selected).getMonth(),1);tab='calendar';calendarMode='week';render();toast(`学期排课完成，已安排 ${count} 次课程。`);}return;
      }
      const s=readSemesterForm();if(!saveSemester(s))return;
      if(action==='add'){editTemplate();return;}
      if(action==='holidays'){await updateHolidays(s);return;}
      if(action==='preview'){await updateHolidays(s,true);previewSemester(data.semester);return;}
      if(action==='copy'){
        const monday=startOfWeek(selected),end=addDays(monday,7),templates=[...s.templates];let copied=0,ignored=0;
        for(const e of data.events.filter(e=>new Date(e.start)>=monday&&new Date(e.start)<end)){
          const clock=v=>localInput(v).slice(11),t={id:uid(),title:e.title,weekday:(new Date(e.start).getDay()+6)%7+1,start:clock(e.start),end:clock(e.end),category:e.category,notes:e.notes};
          if(dayKey(e.start)!==dayKey(e.end)){if(dayKey(e.end)===dayKey(addDays(e.start,1))&&clock(e.end)==='00:00')t.end='24:00';else{ignored++;continue;}}
          if(!templates.some(old=>old.title===t.title&&old.weekday===t.weekday&&old.start===t.start&&old.end===t.end)){templates.push(t);copied++;}
        }
        validateSemester({...s,templates});if(saveSemester({...s,templates}))toast(`已复制 ${copied} 门固定课程${ignored?`，跳过 ${ignored} 条跨日课程，请拆分后添加`:''}。`);
      }
    } catch(error){toast(error.message);}
  });
  document.querySelectorAll('[data-edit-template]').forEach(button=>button.onclick=()=>{try{const s=readSemesterForm();if(saveSemester(s))editTemplate(s.templates.find(t=>t.id===button.dataset.editTemplate));}catch(error){toast(error.message);}});
  document.querySelectorAll('[data-delete-template]').forEach(button=>button.onclick=()=>{
    if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.setAttribute('aria-label','确认删除固定课程');button.innerHTML='确认删除';return;}
    try{const s=readSemesterForm(),removed=s.templates.find(t=>t.id===button.dataset.deleteTemplate);s.templates=s.templates.filter(t=>t.id!==button.dataset.deleteTemplate);if(saveSemester(s))toast('固定课程已删除，重新排课后才会移除已生成课次。',()=>{const next=structuredClone(data.semester);if(!next.templates.some(t=>t.id===removed.id)){next.templates.push(removed);saveSemester(next);}});}catch(error){toast(error.message);}
  });
}
function editTemplate(existing) {
  const t=existing||{id:uid(),title:'',weekday:1,start:'09:00',end:'10:00',category:'study',notes:''};
  showDialog(`<form id="template-form"><div class="row spread"><h2>${existing?'编辑':'添加'}固定课程</h2><button type="button" class="tiny-btn" data-close aria-label="关闭">${icon('close')}</button></div><label class="field">课程名称<input name="title" required maxlength="500" value="${esc(t.title)}"></label><label class="field">星期<select name="weekday">${weekdays.map((d,i)=>`<option value="${i+1}" ${t.weekday===i+1?'selected':''}>${d}</option>`).join('')}</select></label><div class="field-row"><label class="field">开始时间<input type="time" name="start" required value="${t.start}"></label><label class="field">结束时间<input type="time" name="end" value="${t.end==='24:00'?'23:59':t.end}" required></label></div><label class="toggle"><input type="checkbox" name="midnight" ${t.end==='24:00'?'checked':''}>结束于当天 24:00</label><label class="field">类别<select name="category">${categoryOptions(t.category)}</select></label><label class="field">备注<textarea name="notes" maxlength="5000">${esc(t.notes)}</textarea></label><p class="hint">课程在当天结束。跨午夜课程请按两个星期、两个时间段拆开添加。</p><p class="error" id="editor-error" role="alert"></p><div class="actions"><button type="button" class="btn" id="cancel-template">取消</button><button class="btn primary" type="submit">保存固定课程</button></div></form>`);
  $('#cancel-template').onclick=()=>$('#editor').close();
  $('#template-form').onsubmit=e=>{e.preventDefault();try{const f=new FormData(e.target),updated={...t,title:String(f.get('title')).trim(),weekday:+f.get('weekday'),start:String(f.get('start')),end:f.has('midnight')?'24:00':String(f.get('end')),category:String(f.get('category')),notes:String(f.get('notes'))},s=structuredClone(data.semester);s.templates=s.templates.filter(old=>old.id!==t.id);s.templates.push(updated);validateSemester(s);if(saveSemester(s)){$('#editor').close();toast('固定课程已保存，请预览学期排课。');}}catch(error){$('#editor-error').textContent=error.message;}};
}
function settingsView() {
  const s=data.settings;
  return `<div class="settings-grid"><section class="panel settings-section"><h2>可用时间</h2><form id="settings-form"><div class="field-row"><label class="field">开始时刻<select name="startHour">${Array.from({length:24},(_,h)=>`<option value="${h}" ${h===s.startHour?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></label><label class="field">结束时刻<select name="endHour">${Array.from({length:24},(_,i)=>i+1).map(h=>`<option value="${h}" ${h===s.endHour?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></label></div><label class="toggle"><input type="checkbox" name="lunchBreak" ${s.lunchBreak?'checked':''}>保留午休（12:00–13:00）</label><label class="toggle"><input type="checkbox" name="skipWeekends" ${s.skipWeekends?'checked':''}>周末不自动安排任务</label><label class="field">日程之间的缓冲<select name="buffer">${[0,5,10,15,30,60].map(n=>`<option value="${n}" ${n===s.buffer?'selected':''}>${n} 分钟</option>`).join('')}</select></label><button type="submit" class="btn primary">保存设置</button></form></section><section class="panel settings-section"><h2>数据与备份</h2><p class="hint">日程和任务保存在此浏览器 / 主屏幕 App 的本地存储中。Safari 与主屏幕 App 的数据可能分开；可使用备份迁移。清理网站数据、卸载或更换设备可能导致数据丢失。</p><div class="row wrap top-gap"><button class="btn" data-action="export">${icon('download')}导出 JSON 备份</button><label class="btn file-btn">${icon('upload')}恢复备份<input id="backup-file" type="file" accept="application/json,.json"></label><button class="btn" data-action="export-ics">${icon('calendar')}导出日历 ICS</button></div><p class="hint">恢复备份会替换当前设备的数据；ICS 可导入 Apple 日历，仅导出日程，不包含待办。</p></section><section class="panel settings-section"><h2>添加到 iPhone 主屏幕</h2><ol class="help-steps"><li>使用 Safari 打开这个网页。</li><li>打开分享菜单，选择“添加到主屏幕”。</li><li>如果出现“作为网页 App 打开”，将它开启，再点“添加”。</li><li>之后从主屏幕的“时序”图标进入。</li></ol><p class="hint">首次成功访问并缓存后，日历、编辑和规划支持离线使用。图片 OCR 的离线可用性取决于引擎与语言缓存，建议联网识别。当前版本不含云同步和系统通知提醒。</p><p class="hint"><a href="https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios" target="_blank" rel="noopener">Apple 主屏幕网页说明 ↗</a> · <a href="https://github.com/Kongxr08/date" target="_blank" rel="noopener">GitHub 源码 ↗</a></p></section><div class="footer-line">${icon('shield')}时序 v1.0 · 给重要的事，留出时间。</div></div>`;
}
const categoryOptions=selected=>Object.entries(categories).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('');
function bind() {
  bindSemester();
  document.querySelectorAll('[data-calendar-mode]').forEach(button=>button.onclick=()=>{calendarMode=button.dataset.calendarMode;try{localStorage.setItem('timecanvas.calendarMode',calendarMode);}catch{}render();});
  document.querySelectorAll('button[data-week]').forEach(button=>button.onclick=()=>{selected=dayKey(addDays(dateAt(selected),Number(button.dataset.week)*7));const d=dateAt(selected);month=new Date(d.getFullYear(),d.getMonth(),1);render();});
  document.querySelectorAll('[data-slot-day]').forEach(button=>button.onclick=()=>{selected=button.dataset.slotDay;const start=dateAt(selected);start.setMinutes(Number(button.dataset.slotMinute));render();editEvent(undefined,{start:start.toISOString(),end:new Date(+start+3600000).toISOString()});});
  if($('#week-date'))$('#week-date').onchange=e=>{if(!e.target.value)return;selected=e.target.value;const d=dateAt(selected);month=new Date(d.getFullYear(),d.getMonth(),1);render();};
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(busy&&button.dataset.tab!=='import'){toast('图片正在识别，请稍候。');return;} tab=button.dataset.tab;render();window.scrollTo(0,0);});
  document.querySelectorAll('[data-month]').forEach(button=>button.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+Number(button.dataset.month),1);render();});
  document.querySelectorAll('[data-day]').forEach(button=>button.onclick=()=>{selected=button.dataset.day;const d=dateAt(selected);month=new Date(d.getFullYear(),d.getMonth(),1);render();});
  document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>actions[button.dataset.action]?.());
  document.querySelectorAll('[data-edit-event]').forEach(button=>button.onclick=()=>editEvent(data.events.find(e=>e.id===button.dataset.editEvent)));
  document.querySelectorAll('[data-edit-task]').forEach(button=>button.onclick=()=>editTask(data.tasks.find(t=>t.id===button.dataset.editTask)));
  document.querySelectorAll('[data-complete-task]').forEach(box=>box.onchange=()=>{const checked=box.checked;if(!change(next=>{next.tasks.find(t=>t.id===box.dataset.completeTask).done=checked;}))box.checked=!checked;});
  document.querySelectorAll('[data-remove-draft]').forEach(button=>button.onclick=()=>{drafts=drafts.filter(d=>d.id!==button.dataset.removeDraft);render();});
  document.querySelectorAll('[data-draft-field]').forEach(input=>input.oninput=()=>{
    const draft=drafts.find(d=>d.id===input.closest('[data-draft]').dataset.draft), field=input.dataset.draftField;
    if(field==='selected')draft.selected=input.checked;
    else if(['start','end'].includes(field)){draft[field]=Number.isFinite(+new Date(input.value))?new Date(input.value).toISOString():'';}
    else draft[field]=input.value;
    const button=$('[data-action="import-drafts"]');if(button)button.disabled=!drafts.some(d=>d.selected);
  });
  if($('#ocr-text'))$('#ocr-text').oninput=e=>ocrText=e.target.value;
  if($('#reference-day'))$('#reference-day').onchange=e=>referenceDay=e.target.value;
  if($('#plan-from'))$('#plan-from').onchange=e=>planFrom=e.target.value;
  if($('#image-file'))$('#image-file').onchange=e=>{const file=e.target.files[0];if(file)recognize(file);};
  if($('#search'))$('#search').oninput=e=>{filter=e.target.value;$('#search-results').innerHTML=searchResults();document.querySelectorAll('#search-results [data-edit-event]').forEach(button=>button.onclick=()=>editEvent(data.events.find(ev=>ev.id===button.dataset.editEvent)));};
  if($('#settings-form'))$('#settings-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const settings={startHour:+f.get('startHour'),endHour:+f.get('endHour'),buffer:+f.get('buffer'),lunchBreak:f.has('lunchBreak'),skipWeekends:f.has('skipWeekends')};if(settings.startHour>=settings.endHour){toast('结束时刻必须晚于开始时刻。');return;}if(change(next=>{next.settings=settings;})){proposals=[];toast('可用时间已保存');}};
  if($('#backup-file'))$('#backup-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('备份文件不能超过 10 MB');const next=validateBackup(JSON.parse(await file.text()));if(!confirm(`恢复 ${next.events.length} 条日程和 ${next.tasks.length} 个任务？这会替换当前数据，建议先导出备份。`))return;const oldError=loadError;loadError='';if(commit(next)){proposals=[];semesterPreview=null;newSemesterId=uid();render();toast('备份已恢复');}else loadError=oldError;}catch(error){toast('恢复失败：'+error.message);}};
}
const actions={
  'new-event':()=>editEvent(), 'new-task':()=>editTask(),
  today:()=>{selected=dayKey(new Date());month=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();},
  parse:()=>{if(!referenceDay){toast('请选择参考日期');return;} drafts=parseSchedule(ocrText,referenceDay);render();toast(drafts.length?`已生成 ${drafts.length} 条草稿，请核对`:'未找到有效时间，请使用 09:00 或 下午2点 格式。');},
  'import-drafts':()=>{
    const selectedDrafts=drafts.filter(d=>d.selected);if(!selectedDrafts.length)return;
    if(!selectedDrafts.every(validEvent)){toast('请填写每条草稿的标题与有效起止时间。');return;}
    const imported=[];for(const draft of selectedDrafts){const event={id:draft.id,title:draft.title.trim(),start:draft.start,end:draft.end,category:draft.category,notes:draft.notes};if(![...data.events,...imported].some(e=>e.title===event.title&&e.start===event.start&&e.end===event.end))imported.push(event);}
    if(!imported.length){toast('这些日程已存在，没有重复导入。');return;}
    if(imported.some((e,i)=>[...data.events,...imported.slice(0,i)].some(other=>overlap(e,other)))&&!confirm('部分日程有时间重叠，仍然导入吗？'))return;
    if(change(next=>next.events.push(...imported))){drafts=drafts.filter(d=>!d.selected);selected=dayKey(imported[0].start);const d=dateAt(selected);month=new Date(d.getFullYear(),d.getMonth(),1);tab='calendar';render();toast(`已导入 ${imported.length} 条日程`);}
  },
  'propose-plan':()=>{if(!planFrom){toast('请选择规划开始日期。');return;}proposals=proposePlan(data.tasks,data.events,data.settings,planFrom);planSnapshot=JSON.stringify(data);render();if(!proposals.length)toast('没有未安排的待办任务，请先添加任务。');},
  'apply-plan':()=>{if(planSnapshot!==JSON.stringify(data)){toast('日程或任务已经变更，请重新生成规划。');return;}const events=proposals.filter(p=>p.event).map(p=>p.event);if(!events.length)return;if(events.some(e=>new Date(e.start)<new Date())){toast('建议时间已经过去，请重新生成规划。');return;}if(change(next=>next.events.push(...events))){proposals=[];render();toast(`已安排 ${events.length} 个任务，可在日历中编辑`);}},
  export:()=>download(rawBackup&&loadError?rawBackup:JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),`时序备份-${dayKey(new Date())}.json`,'application/json'),
  'export-ics':()=>{
    const stamp=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const escapeICS=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TimeCanvas//Calendar//ZH','CALSCALE:GREGORIAN',...data.events.flatMap(e=>['BEGIN:VEVENT',`UID:${e.id}@timecanvas`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(e.start)}`,`DTEND:${stamp(e.end)}`,`SUMMARY:${escapeICS(e.title)}`,`DESCRIPTION:${escapeICS(e.notes)}`,'END:VEVENT']),'END:VCALENDAR'];
    const folded=lines.map(line=>{let result='',segment='',bytes=0;for(const char of line){const n=new TextEncoder().encode(char).length;if(bytes+n>73){result+=segment+'\r\n ';segment='';bytes=1;}segment+=char;bytes+=n;}return result+segment;}).join('\r\n')+'\r\n';
    download(folded,`时序日历-${dayKey(new Date())}.ics`,'text/calendar;charset=utf-8');
  }
};
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已导出，可在下载文件中查看。');}
function showDialog(markup){const dialog=$('#editor');dialog.innerHTML=markup;dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}},{once:true});}
function editEvent(existing,preset={}) {
  const start=dateAt(selected,'09:00'), event=existing?{...existing}:{id:uid(),title:'',start:start.toISOString(),end:new Date(+start+3600000).toISOString(),category:'study',notes:'',...preset};
  showDialog(`<form id="event-form"><div class="row spread"><h2>${existing?'编辑日程':'新建日程'}</h2><button type="button" class="tiny-btn" data-close aria-label="关闭">${icon('close')}</button></div><label class="field">标题<input name="title" required maxlength="500" value="${esc(event.title)}" placeholder="例如：高等数学、自习"></label><div class="field-row"><label class="field">开始<input name="start" type="datetime-local" required value="${localInput(event.start)}"></label><label class="field">结束<input name="end" type="datetime-local" required value="${localInput(event.end)}"></label></div><label class="field">类别<select name="category">${categoryOptions(event.category)}</select></label><label class="field">备注<textarea name="notes" maxlength="5000" placeholder="地点、准备事项…">${esc(event.notes)}</textarea></label>${!existing?'<label class="field">每周重复<select name="repeat"><option value="1">不重复</option><option value="4">连续 4 周</option><option value="8">连续 8 周</option><option value="16">连续 16 周</option></select></label>':''}${event.semesterId?'<p class="hint">这是学期生成的单次课程。此处修改或删除只影响本次；重新生成学期课表会恢复固定安排。</p>':''}<p class="error" id="editor-error" role="alert"></p><div class="actions">${existing?`<button type="button" class="btn danger" id="delete-event">删除</button>`:''}<button type="button" class="btn" id="cancel-event">取消</button><button class="btn primary" type="submit">保存日程</button></div></form>`);
  $('#cancel-event').onclick=()=>$('#editor').close();
  if(existing)$('#delete-event').onclick=()=>{
    const button=$('#delete-event');
    if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='确认删除';$('#editor-error').textContent='再次点“确认删除”移除这条日程；删除后可撤销。';return;}
    if(change(next=>{next.events=next.events.filter(e=>e.id!==existing.id);})){ $('#editor').close();toast('日程已删除',()=>{if(!data.events.some(e=>e.id===existing.id)&&change(next=>next.events.push(existing)))toast('已撤销删除');});}
  };
  $('#event-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);if(!f.get('start')||!f.get('end'))return;const nextEvent={...event,title:String(f.get('title')).trim(),start:new Date(f.get('start')).toISOString(),end:new Date(f.get('end')).toISOString(),category:f.get('category'),notes:String(f.get('notes'))};if(!validEvent(nextEvent)){$('#editor-error').textContent='请填写标题，结束时间必须晚于开始时间。';return;}const events=Array.from({length:Number(f.get('repeat')||1)},(_,i)=>({...nextEvent,id:i===0?event.id:uid(),start:addDays(nextEvent.start,i*7).toISOString(),end:addDays(nextEvent.end,i*7).toISOString()}));if(events.some((ev,i)=>[...data.events.filter(other=>other.id!==event.id),...events.slice(0,i)].some(other=>overlap(ev,other)))&&!confirm('日程存在时间重叠，仍然保存吗？'))return;if(change(next=>{next.events=next.events.filter(ev=>ev.id!==event.id);next.events.push(...events);})){ $('#editor').close();toast('日程已保存'); }};
}
function editTask(existing) {
  const end=addDays(dateAt(selected,'23:59'),7),task=existing?{...existing}:{id:uid(),title:'',minutes:60,priority:2,category:'study',deadline:end.toISOString(),done:false};
  showDialog(`<form id="task-form"><div class="row spread"><h2>${existing?'编辑任务':'添加任务'}</h2><button type="button" class="tiny-btn" data-close aria-label="关闭">${icon('close')}</button></div><label class="field">想完成的事<input name="title" required maxlength="500" value="${esc(task.title)}" placeholder="例如：复习第三章"></label><div class="field-row"><label class="field">需要多久（分钟）<input type="number" name="minutes" min="15" max="1440" step="1" required value="${task.minutes}"></label><label class="field">优先级<select name="priority">${[1,2,3].map(p=>`<option value="${p}" ${p===task.priority?'selected':''}>${['','低','中','高'][p]}</option>`).join('')}</select></label></div><label class="field">截止时间<input name="deadline" type="datetime-local" value="${localInput(task.deadline)}" required></label><label class="field">类别<select name="category">${categoryOptions(task.category)}</select></label><p class="hint">已安排任务修改后，原日程仍保留。需要重新规划时，请先在日历中删除原安排。</p><p class="error" id="editor-error" role="alert"></p><div class="actions">${existing?'<button type="button" class="btn danger" id="delete-task">删除</button>':''}<button type="button" class="btn" id="cancel-task">取消</button><button class="btn primary" type="submit">保存任务</button></div></form>`);
  $('#cancel-task').onclick=()=>$('#editor').close();
  if(existing)$('#delete-task').onclick=()=>{if(confirm('删除任务及它关联的日程？')&&change(next=>{next.tasks=next.tasks.filter(t=>t.id!==existing.id);next.events=next.events.filter(ev=>ev.taskId!==existing.id);})){ $('#editor').close();toast('任务已删除'); }};
  $('#task-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const nextTask={...task,title:String(f.get('title')).trim(),minutes:+f.get('minutes'),priority:+f.get('priority'),category:f.get('category'),deadline:new Date(f.get('deadline')).toISOString()};if(!validTask(nextTask)){$('#editor-error').textContent='请填写任务标题、15–1440 分钟的时长及截止时间。';return;}if(change(next=>{next.tasks=next.tasks.filter(t=>t.id!==task.id);next.tasks.push(nextTask);})){ $('#editor').close();toast('任务已保存'); }};
}
let enginePromise;
function loadEngine(){if(window.Tesseract)return Promise.resolve();if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>{script.remove();enginePromise=null;reject(new Error('无法下载 OCR 引擎，请检查网络后重试，或直接粘贴文字。'));};document.head.append(script);});return enginePromise;}
async function recognize(file){
  if(busy)return;if(file.size>15*1024*1024){toast('请选择小于 15 MB 的图片。');return;}
  busy=true;if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(file);render();let worker;
  try {
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('浏览器无法读取此图片。请转换为 JPEG 或 PNG。'));img.src=imageURL;});
    const canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    await loadEngine();
    worker=await window.Tesseract.createWorker(['chi_sim','eng'],1,{logger:message=>{const node=$('#ocr-progress');if(!node)return;const status=message.status==='recognizing text'?'识别文字':message.status.includes('traineddata')?'下载语言模型':'加载识别引擎';node.textContent=`${status} · ${Math.round((message.progress||0)*100)}%`;}});
    const result=await worker.recognize(canvas);ocrText=result.data.text.trim();drafts=[];busy=false;render();
    if(!ocrText)toast('没有识别到文字，请换一张清晰的图片或手动输入。');else toast('文字已识别，可修改后解析成草稿。');
  }catch(error){busy=false;render();toast('识别失败：'+error.message);}finally{if(worker)await worker.terminate();}
}
window.addEventListener('storage',event=>{if(event.key!==KEY)return;try{data=event.newValue?validateBackup(JSON.parse(event.newValue)):blank();rawBackup=event.newValue||'';loadError='';semesterPreview=null;render();toast('已同步此浏览器其他窗口的变更。');}catch{loadError='其他窗口的数据无效，已暂停写入。';render();}});
render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{console.info('离线缓存未启用，联网功能仍可使用。');});

