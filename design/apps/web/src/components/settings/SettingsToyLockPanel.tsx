import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  getOpenDesignHost,
  OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS,
  OPEN_DESIGN_TOY_LOCK_POLICIES,
  type OpenDesignSettingsToyLockTarget,
  type OpenDesignToyLockMetadata,
  type OpenDesignToyLockPolicy,
} from '@open-design/host';

import { normalizePin, type PinEntrySource } from '../../security/toy-lock-core';
import { useT } from '../../i18n';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch, type RegexSearchController } from '../regex/useRegexSearch';
import { settingsTabDef } from './settingsTabs';
import { buildTotpOtpauthUri, isQrBase32, renderTotpQrSvg } from './totp-qr';
import { withToyLockUiDeadline } from './toy-lock-host-call';
import { ToyLockAuthenticationPopover, type ToyLockPolicyVerificationRequest } from '../ToyLockAuthenticationPopover';
import { Toast } from '../Toast';

export type SettingsToyLockMap = ReadonlyMap<OpenDesignSettingsToyLockTarget, OpenDesignToyLockMetadata>;

export interface SettingsToyLockPanelProps {
  readonly initialTarget?: OpenDesignSettingsToyLockTarget;
  readonly initialSupportOpen?: boolean;
  /** Support-only entry points must not expose an existing lock's mutators. */
  readonly supportOnly?: boolean;
  readonly anchor: HTMLElement;
  readonly locks: SettingsToyLockMap;
  readonly onLocksChanged: (locks: SettingsToyLockMap) => void;
  readonly onClose?: () => void;
  readonly unlockDurations?: ReadonlyMap<OpenDesignSettingsToyLockTarget, 'surface' | '5-minutes' | 'until-close'>;
  readonly onUnlockDurationChanged?: (
    targetId: OpenDesignSettingsToyLockTarget,
    duration: 'surface' | '5-minutes' | 'until-close',
  ) => void;
}

const TOTP_POLICIES = new Set<OpenDesignToyLockPolicy>([
  'password-totp', 'pin-totp', 'password-pin-totp',
]);

function requires(policy: OpenDesignToyLockPolicy, factor: 'pin' | 'password' | 'totp'): boolean {
  return (policy === 'pin' || policy === 'pin-password' || policy === 'pin-totp' || policy === 'password-pin-totp')
    ? factor === 'pin' || (factor === 'password' && (policy === 'pin-password' || policy === 'password-pin-totp')) || (factor === 'totp' && (policy === 'pin-totp' || policy === 'password-pin-totp'))
    : (policy === 'password' || policy === 'password-totp') && (factor === 'password' || (factor === 'totp' && policy === 'password-totp'));
}

function friendlyFailure(code: string | null, t: ReturnType<typeof useT>): string {
  if (!code) return '';
  if (code === 'os-protection-unavailable') return t('settings.toyLock.failureOsProtection');
  if (code === 'stale-revision') return t('settings.toyLock.failureStaleRevision');
  if (code === 'enrollment-mismatch') return t('settings.toyLock.failureEnrollmentMismatch');
  if (code === 'enrollment-expired') return t('settings.toyLock.failureEnrollmentExpired');
  return t('settings.toyLock.failureGeneric');
}

function policyLabel(policy: OpenDesignToyLockPolicy, t: ReturnType<typeof useT>): string {
  const keyByPolicy = {
    pin: 'settings.toyLock.policy.pin',
    password: 'settings.toyLock.policy.password',
    'pin-password': 'settings.toyLock.policy.pinPassword',
    'password-totp': 'settings.toyLock.policy.passwordTotp',
    'pin-totp': 'settings.toyLock.policy.pinTotp',
    'password-pin-totp': 'settings.toyLock.policy.passwordPinTotp',
  } as const;
  return t(keyByPolicy[policy]);
}

type Choice = { value: string; label: string };

/** A searchable popup choice with a per-popup RegexSearchField.  The native
 * select remains in the DOM as a keyboard and form compatibility fallback,
 * while the button and listbox provide the real rich popup route. */
