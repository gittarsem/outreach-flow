import { randomUUID } from 'node:crypto';
import Holidays from 'date-holidays';
import type { Contact, FollowUp, Template } from '../../shared/types';
import { applyTemplate, defaultTemplates } from './engine';

function istParts(date:Date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date);const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {year:+v.year,month:+v.month,day:+v.day,weekday:v.weekday};}
export function scheduleFollowups(sentAt:Date, contact:Contact, title:string, templateData:Record<string,string>, savedTemplates:Template[]=[], sendTime='10:00', _intervalDays=3):FollowUp[]{
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime))throw new Error('Choose a valid 24-hour follow-up time.');
  const p=istParts(sentAt);const start=new Date(Date.UTC(p.year,p.month-1,p.day));const offsets=[1,2,4,6,7];const holidays=new Holidays('IN',{types:['public']});let previous:Date|undefined;
  const dates=offsets.map(offset=>{let cursor=new Date(start.getTime()+offset*86400000);while(true){const weekday=cursor.getUTCDay();const date=`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}-${String(cursor.getUTCDate()).padStart(2,'0')}`;const isBusinessDay=weekday!==0&&weekday!==6&&!holidays.isHoliday(`${date} 12:00:00`);if(isBusinessDay&&(!previous||cursor.getTime()>previous.getTime()))break;cursor=new Date(cursor.getTime()+86400000);}previous=cursor;return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}-${String(cursor.getUTCDate()).padStart(2,'0')}`;});
  return dates.map((date,i)=>{const fallback=defaultTemplates[i+1];const saved=savedTemplates.find(t=>t.custom&&(t.id===`follow${i+1}`||t.category===`Follow-up ${i+1}`));const template=saved||fallback;const subject=applyTemplate(template.subject,templateData);const body=applyTemplate(template.body,templateData);return {id:randomUUID(),contactId:contact.id,sequence:i+1,scheduledAt:`${date}T${sendTime}:00+05:30`,status:'Scheduled',gmailMessageId:'',gmailThreadId:contact.threadId,sentAt:'',error:'',subject,body,confirmedOverdue:false,paused:false} as FollowUp;});
}
export function overdue(ids:FollowUp[], now=new Date()):FollowUp[]{return ids.filter(f=>f.status==='Scheduled'&&new Date(f.scheduledAt)<now&&!f.confirmedOverdue)}
export function nextPlanned(f:FollowUp[]){return f.filter(x=>x.status==='Scheduled').sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt))[0]||null}
