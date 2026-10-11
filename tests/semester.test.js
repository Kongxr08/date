import test from 'node:test';
import assert from 'node:assert/strict';
import {dateAt,dayKey,defaultSettings,bundledHolidays,holidayMap,validateHolidayCalendar,fetchHolidayYear,validateSemester,semesterEnd,semesterYears,generateSemester,replaceSemesterEvents,validateBackup,syncSemesterData,parseOfficialNotice,layoutWeek} from '../dist/core.js';
const course=(weekday,extra={})=>({id:`t${weekday}`,title:'课程',weekday,start:'09:00',end:'10:00',category:'study',notes:'地点 A',...extra});
const semester=(extra={})=>({id:'semester-1',name:'秋季',start:'2026-09-28',weeks:2,templates:Array.from({length:7},(_,i)=>course(i+1)),...extra});
test('按开始日期计算完整周数，包含最后一天并处理跨年',()=>{
  const s=semester({start:'2026-12-30',weeks:2});assert.equal(semesterEnd(s),'2027-01-12');assert.deepEqual(semesterYears(s),[2026,2027]);
  assert.equal(semesterEnd(semester({start:'2026-09-30',weeks:1})),'2026-10-06');
});
test('国庆整段假期连同周末跳过，补班日按原星期正常上课',()=>{
  const result=generateSemester(semester(),bundledHolidays);assert.equal(result.events.length,7);assert.equal(result.skipped.length,7);
  assert.deepEqual(result.skipped.map(e=>e.day),['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07']);
  const saturday=result.events.find(e=>dayKey(e.start)==='2026-10-10');assert.equal(saturday.templateId,'t6');
  const weekdaysOnly=generateSemester(semester({templates:[course(1)]}),bundledHolidays);assert.equal(weekdaysOnly.events.length,1);assert.equal(dayKey(weekdaysOnly.events[0].start),'2026-09-28');
});
test('中秋星期日属于放假范围，假期与学期边界准确',()=>{
  const result=generateSemester(semester({start:'2026-09-24',weeks:1}),bundledHolidays);assert.equal(result.skipped.length,3);assert.equal(result.events.length,4);assert.equal(dayKey(result.events.at(-1).start),'2026-09-30');
  assert.equal(holidayMap().get('2026-09-27'),'中秋节');assert.equal(bundledHolidays.find(c=>c.year===2026).days.length,33);
});
test('外部数据只跳过 isOffDay=true，不把补班星期六改成工作日课程',()=>{
  const c=validateHolidayCalendar({year:2026,papers:bundledHolidays[1].papers,days:[{date:'2026-10-01',name:'国庆节',isOffDay:true},{date:'2026-10-10',name:'国庆节',isOffDay:false}]},2026);
  assert.equal(holidayMap([c]).has('2026-10-10'),false);
  const result=generateSemester(semester({start:'2026-10-08',weeks:1,templates:[course(6),course(1)]}),[c]);
  assert.deepEqual(result.events.map(e=>e.templateId),['t6','t1']);
});
test('严格模式拒绝未知假期，完整跨年数据正常生成',()=>{
  const s=semester({start:'2026-12-30',weeks:2});assert.throws(()=>generateSemester(s,bundledHolidays),/2027/);
  const c={year:2027,papers:['https://www.gov.cn/test-fixture'],days:[{date:'2027-01-01',name:'测试假期',isOffDay:true}]};
  const result=generateSemester(s,[...bundledHolidays,c]);assert.equal(result.events.length,13);assert.equal(result.skipped[0].day,'2027-01-01');
});
const calendarData=s=>({version:1,events:[],tasks:[],settings:{...defaultSettings},semester:s});
test('保存固定模板自动产生周视图课程，旧版仅模板备份可迁移且不重复',()=>{
  const original=calendarData(semester({start:'2026-10-12',weeks:2,templates:[course(1)]})),synced=syncSemesterData(original);
  assert.equal(original.events.length,0);assert.equal(synced.events.length,2);assert.equal(layoutWeek(synced.events,'2026-10-12')[0].segments[0].event.title,'课程');assert.deepEqual(syncSemesterData(synced),synced);
});
test('假期未知年份仍显示固定课程并标记，已知年份仍停课',()=>{
  const next=syncSemesterData(calendarData(semester({start:'2026-12-28',weeks:2,templates:[course(5)]})));
  assert.equal(next.events.length,2);assert.ok(next.events.every(e=>e.holidayPending));assert.equal(dayKey(next.events[0].start),'2027-01-01');
  const known=syncSemesterData(calendarData(semester({start:'2026-09-28',weeks:2,templates:[course(1)]})));assert.equal(known.events.length,1);assert.equal(known.events[0].holidayPending,undefined);
});
test('更新固定模板和学期长度立即更新整学期课程，并保留手动日程',()=>{
  const before=syncSemesterData(calendarData(semester({start:'2026-10-12',weeks:2,templates:[course(1)]})));
  const manual={...before.events[0],id:'manual'};delete manual.semesterId;before.events.push(manual);
  const next=structuredClone(before);next.semester.weeks=1;next.semester.templates[0].title='改名课程';next.semester.templates[0].start='11:00';next.semester.templates[0].end='12:00';
  const updated=syncSemesterData(next,before);assert.equal(updated.events.length,2);assert.deepEqual(updated.events.find(e=>e.id==='manual'),manual);const e=updated.events.find(e=>e.semesterId);assert.equal(e.title,'改名课程');assert.equal(new Date(e.start).getHours(),11);
  updated.semester.templates=[];assert.deepEqual(syncSemesterData(updated).events,[manual]);
});
test('单次修改持续保留，未修改字段继续跟随固定模板',()=>{
  const before=syncSemesterData(calendarData(semester({start:'2026-10-12',weeks:2,templates:[course(1)]})));
  before.events[0].title='单次请假备注';before.events[0].start=dateAt('2026-10-12','09:30').toISOString();
  const next=structuredClone(before);next.semester.templates[0].title='新固定课程';next.semester.templates[0].notes='新教室';
  const updated=syncSemesterData(next,before);assert.equal(updated.events[0].title,'单次请假备注');assert.equal(new Date(updated.events[0].start).getMinutes(),30);assert.equal(updated.events[0].notes,'新教室');assert.equal(updated.events[1].title,'新固定课程');assert.deepEqual(syncSemesterData(updated),updated);
});
test('单次删除与撤销通过排除记录持续生效，备份校验拒绝非法排除记录',()=>{
  const d=syncSemesterData(calendarData(semester({start:'2026-10-12',weeks:2,templates:[course(1)]}))),removed=d.events[0];d.semester.excludedOccurrences=[removed.id];d.events=d.events.filter(e=>e.id!==removed.id);
  assert.equal(syncSemesterData(d).events.length,1);d.semester.excludedOccurrences=[];assert.equal(syncSemesterData(d).events.length,2);
  assert.throws(()=>validateBackup({...d,semester:{...d.semester,excludedOccurrences:['manual-id']}}));
});
test('旧版生成课程的单次编辑在首次迁移时得到保留',()=>{
  const s=semester({start:'2026-10-12',weeks:1,templates:[course(1)]}),d=calendarData(s);d.events=generateSemester(s,bundledHolidays).events;d.events[0].title='曾经手动改名';const next=syncSemesterData(d);assert.equal(next.events[0].title,'曾经手动改名');assert.equal(next.events[0].semesterOrigin.title,'课程');
});
test('取得未来年份假期后移除假期课程，解除其余课程的待确认标记',()=>{
  const before=syncSemesterData(calendarData(semester({start:'2026-12-28',weeks:2,templates:[course(5)]}))),next=structuredClone(before);
  next.holidayCalendars=[{year:2027,papers:['https://www.gov.cn/test-fixture'],days:[{date:'2027-01-01',name:'测试假期',isOffDay:true}]}];const updated=syncSemesterData(next,before);assert.equal(updated.events.length,1);assert.equal(dayKey(updated.events[0].start),'2027-01-08');assert.equal(updated.events[0].holidayPending,undefined);
});
const officialFixture=`<html><script>bad text 元旦：9月9日放假1天</script><h1>国务院办公厅关于2026年部分节假日安排的通知</h1><p>一、元旦：1月1日（周四）至3日（周六）放假调休，共3天。1月4日上班。</p><p>二、春节：2月15日至23日放假，共9天。2月14日、28日上班。</p><p>三、清明节：4月4日至6日放假，共3天。</p><p>四、劳动节：5月1日至5日放假，共5天。5月9日上班。</p><p>五、端午节：6月19日至21日放假，共3天。</p><p>六、中秋节：9月25日至27日放假，共3天。</p><p>七、国庆节：10月1日至7日放假，共7天。10月10日上班。</p></html>`;
test('直接解析官方通知整段日期，忽略脚本与补班句，校验公布天数',()=>{
  const c=parseOfficialNotice(officialFixture,2026,bundledHolidays[1].papers[0]);assert.equal(c.days.length,33);assert.equal(c.source,'official-notice');assert.ok(c.fetchedAt);assert.equal(holidayMap([c]).has('2026-10-10'),false);assert.deepEqual(c.days,bundledHolidays[1].days);
  assert.throws(()=>parseOfficialNotice(officialFixture.replace('共9天','共8天'),2026,c.papers[0]),/天数/);assert.throws(()=>parseOfficialNotice(officialFixture,2027,c.papers[0]),/标题/);assert.throws(()=>parseOfficialNotice(officialFixture.replace(/七、国庆节[^<]+/,'removed'),2026,c.papers[0]),/不完整/);
});
test('官方通知的跨月及合并假期正确解析',()=>{
  const text=officialFixture.replaceAll('2026','2025').replace('1月1日（周四）至3日（周六）放假调休，共3天','1月1日放假1天').replace('2月15日至23日放假，共9天','1月28日至2月4日放假，共8天').replace(/六、中秋节：[^<]+/,'').replace('国庆节：10月1日至7日放假，共7天','国庆节、中秋节：10月1日至8日放假，共8天');
  const c=parseOfficialNotice(text,2025,bundledHolidays[0].papers[0]);assert.equal(c.days.filter(d=>d.name==='春节').length,8);assert.equal(c.days.filter(d=>d.name==='国庆节、中秋节').length,8);
});
test('优先读取本站官方数据，官方不可用时清楚标记社区后备来源',async()=>{
  const urls=[];const c=await fetchHolidayYear(2026,async url=>{urls.push(url);return {ok:true,json:async()=>({version:1,calendars:bundledHolidays})};});assert.deepEqual(urls,['./official-holidays.json']);assert.equal(c.source,'official-notice');
  const fallback=await fetchHolidayYear(2026,async url=>url.startsWith('./')?{ok:false,status:404}:{ok:true,json:async()=>bundledHolidays[1]});assert.equal(fallback.source,'community');
});
test('重新生成保持稳定 ID、删除旧模板课次、保留手动及其他学期日程',()=>{
  const s=semester(),first=generateSemester(s,bundledHolidays).events;
  const manual={...first[0],id:'manual'};delete manual.semesterId;
  const other={...first[0],id:'other',semesterId:'semester-other'};
  const existing=[manual,other,...first];assert.deepEqual(replaceSemesterEvents(existing,s,first),existing);
  const changed=semester({weeks:1,templates:[course(2,{title:'英语'})]}),second=generateSemester(changed,bundledHolidays).events;
  const replaced=replaceSemesterEvents(existing,changed,second);assert.equal(replaced.length,3);assert.deepEqual(replaced.slice(0,2),[manual,other]);assert.equal(replaced[2].title,'英语');
});
test('允许到当天24:00，拒绝跨午夜、无效日期和周数',()=>{
  const s=semester({start:'2026-10-12',weeks:1,templates:[course(1,{start:'23:00',end:'24:00'})]});const [e]=generateSemester(s,bundledHolidays).events;
  assert.equal(dayKey(e.end),'2026-10-13');assert.equal(+new Date(e.end)-+new Date(e.start),3600000);
  for(const patch of [{weeks:0},{weeks:53},{weeks:1.5},{start:'2026-02-30'},{templates:[course(1,{start:'23:00',end:'01:00'})]},{templates:[course(8)]},{templates:[course(1),course(1)]}])assert.throws(()=>validateSemester(semester(patch)));
});
test('旧版备份兼容，新版备份保存学期模板与假期，拒绝损坏数据',()=>{
  const base={version:1,events:[],tasks:[],settings:{...defaultSettings}};assert.equal(validateBackup(base),base);
  const current={...base,semester:semester(),holidayCalendars:bundledHolidays};assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(current))),current);
  assert.throws(()=>validateBackup({...current,semester:semester({weeks:-1})}));assert.throws(()=>validateBackup({...current,holidayCalendars:[bundledHolidays[1],bundledHolidays[1]]}));
});
test('假期数据校验拒绝错误年份、伪造来源、非法日期、字符串布尔值和重复日期',()=>{
  const base=structuredClone(bundledHolidays[1]);
  for(const mutate of [c=>c.year=2027,c=>c.papers=['https://gov.cn.example.com'],c=>c.days[0].date='2026-02-30',c=>c.days[0].isOffDay='true',c=>c.days.push({...c.days[0]})]){const c=structuredClone(base);mutate(c);assert.throws(()=>validateHolidayCalendar(c,2026));}
});
test('更新请求成功时校验数据，404或错误响应不替换已有假期',async()=>{
  let requested='';const c=await fetchHolidayYear(2026,async(url,options)=>{requested=url;assert.equal(options.cache,'no-store');return {ok:true,json:async()=>bundledHolidays[1]};});assert.equal(c.year,2026);assert.match(requested,/2026\.json$/);
  await assert.rejects(fetchHolidayYear(2027,async()=>({ok:false,status:404})),/2027.*404/);
  await assert.rejects(fetchHolidayYear(2026,async()=>({ok:true,json:async()=>({year:2027})})),/无效/);
});
