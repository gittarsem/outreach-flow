import { describe, expect, it } from 'vitest';
import type { Contact } from '../../shared/types';
import { scheduleFollowups } from './scheduler';

const contact:Contact={id:'c1',applicationId:'a1',company:'Northstar',name:'Riley',designation:'Recruiter',email:'riley@example.com',linkedinUrl:'',source:'Manual',initialEmailDate:'',emailStatus:'Email Sent',replyStatus:'',lastContacted:'',threadId:'thread-1',messageId:'message-1',suppressed:false};
describe('persistent follow-up schedule calculation',()=>{
 it('schedules follow-ups for calendar Days 1, 2, 4, 6, and 7, moving collisions to the next available weekday',()=>{const result=scheduleFollowups(new Date('2025-04-17T04:00:00Z'),contact,'Engineer',{COMPANY_NAME:'Northstar',JOB_TITLE:'Engineer'},[],'09:45');expect(result).toHaveLength(5);expect(result.map(f=>f.scheduledAt.slice(0,10))).toEqual(['2025-04-18','2025-04-21','2025-04-22','2025-04-23','2025-04-24']);expect(result.every(f=>f.scheduledAt.includes('T09:45:00+05:30'))).toBe(true);expect(result.map(f=>f.sequence)).toEqual([1,2,3,4,5]);});
 it('moves sends off Indian public holidays and weekends',()=>{const result=scheduleFollowups(new Date('2025-10-01T04:00:00Z'),contact,'Engineer',{COMPANY_NAME:'Northstar',JOB_TITLE:'Engineer'},[],'10:00');expect(result.map(f=>f.scheduledAt.slice(0,10))).toEqual(['2025-10-03','2025-10-06','2025-10-07','2025-10-08','2025-10-09']);});
 it('rejects invalid delivery time values',()=>{expect(()=>scheduleFollowups(new Date(),contact,'Engineer',{},[],'25:00')).toThrow('valid 24-hour follow-up time');});
});
