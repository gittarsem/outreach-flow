import type { CandidateProfile, GeneratedEmail, JobAnalysis, OutreachInput, Project, Resume, Template } from '../../shared/types';
import { applyTemplate } from '../../shared/template';
export { applyTemplate } from '../../shared/template';

type Entry = { name: string; group: keyof Omit<JobAnalysis, 'title'|'requiredSkills'|'preferredSkills'|'skills'|'responsibilities'|'experience'|'domainKeywords'> | 'skills'; aliases?: string[] };
const catalog: Entry[] = [
  {name:'Java',group:'languages'}, {name:'TypeScript',group:'languages'}, {name:'JavaScript',group:'languages',aliases:['JS']}, {name:'Python',group:'languages'}, {name:'C++',group:'languages'}, {name:'Go',group:'languages'}, {name:'C#',group:'languages'},
  {name:'Spring Boot',group:'frameworks',aliases:['Spring'],}, {name:'Spring MVC',group:'frameworks'}, {name:'React',group:'frameworks'}, {name:'Angular',group:'frameworks'}, {name:'Vue',group:'frameworks',aliases:['Vue.js']}, {name:'Node.js',group:'frameworks',aliases:['Node']}, {name:'Express',group:'frameworks',aliases:['Express.js']}, {name:'Django',group:'frameworks'}, {name:'Flask',group:'frameworks'}, {name:'Next.js',group:'frameworks'}, {name:'Tailwind CSS',group:'frameworks',aliases:['Tailwind']},
  {name:'REST APIs',group:'skills',aliases:['RESTful APIs','REST API','REST']}, {name:'Microservices',group:'skills'}, {name:'GraphQL',group:'skills'}, {name:'HTML',group:'skills'}, {name:'CSS',group:'skills'}, {name:'Responsive UI',group:'skills',aliases:['responsive design','responsive web']},
  {name:'PostgreSQL',group:'databases',aliases:['Postgres']}, {name:'MySQL',group:'databases'}, {name:'MongoDB',group:'databases'}, {name:'Redis',group:'databases'}, {name:'SQLite',group:'databases'}, {name:'DynamoDB',group:'databases'}, {name:'Snowflake',group:'databases'}, {name:'BigQuery',group:'databases',aliases:['Google BigQuery']}, {name:'Oracle Database',group:'databases',aliases:['Oracle DB']}, {name:'Cassandra',group:'databases',aliases:['Apache Cassandra']}, {name:'Elasticsearch',group:'databases',aliases:['Elastic Search']},
  {name:'Kafka',group:'messaging',aliases:['Apache Kafka']}, {name:'RabbitMQ',group:'messaging'}, {name:'AWS',group:'cloud',aliases:['Amazon Web Services']}, {name:'Azure',group:'cloud'}, {name:'GCP',group:'cloud',aliases:['Google Cloud']},
  {name:'Docker',group:'devops'}, {name:'Kubernetes',group:'devops',aliases:['K8s']}, {name:'Jenkins',group:'devops'}, {name:'GitHub Actions',group:'devops'}, {name:'Terraform',group:'devops'}, {name:'Git',group:'devops'}, {name:'JUnit',group:'libraries'}, {name:'Jest',group:'libraries'}, {name:'Redux',group:'libraries'}, {name:'Apache Spark',group:'libraries',aliases:['Spark']}, {name:'Apache Flink',group:'libraries',aliases:['Flink']}, {name:'Hibernate',group:'libraries'}, {name:'gRPC',group:'libraries'}, {name:'Prometheus',group:'libraries'}, {name:'Grafana',group:'libraries'}
];
let customCatalog:Entry[]=[];
export function setCustomSkillDictionary(entries:unknown){const allowed=['skills','languages','frameworks','libraries','databases','messaging','cloud','devops'];if(!Array.isArray(entries)){customCatalog=[];return;}customCatalog=entries.filter((x):x is {name:string;group:Entry['group'];aliases?:string[]}=>!!x&&typeof x.name==='string'&&typeof x.group==='string'&&allowed.includes(x.group)&&Array.isArray(x.aliases??[])).map(x=>({name:x.name.trim(),group:x.group,aliases:x.aliases||[]})).filter(x=>x.name.length>0&&x.aliases.every(a=>typeof a==='string'));
}
const allCatalog=()=>[...catalog,...customCatalog];
const categoryHeaders = /^(requirements?|qualifications?|must[- ]have|what you(?:'|’)ll do|responsibilities|preferred(?: qualifications| skills)?|nice to have|desired skills|minimum requirements?)\s*:?\s*$/i;
function occurrences(text: string, phrase: string): boolean { return new RegExp(`(^|[^\\w+#.])${phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^\\w+#.]|$)`, 'i').test(text); }
function list(text: string, group: Entry['group']): string[] { return [...new Set(allCatalog().filter(e => e.group===group && [e.name,...(e.aliases||[])].some(a=>occurrences(text,a))).map(e=>e.name))]; }
export function analyzeJob(description: string, suppliedTitle = ''): JobAnalysis {
  const lines=description.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const title=suppliedTitle.trim() || lines.find(l=>l.length<100 && !/^[-*•]/.test(l) && !/^(about|we are|job description)/i.test(l)) || '';
  let section='required'; const requiredText:string[]=[]; const preferredText:string[]=[]; const responsibilities:string[]=[];
  for (const raw of lines) {
    const line=raw.replace(/^[-*•\d.)\s]+/,'').trim(); if(!line)continue;
    if(categoryHeaders.test(line)){ section=/preferred|nice to have|desired/i.test(line)?'preferred':/responsibilities|what you/i.test(line)?'responsibilities':'required'; continue; }
    if(/^[-*•\d.)]/.test(raw) || raw!==line) { if(section==='preferred')preferredText.push(line); else if(section==='responsibilities')responsibilities.push(line); else requiredText.push(line); }
    else if(section==='responsibilities' && line.length>18) responsibilities.push(line);
  }
  // If no explicit requirement bullets are present, matched technologies remain neutral rather than being mislabeled required.
  const all=list(description,'skills').concat(list(description,'languages'),list(description,'frameworks'),list(description,'libraries'),list(description,'databases'),list(description,'messaging'),list(description,'cloud'),list(description,'devops'));
  const reqText=requiredText.join(' '), prefText=preferredText.join(' ');
  const requiredSkills=reqText? [...new Set(allCatalog().filter(e=>[e.name,...(e.aliases||[])].some(a=>occurrences(reqText,a))).map(e=>e.name))]:[];
  const preferredSkills=prefText? [...new Set(allCatalog().filter(e=>[e.name,...(e.aliases||[])].some(a=>occurrences(prefText,a))).map(e=>e.name))]:[];
  const exp=description.match(/\b(\d{1,2}\+?\s*(?:-|to)\s*\d{1,2}\+?\s*years?|\d{1,2}\+?\s*years?)\b/i)?.[0]||'';
  const domains=['fintech','healthcare','e-commerce','ecommerce','travel','education','logistics','gaming','insurance','banking','saas'].filter(x=>occurrences(description,x));
  return {title,requiredSkills,preferredSkills,skills:[...new Set(all)],languages:list(description,'languages'),frameworks:list(description,'frameworks'),libraries:list(description,'libraries'),databases:list(description,'databases'),messaging:list(description,'messaging'),cloud:list(description,'cloud'),devops:list(description,'devops'),responsibilities:[...new Set(responsibilities)].slice(0,8),experience:exp,domainKeywords:domains};
}
const canonical=(skill:string)=>{const folded=skill.trim().toLowerCase();return allCatalog().find(e=>[e.name,...(e.aliases||[])].some(a=>a.toLowerCase()===folded))?.name.toLowerCase()||folded};
const getCandidateSkills=(p:CandidateProfile)=>[...new Set([...Object.values(p.skills).flat(),...p.projects.flatMap(x=>[...x.technologies,...x.relevantSkills])].map(canonical))];
export function generateEmail(input: OutreachInput, profile: CandidateProfile, projectIds?: string[], tone='professional', correctedAnalysis?:JobAnalysis, initialTemplate?:Template): GeneratedEmail {
  const analysis=correctedAnalysis||analyzeJob(input.description,input.title); const wanted=[...new Set([...analysis.requiredSkills,...analysis.preferredSkills,...analysis.skills])];
  const candidateSkills=getCandidateSkills(profile); const matchedSkills=wanted.filter(s=>candidateSkills.includes(canonical(s)));
  const missingSkills=wanted.filter(s=>!matchedSkills.includes(s)); const required=analysis.requiredSkills;
  const score=required.length?Math.round(required.filter(s=>matchedSkills.includes(s)).length/required.length*100):0;
  const projectScores=profile.projects.map(project=>({project,score:[...project.technologies,...project.relevantSkills].filter(s=>wanted.some(w=>canonical(w)===canonical(s))).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  const chosen=projectIds?.length?profile.projects.filter(p=>projectIds.includes(p.id)):projectScores.slice(0,2).map(x=>x.project);
  const resume=profile.resumes.find(r=>r.id===input.resumeId)||profile.resumes.find(r=>r.isDefault);
  const greeting=input.contactName.trim()?`Hello ${input.contactName.trim()},`:'Hello,';
  const opening=`I’m reaching out to apply for the ${input.title||analysis.title||'open'} role at ${input.company}.`;
  const capability=matchedSkills.length?`My relevant experience includes ${matchedSkills.slice(0,5).join(', ')}.`:`I’m interested in learning more about the role and how my background may fit its requirements.`;
  const projectLines=chosen.slice(0,2).map(project=>`${project.name}${project.description?` — ${project.description}`:''}${project.contribution?` My contribution: ${project.contribution}`:''}${project.technologies.length?` (${project.technologies.slice(0,4).join(', ')})`:''}.`);
  const projectText=projectLines.length?`Relevant project work:\n${projectLines.map(x=>`• ${x}`).join('\n')}`:'';
  const interested=tone==='concise'?`I’d welcome a conversation about the position.`:`The role’s focus${analysis.domainKeywords.length?` in ${analysis.domainKeywords.join(' and ')}`:''} is of interest to me, and I’d welcome a conversation about how I could contribute.`;
  const resumeText=resume?`I’ve attached ${resume.filename} for your review.`:'I can share my resume on request.';
  const links=[profile.linkedinUrl?`LinkedIn: ${profile.linkedinUrl}`:'',profile.email?profile.email:''].filter(Boolean).join(' · ');
  const signoff=[profile.fullName,profile.phone,links].filter(Boolean).join('\n');
  const variables={HR_NAME:input.contactName||'',COMPANY_NAME:input.company,JOB_TITLE:input.title||analysis.title||'',CANDIDATE_NAME:profile.fullName||'',MATCHED_SKILLS:matchedSkills.slice(0,5).join(', '),RELEVANT_PROJECTS:chosen.map(p=>`${p.name}${p.description?` — ${p.description}`:''}${p.technologies.length?` (${p.technologies.slice(0,4).join(', ')})`:''}`).join('\n'),RESUME_FILENAME:resume?.filename||'',LINKEDIN_URL:profile.linkedinUrl||''};
  let body=initialTemplate?applyTemplate(initialTemplate.body,variables):[greeting,'',opening,capability,projectText,interested,resumeText,'',`Best regards,${signoff?`\n${signoff}`:''}`].filter((x,i)=>x!==''||i>0).join('\n\n');
  if(tone==='concise')body=body.replace('I’m reaching out to apply for','I’m applying for').replace(/\n\nThe role’s focus[^\n]*/,'');
  const subject=initialTemplate?applyTemplate(initialTemplate.subject,variables):`Application: ${input.title||analysis.title||'Position'} — ${input.company}`;
  return {subject,body,analysis,matchedSkills,missingSkills,score,projects:chosen,resume};
}

export const defaultTemplates = [
  {id:'initial',category:'General',name:'General introduction',subject:'A message from {{CANDIDATE_NAME}}',body:'Hello {{HR_NAME}},\n\nI wanted to introduce myself and share a little about my work.\n\n{{RELEVANT_PROJECTS}}\n\nI’ve attached {{RESUME_FILENAME}} for context.\n\nBest regards,\n{{CANDIDATE_NAME}}\n{{LINKEDIN_URL}}'},
  ...[
    ['follow1','Follow-up 1','Gentle reminder','A quick follow-up','I wanted to follow up on my previous message. Please let me know if you need any additional information.'],
    ['follow2','Follow-up 2','Additional context','A little more context','I’m checking in and would be happy to provide more context or answer any questions.'],
    ['follow3','Follow-up 3','Checking in','Checking in','I wanted to check whether you had a chance to review my previous email. Thank you for your time.'],
    ['follow4','Follow-up 4','Availability','Available to discuss','I remain available if a conversation would be useful. Please let me know what works for you.'],
    ['follow5','Follow-up 5','Final note','Final follow-up','This is my final follow-up for now. Thank you for reading, and I wish you all the best.']
  ].map(([id,category,name,subject,body])=>({id,category,name,subject,body}))
] as const;

export function reconcileTemplates(saved:Template[]):Template[]{
  const defaultIds=new Set(defaultTemplates.map(template=>template.id));
  const currentDefaults=defaultTemplates.map(template=>{const custom=saved.find(item=>item.id===template.id&&item.custom);return {...template,...custom};});
  return [...currentDefaults,...saved.filter(template=>template.custom&&!defaultIds.has(template.id))];
}

