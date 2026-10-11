import {readFile,writeFile} from 'node:fs/promises';
import {bundledHolidays,officialNoticeSources,parseOfficialNotice,validateHolidayCalendar} from './dist/core.js';

const path=new URL('./dist/official-holidays.json',import.meta.url);
let bank={version:1,calendars:structuredClone(bundledHolidays)};
try{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.version===1&&Array.isArray(saved.calendars))bank={version:1,calendars:saved.calendars.map(c=>validateHolidayCalendar(c,c.year))};}catch(error){console.log('Use verified bundled official notices:',error.message);}
const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date()));
const years=[...new Set([...bank.calendars.map(c=>c.year),year,year+1])];
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'TimeCanvas official holiday sync (+https://github.com/Kongxr08/date)','Accept':'text/html,application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);if(response.url&&!new URL(response.url).hostname.endsWith('.gov.cn')&&!new URL(url).hostname.endsWith('githubusercontent.com'))throw new Error('Unexpected non-government redirect');return response;}
const results=await Promise.all(years.map(async target=>{
  const sources=[...(officialNoticeSources[target]||[]),...(bank.calendars.find(c=>c.year===target)?.papers||[])];
  if(!sources.length){
    // Discovery only: dates are always parsed from the government document itself.
    try{const found=await (await get(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${target}.json`)).json();if(Array.isArray(found.papers))for(const url of found.papers){const u=new URL(url);if(u.protocol==='https:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn')))sources.push(url);}}catch(error){console.log(`${target}: notice discovery unavailable (${error.message})`);}
  }
  for(const url of [...new Set(sources)])try{
    const result=parseOfficialNotice(await (await get(url)).text(),target,url);console.log(`${target}: read official notice ${url}; ${result.days.length} days off`);return result;
  }catch(error){console.log(`${target}: official notice unavailable or rejected (${url}): ${error.message}`);}
  console.log(`${target}: retaining verified data if available; unknown years remain pending`);return null;
}));
for(const c of results.filter(Boolean)){bank.calendars=bank.calendars.filter(old=>old.year!==c.year);bank.calendars.push(c);}
bank.calendars.sort((a,b)=>a.year-b.year);await writeFile(path,JSON.stringify(bank,null,2)+'\n');
