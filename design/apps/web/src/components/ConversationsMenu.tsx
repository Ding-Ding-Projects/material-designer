import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tv, useT } from '../i18n';
import { conversationMetaLabel } from './ChatPane';
import { DestructiveGate } from './destructive/DestructiveGate';
import type { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

// Pill + dropdown that lives in the project topbar. Click the pill to
// reveal the list of conversations for this project, with a "New" action
// at the top. Recency-ordered (server-side).
export function ConversationsMenu({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Deleting a conversation takes every message in it and nothing in the
  // product puts them back, so the "×" on the row now opens the
  // super-confirmation gate instead of a browser dialog one stray Enter
  // answered. The target lives up here, not in the dropdown, so the gate
  // survives anything that happens to the portal below it.
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      // While the gate is up, every click belongs to it. Closing the dropdown
      // underneath would unmount the "×" the gate has to hand focus back to,
      // and would make the first key-turn read as "dismiss this menu".
      if (deleteTarget) return;
      const target = e.target as Node;
      if (pillRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // The gate binds Escape in the capture phase and stops the event there,
      // so this bubble-phase listener never sees the key that dismisses it —
      // one Escape closes the gate, a second closes the menu.
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, deleteTarget]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className={`conv-pill ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t('conv.switch')}
      >
        <span className="conv-pill-icon" aria-hidden>
          💬
        </span>
        <span className="conv-pill-label">
          {active ? active.title || t('conv.label') : t('conv.heading')}
        </span>
        <span className="conv-pill-count">{conversations.length}</span>
      </button>
      {open
        ? createPortal(
            <ConversationsDropdown
              menuRef={menuRef}
              anchor={pillRef.current}
              conversations={conversations}
              activeId={activeId}
              onClose={() => setOpen(false)}
              onSelect={(id) => {
                setOpen(false);
                onSelect(id);
              }}
              onCreate={() => {
                setOpen(false);
                onCreate();
              }}
              onRequestDelete={setDeleteTarget}
              onRename={onRename}
            />,
            document.body,
          )
        : null}
      {deleteTarget ? (
        <DestructiveGate
          action={t('conv.delete')}
          // The conversation's own title, not a description of one — this is
          // the string the user has to be able to check the slider against.
          target={deleteTarget.title || t('conv.untitled')}
          items={[
            t('conv.deleteGateItem', {
              // Copy travels as a key so each language of the gate line gets
              // its own reading of it; a real title is the user's own text.
              title: deleteTarget.title || tv('conv.untitled'),
            }),
          ]}
          irreversible
          onConfirm={() => onDelete(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );
}

function ConversationsDropdown({
  menuRef,
  anchor,
  conversations,
  activeId,
  onClose: _onClose,
  onSelect,
  onCreate,
  onRequestDelete,
  onRename,
}: {
  menuRef: React.MutableRefObject<HTMLDivElement | null>;
  anchor: HTMLElement | null;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** Ask the menu to open the destructive gate; it owns the actual delete. */
  onRequestDelete: (conversation: Conversation) => void;
  onRename: (id: string, title: string) => void;
}) {
  const t = useT();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useLayoutEffect(() => {
    if (!anchor) return;
    function update() {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  if (!pos) return null;

  return (
    <div
      ref={menuRef}
      className="conv-menu"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="conv-menu-header">
        <span>{t('conv.heading')}</span>
        <button className="ghost conv-add-btn" onClick={onCreate}>
          {t('conv.new')}
        </button>
      </div>
      {conversations.length === 0 ? (
        <div className="conv-menu-empty">{t('conv.empty')}</div>
      ) : (
        <ul className="conv-list">
          {conversations.map((c) => (
            <li
              key={c.id}
              className={`conv-item ${c.id === activeId ? 'active' : ''}`}
            >
              {editing === c.id ? (
                <input
                  autoFocus
                  className="conv-rename-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    onRename(c.id, draft);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRename(c.id, draft);
                      setEditing(null);
                    } else if (e.key === 'Escape') {
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="conv-item-button"
                  onClick={() => onSelect(c.id)}
                  onDoubleClick={() => {
                    setEditing(c.id);
                    setDraft(c.title ?? '');
                  }}
                  title={t('conv.renameTooltip')}
                >
                  <span className="conv-item-name">
                    {c.title || t('conv.untitled')}
                  </span>
                  <span className="conv-item-meta">{conversationMetaLabel(c, t)}</span>
                </button>
              )}
              <button
                className="conv-item-del"
                title={t('conv.delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(c);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