function SearchableChoice({
  id,
  label,
  value,
  options,
  search,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly Choice[];
  search: RegexSearchController;
  onChange: (value: string) => void;
  testId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', left: 12, top: 12 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const filtered = options.filter((option) => search.matches(`${option.label} ${option.value}`));
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const activeOption = filtered[Math.min(activeIndex, Math.max(0, filtered.length - 1))] ?? null;

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || typeof window === 'undefined') return;
      const width = Math.min(360, Math.max(240, window.innerWidth - 24));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const isAbove = below < 260 && above > below;
      setPosition({
        position: 'fixed',
        left,
        width,
        top: isAbove ? undefined : rect.bottom + 6,
        bottom: isAbove ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.max(180, Math.min(360, (isAbove ? above : below) - 6)),
        zIndex: 10020,
      });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node) || popupRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      search.setQuery('');
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) search.setQuery('');
  }, [open, search]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, search.query, value]);

  const hiddenSelectStyle: CSSProperties = {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
  };

  return (
    <div className="field" data-testid={`${testId}-choice`}>
      <label id={`${id}-label`} htmlFor={`${id}-native`} className="field-label">{label}</label>
      <select
        id={`${id}-native`}
        value={value}
        aria-labelledby={`${id}-label`}
        aria-hidden="true"
        tabIndex={-1}
        style={hiddenSelectStyle}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-listbox` : undefined}
        className="field-control"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48, padding: '0 12px', color: 'inherit', background: 'var(--md-sys-color-surface-container-lowest)', border: '1px solid var(--md-sys-color-outline)', borderRadius: 12 }}
        data-testid={testId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span>{selected?.label ?? value}</span><span aria-hidden>⌄</span>
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div ref={popupRef} role="presentation" style={{ ...position, overflow: 'auto', padding: 8, border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, background: 'var(--md-sys-color-surface-container-lowest)', boxShadow: 'var(--md-sys-elevation-3)' }} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); search.setQuery(''); setOpen(false); triggerRef.current?.focus(); return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => filtered.length === 0 ? 0 : (current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
            return;
          }
          if (event.key === 'Enter' && activeOption) {
            event.preventDefault(); onChange(activeOption.value); setOpen(false); triggerRef.current?.focus();
          }
        }}>
          <RegexSearchField
            search={search}
            fieldLabel={label}
            ariaLabel={label}
            ariaControls={`${id}-listbox`}
            ariaActiveDescendant={activeOption ? `${id}-option-${activeOption.value}` : undefined}
            placeholder={label}
            testId={`${testId}-search`}
            autoFocus
          />
          <div id={`${id}-listbox`} role="listbox" aria-label={label} aria-live="polite" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            <p role="status" aria-live="polite">{filtered.length === 0 ? t('settings.searchNoMatches') : t('settings.toyLock.choiceStatus', { count: filtered.length, label: activeOption?.label ?? selected?.label ?? '' })}</p>
            {filtered.map((option, optionIndex) => (
              <button
                key={option.value}
                id={`${id}-option-${option.value}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={optionIndex === activeIndex ? 0 : -1}
                className={optionIndex === activeIndex ? 'is-active' : undefined}
                style={{ minHeight: 44, padding: '8px 10px', textAlign: 'left', border: 0, borderRadius: 8, background: optionIndex === activeIndex ? 'var(--md-sys-color-secondary-container)' : option.value === value ? 'var(--md-sys-color-surface-container-high)' : 'transparent', color: 'inherit' }}
                onFocus={() => setActiveIndex(optionIndex)}
                onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}
              >{option.label}</button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

type SupportTicket = {
  id: string;
  category: string;
  description: string;
  createdAt: string;
  severity: 'dramatic';
  status: 'open' | 'resolved' | 'dismissed';
  response?: string;
};

const SUPPORT_TICKETS_KEY = 'open-design:toy-lock-support-tickets';
const SUPPORT_TICKET_MIGRATION_KEY = 'open-design:toy-lock-support-ticket-migration';
const SUPPORT_CATEGORIES = ['locked-out', 'authenticator', 'other'] as const;
const MAX_TICKET_DESCRIPTION_LENGTH = 2000;
const MAX_SERIALIZED_TICKET_BYTES = 512 * 1024;
const SUPPORT_CATEGORY_SET = new Set<string>(SUPPORT_CATEGORIES);

