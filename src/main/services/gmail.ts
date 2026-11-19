import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Contact, FollowUp, Resume } from '../../shared/types';

type Token = { access_token?:string|null; refresh_token?:string|null; scope?:string|null; token_type?:string|null; expiry_date?:number|null; id_token?:string|null };
const b64url=(value:Buffer|string)=>Buffer.from(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const wrap=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
const h=(s:string)=>s.replace(/[\r\n]/g,' ').replace(/[^\x20-\x7E]/g,'?');
const subjectHeader=(s:string)=>/[^\x20-\x7E]/.test(s)?`=?UTF-8?B?${Buffer.from(s,'utf8').toString('base64')}?=`:h(s);
const messageHeader=(headers:gmail_v1.Schema$MessagePartHeader[]|undefined,key:string)=>headers?.find(x=>x.name?.toLowerCase()===key.toLowerCase())?.value||'';

export class GmailService {
  private oauth?:OAuth2Client; private gmail?:gmail_v1.Gmail; private profileEmail='';
  constructor(private tokenFile:string, private credentialFile:string, private dataDir:string, private encrypt:(s:string)=>string, private decrypt:(s:string)=>string, private openExternal:(url:string)=>Promise<void>){}
  async configure(clientId:string,clientSecret:string):Promise<void>{if(!clientId.trim()||!clientSecret.trim())throw new Error('Enter your Google OAuth Client ID and Client Secret.');await fs.mkdir(path.dirname(this.credentialFile),{recursive:true});await fs.writeFile(this.credentialFile,this.encrypt(JSON.stringify({clientId:clientId.trim(),clientSecret:clientSecret.trim()})),'utf8');await this.authorize(clientId.trim(),clientSecret.trim());}
  async disconnect(){this.oauth=undefined;this.gmail=undefined;this.profileEmail='';await fs.rm(this.tokenFile,{force:true});}
  async status():Promise<{connected:boolean;email:string;configured:boolean}>{const configured=await this.exists(this.credentialFile);if(!this.oauth&&configured){try{const raw=await fs.readFile(this.credentialFile,'utf8');let c:{clientId:string;clientSecret:string};try{c=JSON.parse(raw) as typeof c;await fs.writeFile(this.credentialFile,this.encrypt(JSON.stringify(c)),'utf8')}catch{c=JSON.parse(this.decrypt(raw)) as typeof c;}await this.restore(c.clientId,c.clientSecret)}catch{}}return {connected:!!this.gmail,email:this.profileEmail,configured};}
  async sendInitial(to:string,subject:string,body:string,resume:Resume|undefined,idempotencyId:string):Promise<{messageId:string;threadId:string;internetMessageId:string}>{
    const gmail=await this.api();const key=idempotencyId.replace(/[^a-zA-Z0-9-]/g,'');
    // Recover a send after a crash by looking for the deterministic RFC Message-ID in Sent.
    const deterministic=`<${key}@outreachflow.local>`;
    const found=await gmail.users.messages.list({userId:'me',q:`in:sent rfc822msgid:${key}@outreachflow.local`,maxResults:5});if(found.data.messages?.length){const m=await gmail.users.messages.get({userId:'me',id:found.data.messages[0].id!,format:'metadata',metadataHeaders:['Message-ID']});return {messageId:m.data.id!,threadId:m.data.threadId!,internetMessageId:messageHeader(m.data.payload?.headers,'Message-ID')||deterministic};}
    const raw=await this.makeMime({to,subject,body,messageId:deterministic,extraHeaders:[['X-OutreachFlow-Id',key]],resume});
    const result=await gmail.users.messages.send({userId:'me',requestBody:{raw:b64url(raw)}});const meta=await gmail.users.messages.get({userId:'me',id:result.data.id!,format:'metadata',metadataHeaders:['Message-ID']});return {messageId:result.data.id!,threadId:result.data.threadId!,internetMessageId:messageHeader(meta.data.payload?.headers,'Message-ID')||deterministic};
  }
  async sendFollowUp(contact:Contact,follow:FollowUp):Promise<{messageId:string;threadId:string}>{
    if(!contact.threadId)throw new Error('No Gmail thread is recorded for this outreach.');const gmail=await this.api();
    const stableId=follow.id.replace(/[^a-zA-Z0-9-]/g,'');const internetMessageId=`<${stableId}@outreachflow.local>`;
    const found=await gmail.users.messages.list({userId:'me',q:`in:sent rfc822msgid:${stableId}@outreachflow.local`,maxResults:5});if(found.data.messages?.length){const prior=found.data.messages.find(m=>m.threadId===contact.threadId);if(prior)return {messageId:prior.id!,threadId:prior.threadId!};}
    const thread=await gmail.users.threads.get({userId:'me',id:contact.threadId,format:'full'});const msgs=thread.data.messages||[];
    const latest=msgs[msgs.length-1];const latestHeaders=latest?.payload?.headers;const originalSubject=messageHeader(msgs[0]?.payload?.headers,'Subject')||follow.subject;
    const replyTo=messageHeader(latestHeaders,'Message-ID');const refs=messageHeader(latestHeaders,'References');
    const raw=await this.makeMime({to:contact.email,subject:/^re:/i.test(originalSubject)?originalSubject:`Re: ${originalSubject}`,body:follow.body,messageId:internetMessageId,extraHeaders:[['X-OutreachFlow-Id',stableId],['In-Reply-To',replyTo],['References',[refs,replyTo].filter(Boolean).join(' ')]]});
    const result=await gmail.users.messages.send({userId:'me',requestBody:{raw:b64url(raw),threadId:contact.threadId}});return {messageId:result.data.id!,threadId:result.data.threadId!};
  }
  async createDraft(to:string,subject:string,body:string,resume?:Resume){const g=await this.api();const raw=await this.makeMime({to,subject,body,messageId:`<${randomUUID()}@outreachflow.local>`,extraHeaders:[],resume});return g.users.drafts.create({userId:'me',requestBody:{message:{raw:b64url(raw)}}});}
  async checkReplies(contacts:Contact[]):Promise<Array<{contact:Contact;kind:'reply'|'bounce';snippet:string}>>{
    const g=await this.api();const out:Array<{contact:Contact;kind:'reply'|'bounce';snippet:string}>=[];
    for(const c of contacts){if(!c.threadId||c.emailStatus==='Replied'||c.emailStatus==='Bounced')continue;try{const r=await g.users.threads.get({userId:'me',id:c.threadId,format:'full'});for(const m of r.data.messages||[]){const from=messageHeader(m.payload?.headers,'From');const date=Number(m.internalDate||0);const initial=Date.parse(c.initialEmailDate)||0;if(date<=initial||from.toLowerCase().includes(this.profileEmail.toLowerCase()))continue;const subject=messageHeader(m.payload?.headers,'Subject').toLowerCase();const bounce=/mailer-daemon|postmaster|delivery status notification/i.test(from)||/undeliverable|delivery failed|returned mail|delivery status/i.test(subject);out.push({contact:c,kind:bounce?'bounce':'reply',snippet:(m.snippet||'').slice(0,200)});break;}}catch(e){if((e as {code?:number}).code===404)continue;throw e;}}
    return out;
  }
  async createGmailUrl(threadId:string){return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`}
  private async api():Promise<gmail_v1.Gmail>{if(!this.gmail){const s=await this.status();if(!s.connected)throw new Error('Gmail is disconnected. Connect Gmail in Settings before sending.');}if(!this.gmail)throw new Error('Gmail is disconnected.');return this.gmail;}
  private async makeMime(args:{to:string;subject:string;body:string;messageId:string;extraHeaders:Array<[string,string]>;resume?:Resume}):Promise<string>{
    const headers=[`To: ${h(args.to)}`,`Subject: ${subjectHeader(args.subject)}`,`From: ${h(this.profileEmail)}`,`Message-ID: ${args.messageId}`,...args.extraHeaders.filter(([,v])=>!!v).map(([k,v])=>`${k}: ${h(v)}`),'MIME-Version: 1.0'];
    const encodedBody=wrap(Buffer.from(args.body,'utf8').toString('base64'));
    if(!args.resume){headers.push('Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64');return `${headers.join('\r\n')}\r\n\r\n${encodedBody}`;}
    const resolved=path.resolve(args.resume.path);if(!resolved.startsWith(path.resolve(this.dataDir)+path.sep))throw new Error('Resume must be stored in the OutreachFlow data folder.');
    if(!resolved.toLowerCase().endsWith('.pdf'))throw new Error('Only PDF resumes can be attached.');const file=await fs.readFile(resolved);const boundary=`of-${randomUUID()}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    return `${headers.join('\r\n')}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}\r\n--${boundary}\r\nContent-Type: application/pdf; name="${h(path.basename(resolved))}"\r\nContent-Disposition: attachment; filename="${h(path.basename(resolved))}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(file.toString('base64'))}\r\n--${boundary}--`;
  }
  private async authorize(clientId:string,clientSecret:string){
    const server=createServer();const state=randomBytes(18).toString('hex');const listener=await new Promise<{port:number;oauth:OAuth2Client}>((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(new Error('Could not open the local OAuth callback.'));const redirect=`http://127.0.0.1:${address.port}`;resolve({port:address.port,oauth:new OAuth2Client(clientId,clientSecret,redirect)});});});
    const scopes=['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.compose'];let settled=false;
    const finish=(err?:Error)=>{if(settled)return;settled=true;clearTimeout(timeout);server.close();err?rejectAuth(err):resolveAuth();};let resolveAuth:()=>void=()=>{};let rejectAuth:(e:Error)=>void=()=>{};
    const authPromise=new Promise<void>((resolve,reject)=>{resolveAuth=resolve;rejectAuth=reject;});
    const timeout=setTimeout(()=>finish(new Error('Google sign-in timed out. Click Connect Gmail to try again.')),180000);
    server.on('request',async(req,res)=>{const url=new URL(req.url||'/',`http://127.0.0.1:${listener.port}`);if(url.pathname!=='/'){res.writeHead(404).end();return;}if(url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid OAuth state.');finish(new Error('Google sign-in state did not match.'));return;}const code=url.searchParams.get('code');if(!code){res.writeHead(400).end('Google did not return an authorization code.');finish(new Error(url.searchParams.get('error_description')||url.searchParams.get('error')||'Google authorization was denied.'));return;}res.writeHead(200,{'Content-Type':'text/html'}).end('<h2>OutreachFlow connected</h2><p>You can return to the app.</p>');try{const {tokens}=await listener.oauth.getToken(code);listener.oauth.setCredentials(tokens);await this.persistToken(tokens);this.oauth=listener.oauth;this.gmail=google.gmail({version:'v1',auth:this.oauth});const p=await this.gmail.users.getProfile({userId:'me'});this.profileEmail=p.data.emailAddress||'';finish();}catch(e){finish(e instanceof Error?e:new Error('Could not finish Google sign-in.'));}});
    const authUrl=listener.oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:scopes,state,include_granted_scopes:true});try{await this.openExternal(authUrl);}catch(e){finish(e instanceof Error?e:new Error('Could not open the browser for Google sign-in.'));}await authPromise;
  }
  private async restore(clientId:string,clientSecret:string){if(!(await this.exists(this.tokenFile)))return;const redirect='http://127.0.0.1';const o=new OAuth2Client(clientId,clientSecret,redirect);const encrypted=await fs.readFile(this.tokenFile,'utf8');const token=JSON.parse(this.decrypt(encrypted)) as Token;o.setCredentials({access_token:token.access_token||undefined,refresh_token:token.refresh_token||undefined,scope:token.scope||undefined,token_type:token.token_type||undefined,expiry_date:token.expiry_date||undefined,id_token:token.id_token||undefined});this.oauth=o;this.gmail=google.gmail({version:'v1',auth:o});const p=await this.gmail.users.getProfile({userId:'me'});this.profileEmail=p.data.emailAddress||'';o.on('tokens',t=>{this.persistToken({...o.credentials,...t}).catch(()=>{});});}
  private async persistToken(tokens:Token){await fs.mkdir(path.dirname(this.tokenFile),{recursive:true});await fs.writeFile(this.tokenFile,this.encrypt(JSON.stringify(tokens)),'utf8');}
  private async exists(file:string){try{await fs.access(file);return true}catch{return false}}
}
