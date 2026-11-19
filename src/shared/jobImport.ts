export interface ScreenshotJobDetails {
  title: string;
  company: string;
  location: string;
}

const roleWords = /\b(engineer|developer|manager|designer|analyst|scientist|architect|specialist|intern|consultant|director|associate|product owner|recruiter|administrator|technician|researcher|writer|coordinator|executive)\b/i;
const genericHeading = /^(linkedin|jobs|job details|about the job|easy apply|apply|save|share)$/i;

export function inferScreenshotFields(text: string, fallbackTitle = ''): ScreenshotJobDetails {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = lines.find(line => line.length < 100 && roleWords.test(line))
    || (genericHeading.test(fallbackTitle.trim()) ? '' : fallbackTitle.trim());
  const titleIndex = lines.findIndex(line => line.toLowerCase() === title.toLowerCase());
  const start = Math.max(0, titleIndex + 1);
  const metadata = lines.slice(start, start + 5).find(line => /[·•]/.test(line));
  const parts = metadata?.split(/[·•]/).map(part => part.trim()).filter(Boolean) || [];
  const company = parts[0] && !genericHeading.test(parts[0]) ? parts[0] : '';
  const location = parts.slice(1).find(part => /,|remote|hybrid|on.?site/i.test(part) && !/ago|applicant|click|promoted/i.test(part)) || '';
  return { title, company, location };
}