import { describe, expect, it } from 'vitest';
import type { CandidateProfile, OutreachInput } from '../../shared/types';
import { analyzeJob, defaultTemplates, generateEmail, reconcileTemplates } from './engine';

const profile:CandidateProfile={fullName:'Morgan Lee',email:'morgan@example.com',phone:'',linkedinUrl:'',githubUrl:'',location:'',education:{degree:'',college:'',branch:'',graduationYear:''},skills:{languages:['Java','TypeScript','JavaScript'],frameworks:['Spring Boot','React','Tailwind CSS'],databases:['PostgreSQL'],backend:['REST APIs','Microservices'],frontend:['Responsive UI'],cloudDevops:['Docker'],other:[]},resumes:[{id:'resume-1',name:'Backend resume',filename:'Morgan-Resume.pdf',path:'/private/tmp/Morgan-Resume.pdf',categories:[],isDefault:true}],projects:[{id:'backend',name:'StayLedger',description:'A booking service with caching and asynchronous events.',technologies:['Java','Spring Boot','PostgreSQL','Redis','Kafka'],features:'',contribution:'Designed the reservation API.',url:'',relevantSkills:['REST APIs','Microservices']},{id:'web',name:'StudioBoard',description:'A responsive project planning interface.',technologies:['React','TypeScript','Tailwind CSS'],features:'',contribution:'Built the interface and reusable components.',url:'',relevantSkills:['Responsive UI']},{id:'irrelevant',name:'Audio Lab',description:'A small music visualizer.',technologies:['Web Audio'],features:'',contribution:'',url:'',relevantSkills:[]}]};
const input=(title:string,description:string):OutreachInput=>({company:'Northstar Labs',title,description,url:'',location:'',experience:'',contactName:'Jordan',email:'jordan@northstar.test',designation:'Recruiter',linkedinUrl:'',notes:'',resumeId:'resume-1',applicationId:'app-1'});

describe('deterministic JD analysis and email generation',()=>{
  it('extracts required and preferred skills separately',()=>{const a=analyzeJob(`Java Backend Engineer\nRequirements:\n- Java\n- Spring Boot\n- PostgreSQL\nPreferred skills:\n- Kafka`);expect(a.requiredSkills).toEqual(expect.arrayContaining(['Java','Spring Boot','PostgreSQL']));expect(a.preferredSkills).toContain('Kafka');});
  it('produces different emails for backend, frontend, and full-stack roles',()=>{
    const java=input('Java Backend Developer',`Java Backend Developer\nRequirements:\n- Java\n- Spring Boot\n- PostgreSQL\n- Kafka\nResponsibilities:\n- Build REST APIs and microservices.`);
    const front=input('Frontend Developer',`Frontend Developer\nRequirements:\n- React\n- TypeScript\n- Tailwind CSS\n- Responsive UI development.`);
    const full=input('Full Stack Engineer',`Full Stack Engineer\nRequirements:\n- Java\n- Spring Boot\n- React\n- TypeScript\n- PostgreSQL`);
    const backendMail=generateEmail(java,profile);const frontMail=generateEmail(front,profile);const fullMail=generateEmail(full,profile);
    expect(backendMail.body).toContain('Java');expect(backendMail.body).toContain('StayLedger');expect(backendMail.body).not.toContain('StudioBoard');
    expect(frontMail.body).toContain('React');expect(frontMail.body).toContain('StudioBoard');expect(frontMail.body).not.toContain('StayLedger');
    expect(fullMail.body).toContain('Java');expect(fullMail.body).toContain('React');expect(new Set([backendMail.body,frontMail.body,fullMail.body]).size).toBe(3);
  });
  it('does not claim missing skills and includes only projects tied to matched skills',()=>{
    const jd=input('Data Engineer',`Data Engineer\nRequirements:\n- Java\n- Snowflake\n- Apache Flink`);const generated=generateEmail(jd,profile);
    expect(generated.matchedSkills).toContain('Java');expect(generated.missingSkills).toContain('Snowflake');expect(generated.body).not.toContain('Snowflake');expect(generated.body).not.toContain('Audio Lab');expect(generated.projects.every(p=>p.id!=='irrelevant')).toBe(true);
  });
  it('supports user corrected skills and a fully editable returned body',()=>{
    const jd=input('Engineer',`Engineer\nRequirements:\n- Java`);const correction={...analyzeJob(jd.description,jd.title),requiredSkills:['Java','Custom Runtime'],skills:['Java','Custom Runtime']};const generated=generateEmail(jd,profile,undefined,'professional',correction);
    expect(generated.missingSkills).toContain('Custom Runtime');expect(typeof generated.body).toBe('string');expect(generated.score).toBe(50);
  });
});

describe('saved template defaults',()=>{
  it('refreshes old built-ins but preserves user-customized templates',()=>{
    const reconciled=reconcileTemplates([
      {id:'initial',category:'Initial application',name:'Old job template',subject:'Old subject',body:'Old body'},
      {id:'follow1',category:'Follow-up 1',name:'My follow-up',subject:'Custom subject',body:'Custom body',custom:true},
      {id:'my-template',category:'Custom',name:'My template',subject:'Hi',body:'Hello',custom:true}
    ]);
    expect(reconciled.find(template=>template.id==='initial')?.name).toBe('General introduction');
    expect(reconciled.find(template=>template.id==='follow1')?.body).toBe('Custom body');
    expect(reconciled.find(template=>template.id==='my-template')?.body).toBe('Hello');
    expect(reconciled).toHaveLength(defaultTemplates.length+1);
  });
});
