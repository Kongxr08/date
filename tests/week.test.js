import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfWeek,layoutWeek,dateAt,dayKey} from '../dist/core.js';
const course=(day,start,end,id=crypto.randomUUID())=>({id,title:'课程',start:dateAt(day,start).toISOString(),end:dateAt(day,end).toISOString(),category:'study',notes:''});
test('周从周一开始，周日属于同一周，月末与年末正确跨越',()=>{
  assert.equal(dayKey(startOfWeek('2026-10-11')),'2026-10-05');
  assert.equal(dayKey(startOfWeek('2026-10-12')),'2026-10-12');
  const days=layoutWeek([],'2027-01-01');assert.equal(days[0].day,'2026-12-28');assert.equal(days[6].day,'2027-01-03');
});
test('课程按本地钟点定位，保留原记录供编辑与删除',()=>{
  const original=course('2026-10-12','09:30','11:00');const days=layoutWeek([original],'2026-10-12');
  assert.equal(days.length,7);const [s]=days[0].segments;assert.equal(s.startMinute,570);assert.equal(s.endMinute,660);assert.equal(s.event,original);assert.equal(s.laneCount,1);assert.equal(days[1].segments.length,0);
});
test('同时课程分配不同列，连续课程共享列且不假定重叠',()=>{
  const a=course('2026-10-12','09:00','10:00','a'),b=course('2026-10-12','09:30','10:30','b'),c=course('2026-10-12','10:30','11:00','c');
  const s=layoutWeek([b,c,a],'2026-10-12')[0].segments;
  assert.equal(s[0].lane,0);assert.equal(s[1].lane,1);assert.equal(s[0].laneCount,2);assert.equal(s[1].laneCount,2);assert.equal(s[2].laneCount,1);
});
test('复杂重叠组共享最大列数，空出的列可以复用',()=>{
  const s=layoutWeek([course('2026-10-12','09:00','12:00','a'),course('2026-10-12','09:00','10:00','b'),course('2026-10-12','09:30','10:30','c'),course('2026-10-12','10:30','11:00','d')],'2026-10-12')[0].segments;
  assert.ok(s.every(e=>e.laneCount===3));assert.equal(s.find(e=>e.event.id==='d').lane,1);
});
test('跨午夜课程拆为两天，午夜结束不产生第二天空块',()=>{
  const original=course('2026-10-12','23:30','23:59');original.end=dateAt('2026-10-13','01:00').toISOString();
  const days=layoutWeek([original],'2026-10-12');assert.equal(days[0].segments[0].startMinute,1410);assert.equal(days[0].segments[0].endMinute,1440);assert.equal(days[0].segments[0].continuesAfter,true);assert.equal(days[1].segments[0].startMinute,0);assert.equal(days[1].segments[0].endMinute,60);assert.equal(days[1].segments[0].continuesBefore,true);assert.equal(days[1].segments[0].event.id,original.id);
  original.end=dateAt('2026-10-13','00:00').toISOString();assert.equal(layoutWeek([original],'2026-10-12')[1].segments.length,0);
});
test('跨周事件只显示当前周的部分，过滤无效与周外事件',()=>{
  const spanning=course('2026-10-11','23:00','23:59');spanning.end=dateAt('2026-10-12','01:00').toISOString();
  const days=layoutWeek([spanning,course('2026-10-19','09:00','10:00'),{...spanning,id:'invalid',end:'bad'}],'2026-10-12');assert.equal(days.flatMap(d=>d.segments).length,1);assert.equal(days[0].segments[0].continuesBefore,true);
});
