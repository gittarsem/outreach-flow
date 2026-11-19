import { lookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';
import type { CandidateProfile, JobAnalysis, Project } from '../../shared/types';

const maxPageBytes = 5 * 1024 * 1024;
const maxPdfBytes = 20 * 1024 * 1024;
const githubHeaders = { accept: 'application/vnd.github+json', 'user-agent': 'OutreachFlow' };

export interface PublicPageDetails {
  title: string;
  company: string;
  description: string;
  location: string;
  experience: string;
  url: string;
}

export interface GithubProfileImport {
  fullName: string;
  email: string;
  location: string;
  githubUrl: string;
  skills: CandidateProfile['skills'];
  projects: Project[];
}

export interface ResumeProfileImport {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  skills: CandidateProfile['skills'];
}

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return /^[23]/.test(value)
      && !value.startsWith('2001:db8:')
      && !value.startsWith('2002:')
      && !value.includes('::ffff:');
  }
  return false;
}

async function validatePublicHttpsUrl(url: URL): Promise<LookupAddress[]> {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Use a public HTTPS page URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private and local URLs cannot be imported.');
  }
  const addressFamily = isIP(hostname);
  const addresses = addressFamily ? [{ address: hostname, family: addressFamily }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicIp(entry.address))) {
    throw new Error('Private and local URLs cannot be imported.');
  }
  return addresses;
}

function requestPublicPage(url: URL, maxBytes: number, addresses: LookupAddress[]): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  const pinnedLookup = (_hostname: string, options: LookupOptions, callback: (error: NodeJS.ErrnoException|null, address: string|LookupAddress[], family?: number) => void) => {
    if (typeof options === 'object' && options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: 'GET',
      headers: { 'user-agent': 'OutreachFlow/1.0 (public page import)', accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity' },
      lookup: pinnedLookup
    }, response => {
      const length = Number(response.headers['content-length'] || 0);
      if (length > maxBytes) {
        response.destroy(new Error('The page is too large to import.'));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', chunk => {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) {
          response.destroy(new Error('The page is too large to import.'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        location: response.headers.location,
        contentType: String(response.headers['content-type'] || ''),
        body: Buffer.concat(chunks, total)
      }));
      response.on('error', reject);
    });
    request.setTimeout(12000, () => request.destroy(new Error('The page took too long to respond.')));
    request.on('error', reject);
    request.end();
  });
}

async function fetchPublicPage(startUrl: string): Promise<{ html: string; url: string }> {
  let current = new URL(startUrl);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const addresses = await validatePublicHttpsUrl(current);
    const response = await requestPublicPage(current, maxPageBytes, addresses);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.location;
      if (!location) throw new Error('The page redirected without a destination.');
      current = new URL(location, current);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`The page returned HTTP ${response.status}. It may require sign-in or block imports.`);
    const contentType = response.contentType;
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('That URL does not return a public HTML page.');
    return { html: response.body.toString('utf8'), url: current.href };
  }
  throw new Error('The page redirected too many times.');
}

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return load(value).text().replace(/\s+/g, ' ').trim();
}

function flattenJson(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record, ...flattenJson(record['@graph'])];
}

function typeMatches(value: unknown, type: string): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some(item => typeof item === 'string' && item.split('/').pop() === type);
}

function structuredLocation(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== 'object') return '';
  const address = (item as Record<string, unknown>).address;
  if (!address || typeof address !== 'object') return '';
  const fields = address as Record<string, unknown>;
  return [fields.addressLocality, fields.addressRegion, fields.addressCountry]
    .filter((part): part is string => typeof part === 'string')
    .join(', ');
}

export function parsePublicPage(html: string, url: string): PublicPageDetails {
  const $ = load(html);
  const structured = $('script[type="application/ld+json"]').toArray().flatMap(script => {
    try { return flattenJson(JSON.parse($(script).text())); } catch { return []; }
  });
  const job = structured.find(item => typeMatches(item['@type'], 'JobPosting'));
  const title = plainText(job?.title) || $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim();
  const companyValue = job?.hiringOrganization;
  const company = companyValue && typeof companyValue === 'object'
    ? plainText((companyValue as Record<string, unknown>).name)
    : $('meta[property="og:site_name"]').attr('content')?.trim() || '';
  const jobDescription = plainText(job?.description);
  const description = jobDescription
    || $('meta[property="og:description"]').attr('content')?.trim()
    || $('meta[name="description"]').attr('content')?.trim()
    || '';
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const experience = visibleText.match(/\b(?:\d{1,2}\+?\s*(?:-|to)\s*\d{1,2}\+?\s*years?|\d{1,2}\+?\s*years?)\b/i)?.[0] || '';
  return {
    title: plainText(title),
    company,
    description: description || visibleText.slice(0, 50000),
    location: structuredLocation(job?.jobLocation) || plainText(job?.jobLocationType),
    experience,
    url
  };
}

