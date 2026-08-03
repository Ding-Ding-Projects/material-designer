// History domains for records that live in SQLite rather than in a file.
//
// Automations and project templates are records a user creates, edits and
// deletes exactly like a document, so "undo the deletion" has to reach them
// too. The table is captured as a JSON array of rows and reconciled back into
// the table inside one transaction.
//
// Two constraints kept this narrow on purpose:
//
//   * Only tables with a stable TEXT primary key belong here. Every row keeps
//     the identity it was captured with, so nothing that binds material to a
//     row's identity (an authenticated-encryption AAD, a foreign key, an
//     external reference) breaks when the row comes back. A table with an
//     autoincrement rowid identity must not be registered: the restored row
//     would get a fresh id, and anything bound to the old one would fail in a
//     way that looks exactly like corruption rather than like a restore.
//   * The restore RECONCILES; it never empties the table first. `routines` has
//     two inbound `ON DELETE CASCADE` references (`routine_runs` and
//     `routine_schedule_claims`, see db.ts) and `PRAGMA foreign_keys` is ON, so
//     a `DELETE FROM routines` would silently take every automation run record
//     and every already-claimed schedule slot with it — history the user cannot
//     undo, because neither table is a history domain, and un-claimed slots
//     that let a schedule re-fire for a window it already ran. So the write
//     deletes only the ids the snapshot does not contain and upserts the rest:
//     a row the restore does not actually change is never deleted, and its
//     dependents are never cascaded away. A row the snapshot genuinely omits
//     does cascade — that is what deleting that row has always meant, and it is
//     the undo the user asked for.

import type { HistoryDomain } from './domains.js';

/** The slice of better-sqlite3 this module needs, so tests can hand in a stub. */
export interface SqliteLike {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
    run: (...params: unknown[]) => unknown;
  };
  transaction: <T extends (...args: never[]) => unknown>(fn: T) => T;
}

export interface SqliteTableDomainOptions {
  id: string;
  label: string;
  noun: string;
  nounPlural: string;
  /** Table name. Validated against a strict identifier pattern before use. */
  table: string;
  /** Column holding the row's human name, used when naming a change. */
  labelColumn?: string;
  /**
   * Primary key column. Must be a stable id, never an autoincrement rowid, and
   * must carry a unique index — the restore reconciles by it and upserts on it.
   * Validated against the same strict identifier pattern as the table name.
   */
  idColumn?: string;
  note?: string;
  sensitive?: boolean;
  getDb: () => SqliteLike | null;
  afterRestore?: () => void | Promise<void>;
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function assertIdentifier(value: string, what: string): string {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`history: unsafe SQLite ${what} "${value}"`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

/**
 * Rows come back from better-sqlite3 as plain objects of SQLite scalars.
 * Buffers are the one non-JSON value that can appear (a BLOB column), so they
 * round-trip through an explicit tagged form rather than through JSON's lossy
 * default array-of-bytes rendering. Ciphertext stored as a BLOB therefore
 * survives capture and restore byte for byte.
 */
interface EncodedBlob {
  __od_blob__: string;
}

function isEncodedBlob(value: unknown): value is EncodedBlob {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { __od_blob__?: unknown }).__od_blob__ === 'string'
  );
}

function encodeCell(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { __od_blob__: value.toString('base64') } satisfies EncodedBlob;
  return value;
}

function decodeCell(value: unknown): unknown {
  if (isEncodedBlob(value)) return Buffer.from(value.__od_blob__, 'base64');
  return value;
}

function encodeRow(row: unknown): Record<string, unknown> | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const encoded: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row as Record<string, unknown>)) {
    encoded[column] = encodeCell(value);
  }
  return encoded;
}

/**
 * A comparable key for one id value. Type-tagged because SQLite keeps `1` and
 * `'1'` distinct, and comparing them as equal would make the reconcile skip a
 * delete or an insert that was genuinely needed.
 */
function identityKey(value: unknown): string {
  if (Buffer.isBuffer(value)) return `b:${value.toString('base64')}`;
  if (typeof value === 'number' || typeof value === 'bigint') return `n:${String(value)}`;
  return `s:${String(value)}`;
}

/** The alias the id column is read back under, so it cannot collide with a real column name. */
const ID_ALIAS = '__od_history_id__';

