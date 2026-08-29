import { describe, expect, test } from 'vitest';

import { validateAuthenticatorExportContent } from '../../../src/components/authenticator/export';

describe('authenticator export boundary', () => {
  test('validates the top-level redacted schema and preserves content bytes', () => {
    const content = JSON.stringify({ version: 1, retention: 'keep-all', secretsOmitted: true, records: [{ id: 'history-1', action: 'created', createdAt: '2026-01-01T00:00:00.000Z', summary: 'Authenticator created', redacted: true }] });
    expect(validateAuthenticatorExportContent(content, 'redacted-history')).toBe(content);
    expect(() => validateAuthenticatorExportContent(JSON.stringify({ content }), 'redacted-history')).toThrow(/top-level|schema/iu);
  });

  test('validates sensitive entries without double-encoding the host wrapper', () => {
    const content = JSON.stringify({ version: 1, warning: 'This export contains usable authenticator secrets in cleartext.', entries: [{ id: 'entry-1', secret: 'fixture-value' }] });
    expect(validateAuthenticatorExportContent(content, 'sensitive-history')).toBe(content);
    expect(() => validateAuthenticatorExportContent(JSON.stringify({ version: 1, warning: 'warning', entries: [] }), 'redacted-history')).toThrow(/schema/iu);
  });
});
