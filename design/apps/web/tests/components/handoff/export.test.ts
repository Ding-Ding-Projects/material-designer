// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { downloadTextDeferred } from '../../../src/components/handoff/export';

describe('handoff download helper', () => {
  it('defers URL revocation until after the anchor click task', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:handoff');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const resultPromise = downloadTextDeferred('hello', 'handoff.txt', 'text/plain');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:handoff');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});
