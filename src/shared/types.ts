export type AppPage = 'Dashboard' | 'Compose Email' | 'Email Log' | 'Recipients' | 'Follow-ups' | 'Templates' | 'Profile' | 'Candidate Profile' | 'Excel & Data' | 'Settings';
export type AppStatus = 'Draft' | 'Ready to Send' | 'Contacted' | 'Follow-up in Progress' | 'Replied' | 'Interview' | 'Rejected' | 'Closed';
export type ContactStatus = 'Not Contacted' | 'Scheduled' | 'Email Sent' | 'Follow-up Scheduled' | 'Replied' | 'Bounced' | 'Unsubscribed' | 'Cancelled' | 'Failed';
export type FollowUpStatus = 'Scheduled' | 'Processing' | 'Sent' | 'Cancelled' | 'Failed' | 'Skipped';
export interface Project { id: string; name: string; description: string; technologies: string[]; features: string; contribution: string; url: string; relevantSkills: string[] }
export interface Resume { id: string; name: string; filename: string; path: string; categories: string[]; isDefault: boolean }
export interface CandidateProfile {
  fullName: string; email: string; phone: string; linkedinUrl: string; githubUrl: string; location: string;
  education: { degree: string; college: string; branch: string; graduationYear: string };
  skills: { languages: string[]; frameworks: string[]; databases: string[]; backend: string[]; frontend: string[]; cloudDevops: string[]; other: string[] };
  projects: Project[]; resumes: Resume[];
}
export interface JobAnalysis { title: string; requiredSkills: string[]; preferredSkills: string[]; skills: string[]; languages: string[]; frameworks: string[]; libraries: string[]; databases: string[]; messaging: string[]; cloud: string[]; devops: string[]; responsibilities: string[]; experience: string; domainKeywords: string[] }
export interface Application { id: string; company: string; title: string; description: string; url: string; location: string; experience: string; createdAt: string; appliedAt: string; resumeFilename: string; requiredSkills: string[]; matchedSkills: string[]; matchScore: number; status: AppStatus; notes: string; analysis: JobAnalysis }
export interface Contact { id: string; applicationId: string; company: string; name: string; designation: string; email: string; linkedinUrl: string; source: string; initialEmailDate: string; emailStatus: ContactStatus; replyStatus: string; lastContacted: string; threadId: string; messageId: string; suppressed: boolean }
export interface FollowUp { id: string; contactId: string; sequence: number; scheduledAt: string; status: FollowUpStatus; gmailMessageId: string; gmailThreadId: string; sentAt: string; error: string; subject: string; body: string; confirmedOverdue: boolean; paused: boolean }
export type ScheduledEmailStatus = 'Scheduled' | 'Processing' | 'Sent' | 'Cancelled' | 'Failed';
export interface ScheduledEmail { id: string; applicationId: string; contactId: string; recipientName: string; recipientEmail: string; organization: string; subject: string; body: string; resumeId: string; scheduledAt: string; status: ScheduledEmailStatus; createdAt: string; sentAt: string; gmailMessageId: string; gmailThreadId: string; error: string; scheduleFollowUps: boolean; followUpIntervalDays: number; followUpTime: string }
export interface Activity { timestamp: string; company: string; contact: string; activity: string; result: string; details: string }
export interface OutreachInput { company: string; title: string; description: string; url: string; location: string; experience: string; contactName: string; email: string; designation: string; linkedinUrl: string; notes: string; resumeId: string; applicationId?: string }
export interface GeneratedEmail { subject: string; body: string; analysis: JobAnalysis; matchedSkills: string[]; missingSkills: string[]; score: number; projects: Project[]; resume?: Resume }
export interface PublicPageDetails { title: string; company: string; description: string; location: string; experience: string; url: string }
export interface GithubProfileImport { fullName: string; email: string; location: string; githubUrl: string; skills: CandidateProfile['skills']; projects: Project[] }
export interface ResumeProfileImport { fullName: string; email: string; phone: string; linkedinUrl: string; githubUrl: string; skills: CandidateProfile['skills'] }
export interface SendOptions { mode?: 'job'|'direct'; scheduleFollowUps?: boolean; followUpIntervalDays?: number; followUpTime?: string; scheduledAt?: string }
export interface Template { id: string; category: string; name: string; subject: string; body: string; custom?: boolean }
export interface AppState { profile: CandidateProfile; applications: Application[]; contacts: Contact[]; scheduledEmails: ScheduledEmail[]; followUps: FollowUp[]; activity: Activity[]; templates: Template[]; gmail: { connected: boolean; email: string; configured: boolean }; scheduler: { running: boolean; overdueCount: number; defaultTime: string }; data: { workbookPath: string; pendingJournal: number } }
export interface IpcApi {
  getState(): Promise<AppState>; saveProfile(profile: CandidateProfile): Promise<void>; analyze(description: string, title?: string): Promise<JobAnalysis>; importJobScreenshot(): Promise<string|null>;
  importJobUrl(url: string): Promise<PublicPageDetails>; importGithubProfile(url: string): Promise<GithubProfileImport>; importResumeProfile(resumeId: string): Promise<ResumeProfileImport>;
  generateEmail(input: OutreachInput, projectIds?: string[], tone?: string, corrections?: JobAnalysis): Promise<GeneratedEmail>; saveDraft(input: OutreachInput, analysis: JobAnalysis): Promise<void>;
  createGmailDraft(input: OutreachInput, subject: string, body: string): Promise<void>;
  sendInitial(input: OutreachInput, subject: string, body: string, corrections?: JobAnalysis, options?: SendOptions): Promise<{ contactId: string; threadId: string }>;
  sendManualFollowUp(contactId: string, subject: string, body: string): Promise<void>;
  scheduleEmail(input: OutreachInput, subject: string, body: string, options: SendOptions): Promise<{ id: string }>;
  cancelScheduledEmail(id: string): Promise<void>; rescheduleScheduledEmail(id: string, date: string, time: string): Promise<void>;
  setStatus(type: 'application'|'contact', id: string, status: string): Promise<void>; updateTemplate(template: Template): Promise<void>; restoreTemplates(): Promise<void>;
  importResume(): Promise<Resume|null>; chooseWorkbook(): Promise<string|null>; exportWorkbook(): Promise<void>; backup(): Promise<string>; restoreBackup(): Promise<void>;
  connectGmail(clientId: string, clientSecret: string): Promise<void>; disconnectGmail(): Promise<void>;
  confirmOverdue(ids: string[]): Promise<void>; openGmailThread(threadId: string): Promise<void>; openExternal(url: string): Promise<void>; onNotice(callback: (message: string)=>void): () => void;
  updateFollowUp(id: string, action: 'pause'|'resume'|'cancel'|'reschedule'|'retry', date?: string, time?: string): Promise<void>;
  setSchedulerTime(time:string): Promise<void>;
}
declare global { interface Window { outreach: IpcApi } }
