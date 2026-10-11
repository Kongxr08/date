import test from 'node:test';
import assert from 'node:assert/strict';
import {dateAt,dayKey,defaultSettings,bundledHolidays,holidayMap,validateHolidayCalendar,fetchHolidayYear,validateSemester,semesterEnd,semesterYears,generateSemester,replaceSemesterEvents,validateBackup} from '../dist/core.js';
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
test('未知年份阻止整学期生成，已知跨年日历则正常生成',()=>{
  const s=semester({start:'2026-12-30',weeks:2});assert.throws(()=>generateSemester(s,bundledHolidays),/2027/);
  const c={year:2027,papers:['https://www.gov.cn/test-fixture'],days:[{date:'2027-01-01',name:'测试假期',isOffDay:true}]};
  const result=generateSemester(s,[...bundledHolidays,c]);assert.equal(result.events.length,13);assert.equal(result.skipped[0].day,'2027-01-01');
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
