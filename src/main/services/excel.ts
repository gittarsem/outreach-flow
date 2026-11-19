import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Activity, Application, Contact, FollowUp, ScheduledEmail } from '../../shared/types';

export interface StoreState { applications: Application[]; contacts: Contact[]; scheduledEmails: ScheduledEmail[]; followUps: FollowUp[]; activity: Activity[] }
export const emptyState = (): StoreState => ({applications:[],contacts:[],scheduledEmails:[],followUps:[],activity:[]});
const headers = {
  Emails:['Email ID','Application ID','Contact ID','Recipient Name','Recipient Email','Organization','Subject','Message','Resume ID','Scheduled At','Status','Created At','Sent At','Gmail Message ID','Gmail Thread ID','Error','Follow-ups Enabled','Interval Days','Follow-up Time IST'],
  Applications:['Application ID','Company','Job Title','Job Description','Job URL','Job Location','Date Created','Date Applied','Resume Filename','Required Skills','Matched Skills','Skill Match Score','Application Status','Notes'],
  Contacts:['Contact ID','Application ID','Company','HR Name','Designation','Email','LinkedIn URL','Contact Source','Initial Email Date','Email Status','Reply Status','Last Contacted','Gmail Thread ID','Gmail Message ID','Suppressed'],
  'Follow-ups':['Follow-up ID','Contact ID','Sequence Number','Scheduled Date','Scheduled Time','Gmail Message ID','Gmail Thread ID','Status','Sent Timestamp','Error Details','Subject','Body','Confirmed Overdue','Paused'],
  'Activity Log':['Timestamp','Company','Contact','Activity','Result','Details'],
  'Dashboard Data':['Metric','Value']
} as const;
const str=(v:unknown)=>v==null?'':v instanceof Date?v.toISOString():String(v);
const parseJsonList=(v:unknown):string[]=>{try{return JSON.parse(str(v)||'[]')}catch{return str(v)?str(v).split(',').map(x=>x.trim()).filter(Boolean):[]}};
const cellDate=(v:unknown)=>{if(v instanceof Date)return v.toISOString();const s=str(v);if(!s)return '';const d=new Date(s);return Number.isNaN(d.valueOf())?s:d.toISOString()};
const excelDate=(v:string)=>v?new Date(v):'';
const excelDateOnly=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):str(v).slice(0,10);