function readSupportTickets(): { tickets: SupportTicket[]; migrated: number } {
  if (typeof window === 'undefined') return { tickets: [], migrated: 0 };
  try {
    const serialized = window.localStorage.getItem(SUPPORT_TICKETS_KEY) ?? '[]';
    if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_TICKET_BYTES) return { tickets: [], migrated: 0 };
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return { tickets: [], migrated: 0 };
    let migrated = 0;
    const tickets: SupportTicket[] = [];
    for (const ticket of parsed) {
      if (typeof ticket !== 'object' || ticket === null) continue;
      const value = ticket as Record<string, unknown>;
      const valid = typeof value.id === 'string' && /^LOCAL-[A-Z0-9-]+$/.test(value.id)
        && typeof value.category === 'string'
        && SUPPORT_CATEGORY_SET.has(value.category)
        && typeof value.description === 'string' && value.description.length <= MAX_TICKET_DESCRIPTION_LENGTH
        && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
        && (value.response === undefined || (typeof value.response === 'string' && value.response.length <= MAX_TICKET_DESCRIPTION_LENGTH))
        && (value.status === 'open' || value.status === 'resolved' || value.status === 'dismissed');
      if (!valid || (value.severity !== undefined && value.severity !== 'dramatic')) continue;
      if (value.severity === undefined) {
        migrated += 1;
        tickets.push({ ...value, severity: 'dramatic' } as SupportTicket);
      } else {
        tickets.push(value as SupportTicket);
      }
      if (tickets.length >= 200) break;
    }
    return { tickets, migrated };
  } catch {
    return { tickets: [], migrated: 0 };
  }
}

