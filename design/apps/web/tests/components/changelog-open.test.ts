import { describe, expect, it } from 'vitest';

import { isChangelogOpenForMount } from '../../src/components/changelog/open-changelog';
import { isStatusHubOpenForMount } from '../../src/components/status/open-status-hub';

describe('changelog mount events', () => {
  it('consumes an event only at its exact named mount', () => {
    expect(isChangelogOpenForMount({ mountId: 'C0' }, 'C0')).toBe(true);
    expect(isChangelogOpenForMount({ mountId: 'C0' }, 'C12')).toBe(false);
    expect(isChangelogOpenForMount(undefined, 'C0')).toBe(false);
    expect(isStatusHubOpenForMount({ mountId: 'C7' }, 'C7')).toBe(true);
    expect(isStatusHubOpenForMount({ mountId: 'C7' }, 'C2')).toBe(false);
    expect(isStatusHubOpenForMount(undefined, 'C7')).toBe(false);
  });
});
