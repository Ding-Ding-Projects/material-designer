import { describe, expect, it } from 'vitest';

import {
  advanceSupportTicket,
  createSupportTicket,
  dismissSupportTickets,
  exportSupportTickets,
  filterSupportTickets,
  persistSupportTickets,
  readSupportTickets,
  SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH,
  SUPPORT_TICKETS_STORAGE_KEY,
  type SupportTicket,
  type SupportTicketStorage,
} from '../../src/security/toy-lock-support-tickets';

function storage(): SupportTicketStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

const baseTicket: SupportTicket = {
  id: 'LOCAL-ONE', category: 'locked-out', description: 'The lock is stuck.', createdAt: '2026-08-29T00:00:00.000Z', severity: 'dramatic', status: 'open',
};

describe('toy-lock Support Tickets local store', () => {
  it('creates bounded local tickets with no network-facing fields', () => {
    const result = createSupportTicket({ category: 'locked-out', description: '  Please help.  ' }, [], { now: new Date('2026-08-29T00:00:00.000Z'), makeId: () => 'LOCAL-TEST' });
    expect(result).toEqual({ ok: true, ticket: { id: 'LOCAL-TEST', category: 'locked-out', description: 'Please help.', createdAt: '2026-08-29T00:00:00.000Z', severity: 'dramatic', status: 'open' } });
    if (result.ok) expect(Object.keys(result.ticket)).not.toContain('credential');
  });

  it.each([
    ['', 'empty-description'],
    ['x'.repeat(SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH + 1), 'description-too-long'],
  ] as const)('rejects invalid description as %s', (description, reason) => {
    expect(createSupportTicket({ category: 'other', description }, [], { makeId: () => 'LOCAL-X' })).toEqual({ ok: false, reason });
  });

  it('round-trips bounded records, migrates legacy severity, and skips malformed values', () => {
    const target = storage();
    target.values.set(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify([{ ...baseTicket, severity: undefined }, { id: 'bad', status: 'open' }, baseTicket]));
    const result = readSupportTickets(target);
    expect(result.migrated).toBe(1);
    expect(result.tickets).toHaveLength(2);
    expect(result.tickets[0]).toMatchObject({ severity: 'dramatic' });
    expect(persistSupportTickets(result.tickets, target)).toBe(true);
    expect(JSON.parse(target.values.get(SUPPORT_TICKETS_STORAGE_KEY)!)).toHaveLength(2);
  });

  it('rejects nested or unknown fields and reconstructs only the declared schema', () => {
    const target = storage();
    target.values.set(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify([{ ...baseTicket, extra: { nested: true } }, { ...baseTicket, response: 'done', metadata: 'nope' }]));
    expect(readSupportTickets(target).tickets).toEqual([]);
    expect(persistSupportTickets([{ ...baseTicket, extra: { nested: true } } as never], target)).toBe(false);
  });

  it('advances, filters, dismisses, and exports only selected local records', () => {
    const resolved = advanceSupportTicket([baseTicket], baseTicket.id, 'Read once.');
    expect(resolved[0]).toMatchObject({ status: 'resolved', response: 'Read once.' });
    const dismissed = dismissSupportTickets(resolved, new Set([baseTicket.id]));
    expect(dismissed[0]?.status).toBe('dismissed');
    expect(filterSupportTickets([baseTicket], 'stuck')).toHaveLength(1);
    const payload = exportSupportTickets(dismissed);
    expect(payload).toContain('Local support tickets only');
    expect(payload).toContain('Descriptions are included');
    expect(payload).not.toContain('password');
  });
});