export function SettingsToyLockPanel({ initialTarget, initialSupportOpen = false, supportOnly = false, anchor, locks, onLocksChanged, onClose, unlockDurations, onUnlockDurationChanged }: SettingsToyLockPanelProps) {
  const t = useT();
  const [targetId, setTargetId] = useState<OpenDesignSettingsToyLockTarget>(initialTarget ?? 'general');
  const [policy, setPolicy] = useState<OpenDesignToyLockPolicy>('pin');
  const [pinSource, setPinSource] = useState<PinEntrySource>('keypad');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecretBase32, setTotpSecretBase32] = useState('');
  const [totpSecretRevealed, setTotpSecretRevealed] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingExistingMutation, setPendingExistingMutation] = useState<'replace' | 'remove' | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [targetPopupQuery, setTargetPopupQuery] = useState('');
  const [policyPopupQuery, setPolicyPopupQuery] = useState('');
  const [durationPopupQuery, setDurationPopupQuery] = useState('');
  const [unlockDuration, setUnlockDuration] = useState<'surface' | '5-minutes' | 'until-close'>('surface');
  const [supportOpen, setSupportOpen] = useState(false);
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState<(typeof SUPPORT_CATEGORIES)[number]>('locked-out');
  const [ticketStatus, setTicketStatus] = useState('');
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const [supportQuery, setSupportQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [initialSupportTicketState] = useState(readSupportTickets);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => initialSupportTicketState.tickets);
  const [selectedTicketIds, setSelectedTicketIds] = useState<ReadonlySet<string>>(new Set());
  const [ticketActionReview, setTicketActionReview] = useState<'dismiss' | 'export' | null>(null);
  const supportProgressTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', left: 12, top: 12 });
  const targetSearch = useRegexSearch(targetPopupQuery, setTargetPopupQuery);
  const policySearch = useRegexSearch(policyPopupQuery, setPolicyPopupQuery);
  const durationSearch = useRegexSearch(durationPopupQuery, setDurationPopupQuery);
  const supportSearch = useRegexSearch(supportQuery, setSupportQuery);
  const categorySearch = useRegexSearch(categoryQuery, setCategoryQuery);
  const existing = locks.get(targetId) ?? null;
  const needsTotp = TOTP_POLICIES.has(policy);
  const needsPin = requires(policy, 'pin');
  const needsPassword = requires(policy, 'password');

  const targetOptions = useMemo<Choice[]>(
    () => OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS.map((target) => ({
      value: target,
      label: settingsTabDef(target)?.titleKey ? t(settingsTabDef(target)!.titleKey) : target,
    })),
    [t],
  );
  const policyOptions = useMemo<Choice[]>(
    () => OPEN_DESIGN_TOY_LOCK_POLICIES.map((entry) => ({ value: entry, label: policyLabel(entry, t) })),
    [t],
  );
  const durationOptions = useMemo<Choice[]>(() => [
    { value: 'surface', label: t('settings.toyLock.duration.surface') },
    { value: '5-minutes', label: t('settings.toyLock.duration.fiveMinutes') },
    { value: 'until-close', label: t('settings.toyLock.duration.untilClose') },
  ], [t]);
  const categoryOptions = useMemo<Choice[]>(() => [
    { value: 'locked-out', label: t('settings.toyLock.supportCategoryLockedOut') },
    { value: 'authenticator', label: t('settings.toyLock.supportCategoryAuthenticator') },
    { value: 'other', label: t('settings.toyLock.supportCategoryOther') },
  ], [t]);
  const targetLabel = targetOptions.find((option) => option.value === targetId)?.label ?? targetId;
  const qrSecret = totpSecretBase32.trim();
  const qrUri = needsTotp && isQrBase32(qrSecret) ? buildTotpOtpauthUri(targetId, qrSecret) : null;
  const qrMarkup = useMemo(() => {
    if (!qrUri) return null;
    try { return renderTotpQrSvg(qrUri, `${t('settings.toyLock.qrLabel')} for ${targetLabel}`); }
    catch { return null; }
  }, [qrUri, t, targetLabel]);
  const filteredSupportTickets = supportTickets.filter((ticket) =>
    supportSearch.matches(`${ticket.id} ${ticket.category} ${ticket.description} ${ticket.status}`),
  );
  const visibleSelectedTicketIds = new Set(filteredSupportTickets.filter((ticket) => selectedTicketIds.has(ticket.id)).map((ticket) => ticket.id));

  useEffect(() => {
    if (initialTarget) setTargetId(initialTarget);
    if (initialSupportOpen) setSupportOpen(true);
  }, [initialSupportOpen, initialTarget]);
  useEffect(() => {
    setUnlockDuration(unlockDurations?.get(targetId) ?? 'surface');
  }, [targetId, unlockDurations]);
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({ position: 'fixed', left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 460)), top: Math.max(12, Math.min(rect.top, window.innerHeight - 620)), maxHeight: 'calc(100vh - 24px)', overflow: 'auto', zIndex: 10000 });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor]);

  const refresh = useCallback(async (): Promise<SettingsToyLockMap | null> => {
    const bridge = getOpenDesignHost()?.toyLocks;
    if (!bridge) return null;
    try {
      const result = await withToyLockUiDeadline(() => bridge.list());
      if (!result?.ok) return null;
      const next = new Map(result.locks.map((lock) => [lock.targetId, lock]));
      onLocksChanged(next);
      return next;
    } catch {
      return null;
    }
  }, [onLocksChanged]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serialized = JSON.stringify(supportTickets);
      if (new TextEncoder().encode(serialized).byteLength <= MAX_SERIALIZED_TICKET_BYTES) {
        window.localStorage.setItem(SUPPORT_TICKETS_KEY, serialized);
      }
    } catch { /* local storage can be unavailable */ }
  }, [supportTickets]);
  useEffect(() => {
    if (initialSupportTicketState.migrated === 0 || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SUPPORT_TICKET_MIGRATION_KEY, JSON.stringify({
        version: 1,
        action: 'migrated-legacy-severity',
        count: initialSupportTicketState.migrated,
        recordedAt: new Date().toISOString(),
      }));
    } catch { /* the migrated records remain active in memory */ }
    setTicketStatus(t('settings.toyLock.supportMigration', { count: initialSupportTicketState.migrated }));
  }, [initialSupportTicketState.migrated, t]);
  useEffect(() => () => {
    for (const timer of supportProgressTimersRef.current) window.clearTimeout(timer);
    supportProgressTimersRef.current.clear();
  }, []);

  const clearSensitiveForm = () => {
    setPin(''); setPassword(''); setTotpSecretBase32(''); setTotpCode(''); setEnrollmentId(null); setTotpSecretRevealed(false);
  };

  const begin = async () => {
    const host = getOpenDesignHost()?.toyLocks;
    if (!host) { setNotice(t('settings.toyLock.noticeUnavailable')); return; }
    if (needsPin) {
      const normalized = normalizePin({ source: pinSource, value: pin });
      if (!normalized.ok) { setNotice(t('settings.toyLock.noticeInvalidPin')); return; }
    }
    if (needsPassword && password.trim().length === 0) { setNotice(t('settings.toyLock.noticeRequiredPassword')); return; }
    if (needsTotp && totpSecretBase32.trim().length === 0) { setNotice(t('settings.toyLock.noticeRequiredTotp')); return; }
    setBusy(true); setNotice('');
    try {
      const factors = {
        ...(needsPin ? { pin: normalizePin({ source: pinSource, value: pin }).ok ? normalizePin({ source: pinSource, value: pin }).value : '' } : {}),
        ...(needsPassword ? { password } : {}),
        ...(needsTotp ? { totpSecretBase32: totpSecretBase32.trim() } : {}),
      };
      if (needsTotp) {
        const result = await withToyLockUiDeadline(() => host.beginTotpEnrollment({ expectedRevision: existing?.revision ?? null, factors: factors as never, policy: policy as never, targetId }));
        if (!result.ok) { setNotice(friendlyFailure(result.code, t)); await refresh(); return; }
        setEnrollmentId(result.enrollmentId);
        setNotice(t('settings.toyLock.noticePairingReady'));
        return;
      }
      const result = await withToyLockUiDeadline(() => host.configure({ expectedRevision: existing?.revision ?? null, factors, policy, targetId }));
      if (!result.ok) { setNotice(friendlyFailure(result.code, t)); await refresh(); return; }
      await refresh(); clearSensitiveForm(); setNotice(t('settings.toyLock.noticeSaved'));
    } catch { setNotice(t('settings.toyLock.noticeHostTimeout')); }
    finally { setBusy(false); }
  };

  const confirmEnrollment = async () => {
    const host = getOpenDesignHost()?.toyLocks;
    if (!host || !enrollmentId) return;
    setBusy(true); setNotice('');
    try {
      const result = await withToyLockUiDeadline(() => host.confirmTotpEnrollment({ code: totpCode.trim(), enrollmentId, targetId }));
      if (!result.ok) { setNotice(friendlyFailure(result.code, t)); await refresh(); return; }
      await refresh(); clearSensitiveForm(); setNotice(t('settings.toyLock.noticeSavedAfterPairing'));
    } catch { setNotice(t('settings.toyLock.noticeHostTimeout')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    const host = getOpenDesignHost()?.toyLocks;
    if (!host || !existing) return;
    setBusy(true); setNotice('');
    try {
      const result = await withToyLockUiDeadline(() => host.remove(targetId, existing.revision));
      if (!result.ok) { setNotice(friendlyFailure(result.code, t)); await refresh(); return; }
      await refresh(); clearSensitiveForm(); setNotice(t('settings.toyLock.noticeRemoved'));
    } catch { setNotice(t('settings.toyLock.noticeHostTimeout')); }
    finally { setBusy(false); }
  };
  const verifyExistingPolicy = async (request: ToyLockPolicyVerificationRequest) => {
    const host = getOpenDesignHost()?.toyLocks;
    if (!host || !existing) return null;
    const result = await withToyLockUiDeadline(() => host.verify({ targetId, revision: existing.revision, factors: request.factors }));
    if (!result.ok) { setNotice(friendlyFailure(result.code, t)); await refresh(); return null; }
    return { matched: result.matched, maximumAttempts: result.lock.maximumAttempts, remainingAttempts: result.lock.remainingAttempts };
  };

  const createSupportTicket = () => {
    const description = ticketDescription.trim();
    if (!description || description.length > MAX_TICKET_DESCRIPTION_LENGTH) {
      setTicketStatus(t('settings.toyLock.supportDescription'));
      return;
    }
    let id = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const entropy = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replaceAll('-', '').toUpperCase()
        : Math.random().toString(36).slice(2).toUpperCase();
      const candidate = `LOCAL-${Date.now().toString(36).toUpperCase()}-${entropy}`;
      if (!supportTickets.some((ticket) => ticket.id === candidate)) { id = candidate; break; }
    }
    if (!id) {
      setTicketStatus(t('settings.toyLock.supportCollisionExhausted'));
      return;
    }
    const ticket: SupportTicket = {
      id,
      category: ticketCategory,
      description,
      createdAt: new Date().toISOString(),
      severity: 'dramatic',
      status: 'open',
    };
    setSupportTickets((current) => [ticket, ...current].slice(0, 200));
    setSelectedTicketIds(new Set([ticket.id]));
    setTicketDescription('');
    setTicketStatus(t('settings.toyLock.supportStatus', { id: ticket.id, status: ticket.status }));
    const timer = window.setTimeout(() => {
      supportProgressTimersRef.current.delete(timer);
      setSupportTickets((current) => current.map((entry) => entry.id === ticket.id
        ? { ...entry, status: 'resolved', response: t('settings.toyLock.supportFirstResponse') }
        : entry));
    }, 250);
    supportProgressTimersRef.current.add(timer);
  };

  const openRecoveryFolder = async () => {
    try {
      const result = await withToyLockUiDeadline(() => getOpenDesignHost()?.toyLocks?.openRecoveryFolder() ?? Promise.resolve({ ok: false as const, reason: 'host unavailable' }));
      if (result?.ok && typeof result.path === 'string' && result.path.trim().length > 0) {
        setRecoveryPath(result.path);
        setTicketStatus(t('settings.toyLock.supportFolderOpened'));
      } else {
        setTicketStatus(t('settings.toyLock.supportFolderFailed'));
      }
    } catch {
      setTicketStatus(t('settings.toyLock.supportFolderFailed'));
    }
  };

  const copyRecoveryPath = async () => {
    if (!recoveryPath) {
      setTicketStatus(t('settings.toyLock.supportFolderFailed'));
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setTicketStatus(t('settings.toyLock.supportPathCopyUnavailable'));
      setFeedbackToast(t('settings.toyLock.supportPathCopyUnavailable'));
      return;
    }
    try {
      await withToyLockUiDeadline(() => navigator.clipboard.writeText(recoveryPath));
      setTicketStatus(t('settings.toyLock.supportPathCopied'));
    } catch {
      setTicketStatus(t('settings.toyLock.supportPathCopyUnavailable'));
      setFeedbackToast(t('settings.toyLock.supportPathCopyUnavailable'));
    }
  };

  const toggleTicket = (id: string) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllTickets = () => setSelectedTicketIds(new Set(filteredSupportTickets.map((ticket) => ticket.id)));
  const invertTickets = () => setSelectedTicketIds(new Set(filteredSupportTickets.filter((ticket) => !selectedTicketIds.has(ticket.id)).map((ticket) => ticket.id)));
  const dismissTickets = () => {
    setSupportTickets((current) => current.map((ticket) => visibleSelectedTicketIds.has(ticket.id) ? { ...ticket, status: 'dismissed' } : ticket));
    setTicketStatus(t('settings.toyLock.supportDismiss'));
    setTicketActionReview(null);
  };
  const exportTickets = () => {
    if (typeof document === 'undefined' || visibleSelectedTicketIds.size === 0) return;
    const payload = JSON.stringify({ version: 1, note: 'Local support tickets only; no credentials or secrets included.', tickets: filteredSupportTickets.filter((ticket) => visibleSelectedTicketIds.has(ticket.id)) }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'toy-lock-support-tickets.json'; link.click(); URL.revokeObjectURL(url);
    setTicketActionReview(null);
  };

  const keyPad = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'backspace'] as const, []);
  const targetChoiceOptions = targetOptions.filter((option) => targetSearch.matches(`${option.label} ${option.value}`));
  const policyChoiceOptions = policyOptions.filter((option) => policySearch.matches(`${option.label} ${option.value}`));
  const durationChoiceOptions = durationOptions.filter((option) => durationSearch.matches(`${option.label} ${option.value}`));
  const categoryChoiceOptions = categoryOptions.filter((option) => categorySearch.matches(`${option.label} ${option.value}`));
  return (
    <section className="settings-general-block" style={position} role="dialog" aria-modal="false" aria-labelledby="settings-toy-locks-title" data-testid="settings-toy-lock-panel">
      <div className="settings-general-block-head"><h3 id="settings-toy-locks-title">{t('settings.toyLock.title')}</h3><p className="hint">{t('settings.toyLock.description')}</p></div>
      {!supportOnly ? <>
      <SearchableChoice id="toy-lock-target" label={t('settings.toyLock.targetLabel')} value={targetId} options={targetOptions} search={targetSearch} onChange={(next) => { setTargetId(next as OpenDesignSettingsToyLockTarget); clearSensitiveForm(); setNotice(''); }} testId="toy-lock-target" />
      {targetChoiceOptions.length === 0 ? <p role="status">{t('settings.toyLock.noTargetMatches')}</p> : null}
      <SearchableChoice id="toy-lock-policy" label={t('settings.toyLock.policyLabel')} value={policy} options={policyOptions} search={policySearch} onChange={(next) => { setPolicy(next as OpenDesignToyLockPolicy); clearSensitiveForm(); setNotice(''); }} testId="toy-lock-policy" />
      {policyChoiceOptions.length === 0 ? <p role="status">{t('settings.toyLock.noPolicyMatches')}</p> : null}
      <SearchableChoice id="toy-lock-duration" label={t('settings.toyLock.durationLabel')} value={unlockDuration} options={durationOptions} search={durationSearch} onChange={(next) => { const value = next as typeof unlockDuration; setUnlockDuration(value); onUnlockDurationChanged?.(targetId, value); }} testId="toy-lock-duration" />
      {durationChoiceOptions.length === 0 ? <p role="status">{t('settings.toyLock.noPolicyMatches')}</p> : null}
      {needsPin ? <fieldset className="field"><legend>{t('settings.toyLock.pinEntryLegend')}</legend><div role="group" aria-label={t('settings.toyLock.pinMethodAria')}><button type="button" aria-pressed={pinSource === 'keypad'} onClick={() => { setPinSource('keypad'); setPin(''); }}>{t('settings.toyLock.keypad')}</button><button type="button" aria-pressed={pinSource === 'manual'} onClick={() => { setPinSource('manual'); setPin(''); }}>{t('settings.toyLock.manualPin')}</button></div>
        <input aria-label={t('settings.toyLock.pinAria')} type="password" inputMode="numeric" value={pin} disabled={pinSource === 'keypad' || busy} onChange={(event) => setPin(event.currentTarget.value)} />
        {pinSource === 'keypad' ? <div role="group" aria-label={t('settings.toyLock.keypad')}>{keyPad.map((key) => <button key={key} type="button" disabled={busy} onClick={() => setPin((current) => key === 'clear' ? '' : key === 'backspace' ? current.slice(0, -1) : `${current}${key}`.slice(0, 12))}>{key === 'clear' ? t('settings.toyLock.authClear') : key === 'backspace' ? t('settings.toyLock.authBackspace') : key}</button>)}</div> : null}
      </fieldset> : null}
      {needsPassword ? <label className="field"><span className="field-label">{t('settings.toyLock.password')}</span><input aria-label={t('settings.toyLock.password')} type="password" autoComplete="new-password" value={password} disabled={busy} onChange={(event) => setPassword(event.currentTarget.value)} /></label> : null}
      {needsTotp ? <>
        <label className="field"><span className="field-label">{t('settings.toyLock.totpSecret')}</span><input aria-label={t('settings.toyLock.totpSecretAria')} type={totpSecretRevealed ? 'text' : 'password'} value={totpSecretBase32} disabled={busy || enrollmentId != null} onChange={(event) => { setTotpSecretBase32(event.currentTarget.value.toUpperCase()); setTotpSecretRevealed(false); }} /></label>
        <p className="hint">{t('settings.toyLock.qrParameters')}</p>
        {qrMarkup ? <div data-testid="toy-lock-totp-qr" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <p role="status">{t('settings.toyLock.qrUnavailable')}</p>}
        <button type="button" onClick={() => setTotpSecretRevealed((current) => !current)}>{t(totpSecretRevealed ? 'settings.toyLock.qrHide' : 'settings.toyLock.qrReveal')}</button>
        {totpSecretRevealed ? <p><strong>{t('settings.toyLock.qrManual')}</strong>: <code data-testid="toy-lock-totp-manual-secret">{qrSecret}</code></p> : null}
        {enrollmentId ? <label className="field"><span className="field-label">{t('settings.toyLock.totpCode')}</span><input aria-label={t('settings.toyLock.totpCodeAria')} inputMode="numeric" autoComplete="one-time-code" value={totpCode} disabled={busy} onChange={(event) => setTotpCode(event.currentTarget.value)} /></label> : null}
      </> : null}
      <div className="settings-about-update-actions">{enrollmentId ? <button type="button" onClick={() => void confirmEnrollment()} disabled={busy}>{t('settings.toyLock.confirmPairing')}</button> : <button type="button" onClick={() => existing ? setPendingExistingMutation('replace') : void begin()} disabled={busy}>{existing ? t('settings.toyLock.replace') : t('settings.toyLock.save')}</button>}{existing ? <button type="button" onClick={() => setPendingExistingMutation('remove')} disabled={busy}>{t('settings.toyLock.remove')}</button> : null}{onClose ? <button type="button" onClick={onClose}>{t('settings.toyLock.close')}</button> : null}</div>
      </> : null}
      <p role="status" aria-live="polite">{notice}</p>
      <p className="hint">{t('settings.toyLock.recovery')}</p>
      <button type="button" data-testid="toy-lock-support-tickets" onClick={() => setSupportOpen(true)}>{t('settings.toyLock.supportOpen')}</button>
      {supportOpen ? <section aria-labelledby="toy-lock-support-title" data-testid="toy-lock-support-surface"><h4 id="toy-lock-support-title">{t('settings.toyLock.supportTitle')}</h4><p>{t('settings.toyLock.supportDisclosure')}</p>
        <RegexSearchField search={supportSearch} fieldLabel={t('settings.toyLock.supportSearch')} ariaLabel={t('settings.toyLock.supportSearch')} placeholder={t('settings.toyLock.supportSearch')} testId="toy-lock-support-search" />
        <SearchableChoice id="toy-lock-support-category" label={t('settings.toyLock.supportCategory')} value={ticketCategory} options={categoryOptions} search={categorySearch} onChange={(next) => setTicketCategory(next as (typeof SUPPORT_CATEGORIES)[number])} testId="toy-lock-support-category" />
        {categoryChoiceOptions.length === 0 ? <p role="status">{t('settings.toyLock.supportEmpty')}</p> : null}
        <label className="field"><span className="field-label">{t('settings.toyLock.supportDescription')}</span><textarea value={ticketDescription} maxLength={MAX_TICKET_DESCRIPTION_LENGTH} onChange={(event) => setTicketDescription(event.currentTarget.value)} /></label>
        <button type="button" onClick={createSupportTicket}>{t('settings.toyLock.supportCreate')}</button>
        <div className="settings-about-update-actions"><button type="button" onClick={selectAllTickets}>{t('settings.toyLock.supportSelectAll')}</button><button type="button" onClick={invertTickets}>{t('settings.toyLock.supportInvert')}</button><button type="button" onClick={() => setTicketActionReview('export')} disabled={visibleSelectedTicketIds.size === 0}>{t('settings.toyLock.supportExport')}</button><button type="button" onClick={() => setTicketActionReview('dismiss')} disabled={visibleSelectedTicketIds.size === 0}>{t('settings.toyLock.supportDismiss')}</button></div>
        {ticketActionReview ? <section role="alertdialog" aria-label={ticketActionReview === 'export' ? t('settings.toyLock.supportExport') : t('settings.toyLock.supportDismiss')}><p>{t(ticketActionReview === 'export' ? 'settings.toyLock.supportReviewExport' : 'settings.toyLock.supportReviewDismiss', { count: visibleSelectedTicketIds.size })}</p><button type="button" onClick={ticketActionReview === 'export' ? exportTickets : dismissTickets}>{t('settings.toyLock.supportReviewConfirm')}</button><button type="button" onClick={() => setTicketActionReview(null)}>{t('settings.toyLock.supportReviewCancel')}</button></section> : null}
        {filteredSupportTickets.length === 0 ? <p role="status">{t('settings.toyLock.supportEmpty')}</p> : <ul>{filteredSupportTickets.map((ticket) => <li key={ticket.id}><label><input type="checkbox" checked={selectedTicketIds.has(ticket.id)} onChange={() => toggleTicket(ticket.id)} /> <span>{t('settings.toyLock.supportStatus', { id: ticket.id, status: ticket.status })}</span></label><p>{ticket.description}</p>{ticket.response ? <p role="status">{ticket.response}</p> : null}</li>)}</ul>}
        <p className="hint">{t('settings.toyLock.supportResolution')}</p>
        <button type="button" data-testid="toy-lock-support-open-folder" onClick={() => void openRecoveryFolder()}>{t('settings.toyLock.supportOpenFolder')}</button>
        {recoveryPath ? <p><strong>{t('settings.toyLock.supportRecoveryPath', { path: recoveryPath })}</strong> <button type="button" onClick={() => void copyRecoveryPath()}>{t('settings.toyLock.supportCopyPath')}</button></p> : null}
        {ticketStatus ? <p role="status" aria-live="polite">{ticketStatus}</p> : null}
        <button type="button" onClick={() => setSupportOpen(false)}>{t('settings.toyLock.supportClose')}</button>
      </section> : null}
      {pendingExistingMutation && existing ? <ToyLockAuthenticationPopover targetId={targetId} targetLabel={targetId} policy={existing.policy} anchor={anchor} attemptMaximum={existing.maximumAttempts} attemptRemaining={existing.remainingAttempts} verifyFactor={() => false} verifyPolicy={verifyExistingPolicy} onAuthenticated={() => { const action = pendingExistingMutation; setPendingExistingMutation(null); if (action === 'replace') void begin(); else void remove(); }} onCancel={() => setPendingExistingMutation(null)} onSupportTickets={() => { setPendingExistingMutation(null); setSupportOpen(true); }} /> : null}
      {feedbackToast ? createPortal(<Toast message={feedbackToast} tone="error" role="alert" onDismiss={() => setFeedbackToast(null)} />, document.body) : null}
    </section>
  );
}