export async function importPublicJobUrl(url: string): Promise<PublicPageDetails> {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { throw new Error('Enter a valid job page URL.'); }
  const page = await fetchPublicPage(parsed.href);
  const details = parsePublicPage(page.html, page.url);
  if (!details.description) throw new Error('No job details were readable. Try pasting the description or importing a screenshot.');
  return details;
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'GitHub profile was not found.' : `GitHub returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function importGithubProfile(rawUrl: string): Promise<GithubProfileImport> {
  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { throw new Error('Enter a valid GitHub profile URL.'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') throw new Error('Use a public github.com profile URL.');
  const username = url.pathname.split('/').filter(Boolean)[0];
  if (!username || !/^[a-zA-Z0-9-]{1,39}$/.test(username)) throw new Error('Enter a GitHub username or profile URL.');

  const user = await githubJson<{ name?: string|null; email?: string|null; location?: string|null; html_url: string }>(`https://api.github.com/users/${encodeURIComponent(username)}`);
  const repositories = await githubJson<Array<{ id: number; name: string; description?: string|null; html_url: string; homepage?: string|null; language?: string|null; topics?: string[]; fork: boolean }>>(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`);
  const projects = repositories.filter(repo => !repo.fork).slice(0, 20).map(repo => {
    const technologies = [...new Set([repo.language, ...(repo.topics || [])].filter((value): value is string => !!value))];
    return { id: `github-${repo.id}`, name: repo.name, description: repo.description || '', technologies, features: '', contribution: '', url: repo.homepage || repo.html_url, relevantSkills: repo.topics || [] };
  });
  const languages = [...new Set(projects.flatMap(project => project.technologies))];
  return {
    fullName: user.name || '',
    email: user.email || '',
    location: user.location || '',
    githubUrl: user.html_url,
    skills: { languages, frameworks: [], databases: [], backend: [], frontend: [], cloudDevops: [], other: [] },
    projects
  };
}

export async function extractResumeProfile(filePath: string): Promise<ResumeProfileImport> {
  const file = await stat(filePath);
  if (!file.isFile() || !filePath.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF resume.');
  if (file.size > maxPdfBytes) throw new Error('Choose a resume smaller than 20 MB.');
  const parser = new PDFParse({ data: await readFile(filePath) });
  let text = '';
  try { text = (await parser.getText({ first: 5 })).text; }
  finally { await parser.destroy(); }
  if (!text.trim()) throw new Error('No selectable text was found in the PDF. Scanned PDFs need OCR before profile import.');
  return parseResumeProfile(text);
}

export function parseResumeProfile(text: string): ResumeProfileImport {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const linkedinUrl = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, '') || '';
  const githubUrl = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9-]+/i)?.[0]?.replace(/[.,;]+$/, '') || '';
  const phone = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b/)?.[0] || '';
  const ignoredName = /resume|curriculum vitae|contact|experience|education|skills|portfolio|linkedin|github/i;
  const fullName = lines.slice(0, 8).find(line => line.length <= 70 && /^[\p{L}][\p{L} .'-]+$/u.test(line) && line.split(/\s+/).length >= 2 && !ignoredName.test(line)) || '';
  const lowered = text.toLowerCase();
  const matches = (items: string[]) => items.filter(item => new RegExp(`(^|[^\\w+#.])${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w+#.]|$)`, 'i').test(lowered));
  const languages = matches(['Java', 'TypeScript', 'JavaScript', 'Python', 'C++', 'Go', 'C#']);
  const frameworks = matches(['Spring Boot', 'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Next.js']);
  const databases = matches(['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'DynamoDB']);
  const cloudDevops = matches(['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Terraform', 'GitHub Actions']);
  const other = matches(['REST APIs', 'Microservices', 'GraphQL', 'Kafka', 'RabbitMQ', 'JUnit', 'Jest', 'Git']);
  return { fullName, email, phone, linkedinUrl, githubUrl, skills: { languages, frameworks, databases, backend: [], frontend: [], cloudDevops, other } };
}