export function createSqliteTableDomain(options: SqliteTableDomainOptions): HistoryDomain {
  const table = assertIdentifier(options.table, 'table name');
  const quotedTable = quoteIdentifier(table);
  // The id column reaches SQL now that the restore reconciles by identity, so
  // it is validated exactly like the table name rather than only being handed
  // to the label code as `idField`.
  const idColumn = assertIdentifier(options.idColumn ?? 'id', 'id column name');
  const quotedIdColumn = quoteIdentifier(idColumn);

  const read = (): unknown => {
    const db = options.getDb();
    if (!db) return [];
    const rows = db.prepare(`SELECT * FROM ${quotedTable}`).all();
    return rows.flatMap((row) => {
      const encoded = encodeRow(row);
      return encoded ? [encoded] : [];
    });
  };

  const write = (value: unknown): void => {
    const db = options.getDb();
    if (!db) return;
    if (!Array.isArray(value)) {
      throw new Error(`history: snapshot for ${table} is not an array of rows`);
    }
    const rows = (value as unknown[]).flatMap((row) => {
      const encoded = encodeRow(row);
      return encoded ? [encoded] : [];
    });

    // Index the snapshot by identity first. A row with no id is a snapshot the
    // reconcile cannot reason about at all — it could neither be matched to a
    // live row nor upserted — so it fails here, before anything is written,
    // rather than being inserted as a duplicate that no later restore can find.
    const snapshotIds = new Set<string>();
    for (const row of rows) {
      if (!Object.prototype.hasOwnProperty.call(row, idColumn)) {
        throw new Error(`history: a snapshot row for ${table} has no ${idColumn} column`);
      }
      const id = decodeCell(row[idColumn]);
      if (id === null || id === undefined) {
        throw new Error(`history: a snapshot row for ${table} has no ${idColumn} value`);
      }
      snapshotIds.add(identityKey(id));
    }

    const apply = db.transaction(() => {
      // Delete only the rows the snapshot does not contain. Emptying the table
      // first would cascade every dependent row of every UNCHANGED row away
      // (see the header) — a restore must not destroy records it was not asked
      // to touch, least of all records history does not itself carry.
      const liveIds = db
        .prepare(`SELECT ${quotedIdColumn} AS ${quoteIdentifier(ID_ALIAS)} FROM ${quotedTable}`)
        .all();
      // `IS` rather than `=` so a NULL id matches itself instead of matching
      // nothing and leaving the row behind forever.
      const removeOne = db.prepare(`DELETE FROM ${quotedTable} WHERE ${quotedIdColumn} IS ?`);
      for (const live of liveIds) {
        if (typeof live !== 'object' || live === null) continue;
        const id = (live as Record<string, unknown>)[ID_ALIAS];
        if (snapshotIds.has(identityKey(id))) continue;
        removeOne.run(id);
      }

      for (const row of rows) {
        // Columns come from the snapshot itself. A schema that has since gained
        // a column is simply not mentioned — a new row takes the column's
        // default, an existing row keeps whatever it currently holds — and a
        // snapshot naming a column the table no longer has fails loudly here
        // rather than writing a half-restored row.
        const columns = Object.keys(row).map((column) => assertIdentifier(column, 'column name'));
        const placeholders = columns.map(() => '?').join(', ');
        // Upsert, so a row that already exists is updated in place and keeps
        // its dependents rather than being deleted and reinserted.
        const assignments = columns
          .filter((column) => column !== idColumn)
          .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`);
        const resolution = assignments.length > 0
          ? `DO UPDATE SET ${assignments.join(', ')}`
          : 'DO NOTHING';
        const sql = `INSERT INTO ${quotedTable} (${columns.map(quoteIdentifier).join(', ')})`
          + ` VALUES (${placeholders}) ON CONFLICT(${quotedIdColumn}) ${resolution}`;
        db.prepare(sql).run(...columns.map((column) => decodeCell(row[column])));
      }
      return undefined;
    });
    apply();
  };

  const domain: HistoryDomain = {
    id: options.id,
    label: options.label,
    noun: options.noun,
    nounPlural: options.nounPlural,
    sources: [
      {
        kind: 'payload',
        fileName: `${table}.json`,
        read,
        write,
        recordKeys: 'array',
        idField: idColumn,
        ...(options.labelColumn ? { labelField: options.labelColumn } : {}),
      },
    ],
  };
  if (options.note) domain.note = options.note;
  if (options.sensitive) domain.sensitive = options.sensitive;
  if (options.afterRestore) domain.afterRestore = options.afterRestore;
  return domain;
}
