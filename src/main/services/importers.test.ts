import { describe, expect, it, vi } from 'vitest';
import { importGithubProfile, importPublicJobUrl, parsePublicPage, parseResumeProfile } from './importers';

describe('parsePublicPage', () => {
  it('extracts structured job details from public page metadata', () => {
    const html = `<html><head><title>Role</title><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Backend Engineer',
      description: '<p>Build services with Java and AWS.</p>',
      hiringOrganization: { name: 'Northstar Labs' },
      jobLocation: { address: { addressLocality: 'Toronto', addressRegion: 'ON' } }
    })}</script></head><body></body></html>`;
    expect(parsePublicPage(html, 'https://jobs.example/role')).toMatchObject({
      title: 'Backend Engineer',
      company: 'Northstar Labs',
      description: 'Build services with Java and AWS.',
      location: 'Toronto, ON',
      url: 'https://jobs.example/role'
    });
  });

  it('rejects non-HTTPS and private URLs before making a request', async () => {
    await expect(importPublicJobUrl('http://127.0.0.1')).rejects.toThrow('Use a public HTTPS page URL.');
    await expect(importPublicJobUrl('https://127.0.0.1')).rejects.toThrow('Private and local URLs cannot be imported.');
  });
});

describe('parseResumeProfile', () => {
  it('extracts candidate contact details and recognizable skills', () => {
    const imported = parseResumeProfile('Taylor Morgan\nTaylor@example.com\n+1 416 555 0184\nhttps://github.com/taylorm\nSkills\nJava, React, PostgreSQL, AWS');
    expect(imported.fullName).toBe('Taylor Morgan');
    expect(imported.email).toBe('Taylor@example.com');
    expect(imported.phone).toBe('+1 416 555 0184');
    expect(imported.githubUrl).toBe('https://github.com/taylorm');
    expect(imported.skills.languages).toContain('Java');
    expect(imported.skills.frameworks).toContain('React');
    expect(imported.skills.databases).toContain('PostgreSQL');
    expect(imported.skills.cloudDevops).toContain('AWS');
  });
});

describe('importGithubProfile', () => {
  it('maps public profile and repository data into candidate details and projects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Taylor Morgan', email: 'taylor@example.com', location: 'Toronto', html_url: 'https://github.com/taylorm' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 42, name: 'sample-app', description: 'A sample project', html_url: 'https://github.com/taylorm/sample-app', homepage: '', language: 'TypeScript', topics: ['react'], fork: false }]), { status: 200 }));
    try {
      const imported = await importGithubProfile('https://github.com/taylorm');
      expect(imported.fullName).toBe('Taylor Morgan');
      expect(imported.skills.languages).toContain('TypeScript');
      expect(imported.projects[0]).toMatchObject({ name: 'sample-app', technologies: ['TypeScript', 'react'] });
    } finally {
      fetchMock.mockRestore();
    }
  });
});