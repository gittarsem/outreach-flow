import { describe, expect, it } from 'vitest';
import { inferScreenshotFields } from './jobImport';

describe('inferScreenshotFields', () => {
  it('extracts clear role, company, and location values from LinkedIn-style text', () => {
    const text = 'LinkedIn\nSenior Software Engineer\nAcme Labs · Toronto, ON (Hybrid) · 2 days ago\nAbout the job';
    expect(inferScreenshotFields(text, 'LinkedIn')).toEqual({
      title: 'Senior Software Engineer',
      company: 'Acme Labs',
      location: 'Toronto, ON (Hybrid)'
    });
  });

  it('leaves generic headings blank rather than treating them as job titles', () => {
    expect(inferScreenshotFields('LinkedIn\nJobs\nAbout the job', 'Jobs')).toEqual({
      title: '',
      company: '',
      location: ''
    });
  });
});