export class ExcelStore {
  readonly journalPath:string; state:StoreState=emptyState(); private busy=false; private dirty=false;
  constructor(public workbookPath:string, private backupDir:string, journalPath:string){this.journalPath=journalPath;}
  async initialize():Promise<StoreState>{
    await fs.mkdir(path.dirname(this.workbookPath),{recursive:true}); await fs.mkdir(this.backupDir,{recursive:true});
    try { await fs.access(this.workbookPath); const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(this.workbookPath); this.state=this.readWorkbook(wb); }
    catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') this.state=emptyState(); else { const damaged=`${this.workbookPath}.damaged-${Date.now()}`; try{await fs.rename(this.workbookPath,damaged)}catch{} this.state=emptyState(); } }
    try {const journal=JSON.parse(await fs.readFile(this.journalPath,'utf8')) as Partial<StoreState>; if(journal&&Array.isArray(journal.applications)){this.state={...emptyState(),...journal,scheduledEmails:Array.isArray(journal.scheduledEmails)?journal.scheduledEmails:[]}; this.dirty=true; await this.commit();}}catch{}
    if(!await this.exists(this.workbookPath)) await this.commit();
    return this.state;
  }
  snapshot():StoreState{return structuredClone(this.state)}
  async upsertApplication(value:Application){const i=this.state.applications.findIndex(x=>x.id===value.id); if(i<0)this.state.applications.push(value);else this.state.applications[i]=value; await this.commit();}
  async upsertContact(value:Contact){const duplicate=this.state.contacts.find(x=>x.id!==value.id&&x.applicationId===value.applicationId&&x.email.toLowerCase()===value.email.toLowerCase());if(duplicate)throw new Error('This contact email is already attached to the application.');const i=this.state.contacts.findIndex(x=>x.id===value.id);if(i<0)this.state.contacts.push(value);else this.state.contacts[i]=value;await this.commit();}
  async upsertFollowUp(value:FollowUp){const i=this.state.followUps.findIndex(x=>x.id===value.id);if(i<0)this.state.followUps.push(value);else this.state.followUps[i]=value;await this.commit();}
  async upsertScheduledEmail(value:ScheduledEmail){const i=this.state.scheduledEmails.findIndex(x=>x.id===value.id);if(i<0)this.state.scheduledEmails.push(value);else this.state.scheduledEmails[i]=value;await this.commit();}
  async log(value:Activity){this.state.activity.unshift(value);await this.commit();}
  async mutate(fn:(s:StoreState)=>void){fn(this.state);await this.commit();}
  async importFile(file:string){const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(file);this.state=this.readWorkbook(wb);await this.commit();}
  async backup():Promise<string>{const target=path.join(this.backupDir,`OutreachFlow_Data-${new Date().toISOString().replace(/[:.]/g,'-')}.xlsx`);await fs.copyFile(this.workbookPath,target);return target;}
  async restore(file:string){const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(file);this.state=this.readWorkbook(wb);await this.commit();}
  private async exists(file:string){try{await fs.access(file);return true}catch{return false}}
  private readWorkbook(wb:ExcelJS.Workbook):StoreState {
    const result=emptyState(); const rows=(sheetName:string)=>{const sh=wb.getWorksheet(sheetName);if(!sh)return[];const h=sh.getRow(1).values as unknown[];const heads=h.slice(1).map(str);const out:Record<string,unknown>[]=[];sh.eachRow((row,n)=>{if(n===1)return;const a=row.values as unknown[];const item:Record<string,unknown>={};heads.forEach((k,i)=>item[k]=a[i+1]);if(Object.values(item).some(v=>v!==null&&v!==undefined&&v!==''))out.push(item)});return out};
    result.applications=rows('Applications').map(r=>({id:str(r['Application ID']),company:str(r.Company),title:str(r['Job Title']),description:str(r['Job Description']),url:str(r['Job URL']),location:str(r['Job Location']),experience:'',createdAt:cellDate(r['Date Created']),appliedAt:cellDate(r['Date Applied']),resumeFilename:str(r['Resume Filename']),requiredSkills:parseJsonList(r['Required Skills']),matchedSkills:parseJsonList(r['Matched Skills']),matchScore:Number(r['Skill Match Score']||0),status:(str(r['Application Status'])||'Draft') as Application['status'],notes:str(r.Notes),analysis:{title:str(r['Job Title']),requiredSkills:parseJsonList(r['Required Skills']),preferredSkills:[],skills:[],languages:[],frameworks:[],libraries:[],databases:[],messaging:[],cloud:[],devops:[],responsibilities:[],experience:'',domainKeywords:[]}}));
    result.contacts=rows('Contacts').map(r=>({id:str(r['Contact ID']),applicationId:str(r['Application ID']),company:str(r.Company),name:str(r['HR Name']),designation:str(r.Designation),email:str(r.Email),linkedinUrl:str(r['LinkedIn URL']),source:str(r['Contact Source']),initialEmailDate:cellDate(r['Initial Email Date']),emailStatus:(str(r['Email Status'])||'Not Contacted') as Contact['emailStatus'],replyStatus:str(r['Reply Status']),lastContacted:cellDate(r['Last Contacted']),threadId:str(r['Gmail Thread ID']),messageId:str(r['Gmail Message ID']),suppressed:/true|1/i.test(str(r.Suppressed))}));
    result.scheduledEmails=rows('Emails').map(r=>({id:str(r['Email ID']),applicationId:str(r['Application ID']),contactId:str(r['Contact ID']),recipientName:str(r['Recipient Name']),recipientEmail:str(r['Recipient Email']),organization:str(r.Organization),subject:str(r.Subject),body:str(r.Message),resumeId:str(r['Resume ID']),scheduledAt:cellDate(r['Scheduled At']),status:(str(r.Status)||'Scheduled') as ScheduledEmail['status'],createdAt:cellDate(r['Created At']),sentAt:cellDate(r['Sent At']),gmailMessageId:str(r['Gmail Message ID']),gmailThreadId:str(r['Gmail Thread ID']),error:str(r.Error),scheduleFollowUps:/true|1/i.test(str(r['Follow-ups Enabled'])),followUpIntervalDays:Number(r['Interval Days']||3),followUpTime:str(r['Follow-up Time IST'])||'10:00'}));
    result.followUps=rows('Follow-ups').map(r=>{const date=excelDateOnly(r['Scheduled Date']);const time=str(r['Scheduled Time'])||'10:00';return {id:str(r['Follow-up ID']),contactId:str(r['Contact ID']),sequence:Number(r['Sequence Number']||0),scheduledAt:date?`${date}T${time}:00+05:30`:cellDate(r['Scheduled Date']),status:(str(r.Status)||'Scheduled') as FollowUp['status'],gmailMessageId:str(r['Gmail Message ID']),gmailThreadId:str(r['Gmail Thread ID']),sentAt:cellDate(r['Sent Timestamp']),error:str(r['Error Details']),subject:str(r.Subject),body:str(r.Body),confirmedOverdue:/true|1/i.test(str(r['Confirmed Overdue'])),paused:/true|1/i.test(str(r.Paused))}});
    result.activity=rows('Activity Log').map(r=>({timestamp:cellDate(r.Timestamp),company:str(r.Company),contact:str(r.Contact),activity:str(r.Activity),result:str(r.Result),details:str(r.Details)}));return result;
  }
  private async commit(){
    if(this.busy){this.dirty=true;return;}this.busy=true;
    try {let next=true;while(next){this.dirty=false;const wb=new ExcelJS.Workbook();wb.creator='OutreachFlow';wb.created=new Date();
      const add=(name:string,cols:readonly string[],data:unknown[][])=>{const sh=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});sh.addRow([...cols]);sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E293B'}};sh.autoFilter={from:'A1',to:`${String.fromCharCode(64+cols.length)}1`};for(const row of data)sh.addRow(row);sh.columns=cols.map(c=>({header:c,key:c,width:Math.min(48,Math.max(14,c.length+3))}));const dates=['Date Created','Date Applied','Initial Email Date','Last Contacted','Scheduled Date','Sent Timestamp','Timestamp'];cols.forEach((c,i)=>{if(dates.includes(c))sh.getColumn(i+1).numFmt='dd mmm yyyy hh:mm';});const statusCol=cols.findIndex(c=>['Application Status','Email Status','Status'].includes(c))+1;if(statusCol)for(let r=2;r<=sh.rowCount;r++){const cell=sh.getRow(r).getCell(statusCol);const value=str(cell.value).toLowerCase();const color=/replied|sent|interview/.test(value)?'FFEAF8F1':/failed|bounced|rejected/.test(value)?'FFFFF0EF':/scheduled|progress|contacted/.test(value)?'FFEEF3FF':'FFF7F8FA';cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};}};
      add('Applications',headers.Applications,this.state.applications.map(a=>[a.id,a.company,a.title,a.description,a.url,a.location,excelDate(a.createdAt),excelDate(a.appliedAt),a.resumeFilename,JSON.stringify(a.requiredSkills),JSON.stringify(a.matchedSkills),a.matchScore,a.status,a.notes]));
      add('Emails',headers.Emails,this.state.scheduledEmails.map(e=>[e.id,e.applicationId,e.contactId,e.recipientName,e.recipientEmail,e.organization,e.subject,e.body,e.resumeId,excelDate(e.scheduledAt),e.status,excelDate(e.createdAt),excelDate(e.sentAt),e.gmailMessageId,e.gmailThreadId,e.error,e.scheduleFollowUps,e.followUpIntervalDays,e.followUpTime]));
      add('Contacts',headers.Contacts,this.state.contacts.map(c=>[c.id,c.applicationId,c.company,c.name,c.designation,c.email,c.linkedinUrl,c.source,excelDate(c.initialEmailDate),c.emailStatus,c.replyStatus,excelDate(c.lastContacted),c.threadId,c.messageId,c.suppressed]));
      add('Follow-ups',headers['Follow-ups'],this.state.followUps.map(f=>[f.id,f.contactId,f.sequence,excelDate(f.scheduledAt),new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date(f.scheduledAt)),f.gmailMessageId,f.gmailThreadId,f.status,excelDate(f.sentAt),f.error,f.subject,f.body,f.confirmedOverdue,f.paused]));
      add('Activity Log',headers['Activity Log'],this.state.activity.map(a=>[excelDate(a.timestamp),a.company,a.contact,a.activity,a.result,a.details]));
      const metrics=[['Emails sent',`=COUNTIF(Emails!K:K,"Sent")`],['Scheduled emails',`=COUNTIF(Emails!K:K,"Scheduled")`],['Failed emails',`=COUNTIF(Emails!K:K,"Failed")`],['Scheduled follow-ups',`=COUNTIF('Follow-ups'!H:H,"Scheduled")`],['Replies received',`=COUNTIF(Contacts!J:J,"Replied")`]];
      const sh=wb.addWorksheet('Dashboard Data');sh.addRow([...headers['Dashboard Data']]);sh.getRow(1).font={bold:true};metrics.forEach(x=>sh.addRow(x));
      if(await this.exists(this.workbookPath)){const today=new Date().toISOString().slice(0,10);const existing=await fs.readdir(this.backupDir);if(!existing.some(x=>x.includes(today))){const back=path.join(this.backupDir,`OutreachFlow_Data-${today}.xlsx`);await fs.copyFile(this.workbookPath,back);const backups=existing.filter(x=>x.startsWith('OutreachFlow_Data-')&&x.endsWith('.xlsx')).sort();for(const old of backups.slice(0,Math.max(0,backups.length-29)))await fs.rm(path.join(this.backupDir,old),{force:true});}}
      const tmp=`${this.workbookPath}.tmp-${process.pid}`;await wb.xlsx.writeFile(tmp);await fs.rename(tmp,this.workbookPath);await fs.rm(this.journalPath,{force:true});next=this.dirty;}
    } catch(e){this.dirty=true;await fs.mkdir(path.dirname(this.journalPath),{recursive:true});await fs.writeFile(this.journalPath,JSON.stringify(this.state,null,2),'utf8');throw new Error(`Workbook is unavailable; the change is preserved in the recovery journal. ${e instanceof Error?e.message:''}`)}
    finally{this.busy=false;}
  }
}
