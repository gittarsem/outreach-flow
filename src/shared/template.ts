export function applyTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => data[key] ?? '');
}