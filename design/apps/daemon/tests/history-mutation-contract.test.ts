import { describe, expect, it } from 'vitest';

import { parseHistoryMutationRequest } from '../src/routes/history';

describe('appearance history mutation request contract', () => {
  it('accepts only bounded redacted metadata', () => {
    expect(parseHistoryMutationRequest({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-1',
    })).toEqual({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-1',
    });
  });

  it('refuses extra fields, paths, control characters, and unbounded values', () => {
    expect(parseHistoryMutationRequest({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-2',
      styleSnapshot: { color: '#fff' },
    })).toBeNull();
    expect(parseHistoryMutationRequest({
      domainId: 'appearance',
      targetId: '../private',
      action: 'updated',
      revisionId: 'client-revision-3',
    })).toBeNull();
    expect(parseHistoryMutationRequest({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated\nsecret',
      revisionId: 'client-revision-4',
    })).toBeNull();
    expect(parseHistoryMutationRequest({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'x'.repeat(129),
    })).toBeNull();
  });
});
