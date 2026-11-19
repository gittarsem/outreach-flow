import { afterEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Application, Contact, FollowUp, ScheduledEmail } from '../../shared/types';
import { ExcelStore } from './excel';

let dir='';afterEach(async()=>{if(dir)await fs.rm(dir,{recursive:true,force:true});dir='';});
describe('local workbook persistence',()=>{
 it('creates all required sheets and reloads application, contact, and follow-up records',async()=>{
   dir=await fs.mkdtemp(path.join(os.tmpdir(),'outreachflow-'));const book=path.join(dir,'OutreachFlow_Data.xlsx');const store=new ExcelStore(book,path.join(dir,'backups'),path.join(dir,'config','journal.json'));await store.initialize();
   const app:Application={id:'a1',company:'Northstar',title:'Backend Engineer',description:'Build Java systems and services for a growing team.',url:'',location:'Remote',experience:'2 years',createdAt:'2025-01-06T10:00:00+05:30',appliedAt:'',resumeFilename:'resume.pdf',requiredSkills:['Java'],matchedSkills:['Java'],matchScore:100,status:'Draft',notes:'',analysis:{title:'Backend Engineer',requiredSkills:['Java'],preferredSkills:[],skills:['Java'],languages:['Java'],frameworks:[],libraries:[],databases:[],messaging:[],cloud:[],devops:[],responsibilities:[],experience:'',domainKeywords:[]}};
   const contact:Contact={id:'c1',applicationId:'a1',company:'Northstar',name:'Riley',designation:'Recruiter',email:'riley@example.com',linkedinUrl:'',source:'Manual',initialEmailDate:'',emailStatus:'Not Contacted',replyStatus:'Pending',lastContacted:'',threadId:'',messageId:'',suppressed:false};
   const follow:FollowUp={id:'f1',contactId:'c1',sequence:1,scheduledAt:'2025-01-13T10:00:00+05:30',status:'Scheduled',gmailMessageId:'',gmailThreadId:'',sentAt:'',error:'',subject:'Checking in',body:'Hello',confirmedOverdue:false,paused:false};
  const scheduled:ScheduledEmail={id:'e1',applicationId:'a1',contactId:'c1',recipientName:'Riley',recipientEmail:'riley@example.com',organization:'Northstar',subject:'Hello',body:'Message body',resumeId:'',scheduledAt:'2025-01-10T13:15:00+05:30',status:'Scheduled',createdAt:'2025-01-06T10:00:00+05:30',sentAt:'',gmailMessageId:'',gmailThreadId:'',error:'',scheduleFollowUps:true,followUpIntervalDays:4,followUpTime:'15:30'};
  await store.upsertApplication(app);await store.upsertContact(contact);await store.upsertFollowUp(follow);await store.upsertScheduledEmail(scheduled);const reload=new ExcelStore(book,path.join(dir,'backups'),path.join(dir,'config','journal.json'));const result=await reload.initialize();
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(book);expect(workbook.getWorksheet('Emails')).toBeDefined();expect(result.applications[0].company).toBe('Northstar');expect(result.contacts[0].email).toBe('riley@example.com');expect(result.followUps[0].scheduledAt).toContain('T10:00:00+05:30');expect(result.scheduledEmails[0]).toMatchObject({recipientEmail:'riley@example.com',status:'Scheduled',followUpIntervalDays:4,followUpTime:'15:30'});
 });
});
