import { describe, expect, it } from 'vitest';
import { applyTemplate } from './template';

describe('applyTemplate', () => {
  it('replaces known placeholders and removes missing values', () => {
    expect(applyTemplate('Hello {{HR_NAME}} at {{COMPANY_NAME}} {{UNKNOWN}}', { HR_NAME: 'Sam', COMPANY_NAME: 'Acme' }))
      .toBe('Hello Sam at Acme ');
  });
});