export const SUPPORT_TICKETS_STORAGE_KEY = 'open-design:toy-lock-support-tickets';
export const SUPPORT_TICKET_MIGRATION_KEY = 'open-design:toy-lock-support-ticket-migration';
export const SUPPORT_TICKET_MAX_COUNT = 200;
export const SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH = 2_000;
export const SUPPORT_TICKET_MAX_SERIALIZED_BYTES = 512 * 1024;

export const SUPPORT_TICKET_CATEGORIES = Object.freeze([
  'locked-out',
  'authenticator',
  'other',
] as const);
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_STATUSES = Object.freeze([
  'open',
  'resolved',
  'dismissed',
] as const);
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export interface SupportTicket {
  readonly id: string;
  readonly category: SupportTicketCategory;
  readonly description: string;
  readonly createdAt: string;
  readonly severity: 'dramatic';
  readonly status: SupportTicketStatus;
  readonly response?: string;
}

export interface SupportTicketStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SupportTicketReadResult = {
  readonly tickets: readonly SupportTicket[];
  readonly migrated: number;
};

export type SupportTicketCreateResult =
  | { readonly ok: true; readonly ticket: SupportTicket }
  | { readonly ok: false; readonly reason: 'empty-description' | 'description-too-long' | 'invalid-category' | 'id-collision' };

const categorySet = new Set<string>(SUPPORT_TICKET_CATEGORIES);
const statusSet = new Set<string>(SUPPORT_TICKET_STATUSES);

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTicket(value: unknown): value is SupportTicket {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !/^LOCAL-[A-Z0-9-]+$/.test(value.id)) return false;
  if (typeof value.category !== 'string' || !categorySet.has(value.category)) return false;
  if (typeof value.description !== 'string' || value.description.trim().length === 0
    || value.description.length > SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH) return false;
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (value.severity !== undefined && value.severity !== 'dramatic') return false;
  if (typeof value.status !== 'string' || !statusSet.has(value.status)) return false;
  return value.response === undefined
    || (typeof value.response === 'string' && value.response.length <= SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH);
}

function toTicket(value: unknown): { ticket: SupportTicket; migrated: boolean } | null {
  if (!isValidTicket(value)) return null;
  const record = value as unknown as Record<string, unknown>;
  if (record.severity === undefined) {
    return { migrated: true, ticket: { ...value, severity: 'dramatic' } };
  }
  return { migrated: false, ticket: value };
}

export function readSupportTickets(storage?: SupportTicketStorage | null): SupportTicketReadResult {
  if (!storage) return { tickets: [], migrated: 0 };
  let serialized: string;
  try {
    serialized = storage.getItem(SUPPORT_TICKETS_STORAGE_KEY) ?? '[]';
  } catch {
    return { tickets: [], migrated: 0 };
  }
  if (byteLength(serialized) > SUPPORT_TICKET_MAX_SERIALIZED_BYTES) return { tickets: [], migrated: 0 };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return { tickets: [], migrated: 0 };
    const tickets: SupportTicket[] = [];
    let migrated = 0;
    for (const entry of parsed) {
      const result = toTicket(entry);
      if (!result) continue;
      tickets.push(result.ticket);
      if (result.migrated) migrated += 1;
      if (tickets.length >= SUPPORT_TICKET_MAX_COUNT) break;
    }
    return { tickets, migrated };
  } catch {
    return { tickets: [], migrated: 0 };
  }
}

export function persistSupportTickets(
  tickets: readonly SupportTicket[],
  storage?: SupportTicketStorage | null,
): boolean {
  if (!storage) return false;
  const bounded = tickets.slice(0, SUPPORT_TICKET_MAX_COUNT);
  const serialized = JSON.stringify(bounded);
  if (byteLength(serialized) > SUPPORT_TICKET_MAX_SERIALIZED_BYTES) return false;
  try {
    storage.setItem(SUPPORT_TICKETS_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function defaultId(now: Date): string {
  const runtimeCrypto = (globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } }).crypto;
  const entropy = typeof runtimeCrypto?.randomUUID === 'function'
    ? runtimeCrypto.randomUUID().replaceAll('-', '').toUpperCase()
    : Math.random().toString(36).slice(2).toUpperCase();
  return `LOCAL-${now.getTime().toString(36).toUpperCase()}-${entropy}`;
}

export function createSupportTicket(
  input: {
    readonly category: SupportTicketCategory;
    readonly description: string;
  },
  existing: readonly SupportTicket[] = [],
  options: { readonly now?: Date; readonly makeId?: (now: Date) => string } = {},
): SupportTicketCreateResult {
  if (!categorySet.has(input.category)) return { ok: false, reason: 'invalid-category' };
  const description = input.description.trim();
  if (description.length === 0) return { ok: false, reason: 'empty-description' };
  if (description.length > SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH) return { ok: false, reason: 'description-too-long' };
  const now = options.now ?? new Date();
  const makeId = options.makeId ?? defaultId;
  const id = makeId(now);
  if (!/^LOCAL-[A-Z0-9-]+$/.test(id) || existing.some((ticket) => ticket.id === id)) {
    return { ok: false, reason: 'id-collision' };
  }
  return {
    ok: true,
    ticket: {
      id,
      category: input.category,
      description,
      createdAt: now.toISOString(),
      severity: 'dramatic',
      status: 'open',
    },
  };
}

export function advanceSupportTicket(
  tickets: readonly SupportTicket[],
  id: string,
  response: string,
): readonly SupportTicket[] {
  return tickets.map((ticket) => ticket.id === id
    ? { ...ticket, status: 'resolved', response: response.slice(0, SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH) }
    : ticket);
}

export function dismissSupportTickets(
  tickets: readonly SupportTicket[],
  ids: ReadonlySet<string>,
): readonly SupportTicket[] {
  return tickets.map((ticket) => ids.has(ticket.id) ? { ...ticket, status: 'dismissed' } : ticket);
}

export function filterSupportTickets(
  tickets: readonly SupportTicket[],
  query: string,
  matcher?: (text: string) => boolean,
): readonly SupportTicket[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle && !matcher) return tickets;
  return tickets.filter((ticket) => {
    const text = `${ticket.id} ${ticket.category} ${ticket.description} ${ticket.status} ${ticket.response ?? ''}`;
    return matcher ? matcher(text) : text.toLocaleLowerCase().includes(needle);
  });
}

export function exportSupportTickets(tickets: readonly SupportTicket[]): string {
  return JSON.stringify({
    version: 1,
    note: 'Local support tickets only. No network request is made, and credentials or secrets are not included.',
    tickets,
  }, null, 2);
}
