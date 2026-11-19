import { contextBridge, ipcRenderer } from 'electron';
import type { CandidateProfile, IpcApi, JobAnalysis, OutreachInput, Template } from '../shared/types';

const api:IpcApi={
 getState:()=>ipcRenderer.invoke('state:get'),
 saveProfile:(profile:CandidateProfile)=>ipcRenderer.invoke('profile:save',profile),
 analyze:(description:string,title?:string)=>ipcRenderer.invoke('jd:analyze',description,title),
 importJobScreenshot:()=>ipcRenderer.invoke('job:importScreenshot'),
 importJobUrl:(url:string)=>ipcRenderer.invoke('job:importUrl',url),
 importGithubProfile:(url:string)=>ipcRenderer.invoke('profile:importGithub',url),
 importResumeProfile:(resumeId:string)=>ipcRenderer.invoke('profile:importResume',resumeId),
 generateEmail:(input:OutreachInput,projectIds?:string[],tone?:string,corrections?:JobAnalysis)=>ipcRenderer.invoke('email:generate',input,projectIds,tone,corrections),
 saveDraft:(input:OutreachInput,analysis:JobAnalysis)=>ipcRenderer.invoke('outreach:draft',input,analysis),
 createGmailDraft:(input:OutreachInput,subject:string,body:string)=>ipcRenderer.invoke('outreach:gmailDraft',input,subject,body),
 sendInitial:(input:OutreachInput,subject:string,body:string,corrections?:JobAnalysis,options?:import('../shared/types').SendOptions)=>ipcRenderer.invoke('outreach:send',input,subject,body,corrections,options),
 sendManualFollowUp:(contactId:string,subject:string,body:string)=>ipcRenderer.invoke('followup:sendManual',contactId,subject,body),
 scheduleEmail:(input:OutreachInput,subject:string,body:string,options:import('../shared/types').SendOptions)=>ipcRenderer.invoke('email:schedule',input,subject,body,options),
 cancelScheduledEmail:(id:string)=>ipcRenderer.invoke('email:cancelScheduled',id),
 rescheduleScheduledEmail:(id:string,date:string,time:string)=>ipcRenderer.invoke('email:rescheduleScheduled',id,date,time),
 setStatus:(type:'application'|'contact',id:string,status:string)=>ipcRenderer.invoke('status:set',type,id,status),
 updateTemplate:(template:Template)=>ipcRenderer.invoke('template:update',template),
 restoreTemplates:()=>ipcRenderer.invoke('template:restore'),
 importResume:()=>ipcRenderer.invoke('resume:import'),
 chooseWorkbook:()=>ipcRenderer.invoke('data:chooseWorkbook'),
 exportWorkbook:()=>ipcRenderer.invoke('data:export'),
 backup:()=>ipcRenderer.invoke('data:backup'),
 restoreBackup:()=>ipcRenderer.invoke('data:restore'),
 connectGmail:(clientId:string,clientSecret:string)=>ipcRenderer.invoke('gmail:connect',clientId,clientSecret),
 disconnectGmail:()=>ipcRenderer.invoke('gmail:disconnect'),
 updateFollowUp:(id:string,action:'pause'|'resume'|'cancel'|'reschedule'|'retry',date?:string,time?:string)=>ipcRenderer.invoke('followup:update',id,action,date,time),
 confirmOverdue:(ids:string[])=>ipcRenderer.invoke('followup:confirmOverdue',ids),
 openGmailThread:(threadId:string)=>ipcRenderer.invoke('gmail:openThread',threadId),
 openExternal:(url:string)=>ipcRenderer.invoke('external:open',url),
 setSchedulerTime:(time:string)=>ipcRenderer.invoke('scheduler:setTime',time),
 onNotice:(callback:(message:string)=>void)=>{const listener=(_event:Electron.IpcRendererEvent,message:string)=>callback(message);ipcRenderer.on('notice',listener);return()=>ipcRenderer.removeListener('notice',listener)}
};
contextBridge.exposeInMainWorld('outreach',api);
