// The four tab-discovery searches, in one panel, each with its own builder.
//
// The requirement is four *separate* searches: the current strip, the inside of
// every individual group, groups by their visible name, and a master search
// across every open tab in every window. The temptation is one field and a
// scope selector, which is a different feature — a scope selector is one query
// that means different things, and the moment a user narrows to a group they
// lose the strip query they had typed.
//
// So each search owns a `useRegexSearch` controller, and each controller is
// created by the component that renders its field. That is not a style choice:
// `RegexSearchField` opens the builder for the controller it is handed, so one
// shared controller would give four fields one builder, and a pattern built
// under "groups by name" would silently start filtering the master list. The
// per-group search is a child component precisely so its `useRegexSearch` call
// is per group instance rather than a hook inside a loop.
//
// Everything here is presentational plus its own query state. Group and tab
// mutations are props, because the state they mutate lives in the tab bar.

import { useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { RegexSearchField, useRegexSearch } from '../regex';
import styles from './WorkspaceTabDiscovery.module.css';
import {
  TAB_GROUP_COLORS,
  tabGroupDisplayName,
  type TabGroupColor,
  type WorkspaceTabGroup,
} from './tabGroups';
import {
  WORKSPACE_TAB_ACTIVATION_TTL_MS,
  flattenWorkspaceTabWindowSnapshots,
  createWorkspaceTabWindowId,
  readWorkspaceTabWindowSnapshots,
  isWorkspaceTabWindowKey,
  publishWorkspaceTabActivationRequest,
  removeWorkspaceTabActivationRequest,
  type MasterTabResult,
} from './windowRegistry';

export interface DiscoveryTab {
  id: string;
  title: string;
  meta: string;
  pinned: boolean;
  permanent: boolean;
  active: boolean;
  groupId: string | null;
}

export interface WorkspaceTabDiscoveryProps {
  tabs: readonly DiscoveryTab[];
  groups: readonly WorkspaceTabGroup[];
  windowId: string;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  /** Show a tab that sits inside a collapsed group, WITHOUT expanding it. */
  onReveal: (tabId: string) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupColor: (groupId: string, color: TabGroupColor) => void;
  onToggleCollapsed: (groupId: string) => void;
  onMoveGroup: (groupId: string, offset: number) => void;
  onRemoveGroup: (groupId: string) => void;
  onAssignTab: (tabId: string, groupId: string | null) => void;
  onEditGroupAppearance: (groupId: string, anchor: DOMRect) => void;
}

/** `as const` so the values keep their literal types and stay valid `t()` keys
 *  — a plain `Record<TabGroupColor, string>` would widen them to `string` and
 *  lose the compile-time check that every one of these keys is declared. */
const COLOR_LABEL_KEYS = {
  sky: 'workspaceTabs.groupColorSky',
  grape: 'workspaceTabs.groupColorGrape',
  citrus: 'workspaceTabs.groupColorCitrus',
  moss: 'workspaceTabs.groupColorMoss',
  clay: 'workspaceTabs.groupColorClay',
  slate: 'workspaceTabs.groupColorSlate',
} as const;

export function WorkspaceTabDiscovery(props: WorkspaceTabDiscoveryProps) {
  const t = useT();
  const {
    tabs,
    groups,
    windowId,
    onActivate,
    onClose,
    onTogglePin,
    onReveal,
    onCreateGroup,
    onRenameGroup,
    onSetGroupColor,
    onToggleCollapsed,
    onMoveGroup,
    onRemoveGroup,
    onAssignTab,
    onEditGroupAppearance,
  } = props;

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group] as const)),
    [groups],
  );

  const describe = (tab: DiscoveryTab): string => {
    const group = tab.groupId ? groupById.get(tab.groupId) : undefined;
    const parts = [tab.meta];
    parts.push(
      group
        ? tabGroupDisplayName(group, t('workspaceTabs.groupUntitled'))
        : t('workspaceTabs.resultUngrouped'),
    );
    if (tab.pinned) parts.push(t('workspaceTabs.resultPinned'));
    if (group?.collapsed) parts.push(t('workspaceTabs.resultCollapsedGroup'));
    return parts.join(' · ');
  };

  return (
    <div className={styles.discovery}>
      <StripSearch
        tabs={tabs}
        describe={describe}
        collapsedFor={(tab) => Boolean(tab.groupId && groupById.get(tab.groupId)?.collapsed)}
        onActivate={onActivate}
        onClose={onClose}
        onTogglePin={onTogglePin}
        onReveal={onReveal}
      />

      <GroupNameSearch
        groups={groups}
        tabs={tabs}
        onCreateGroup={onCreateGroup}
        onRenameGroup={onRenameGroup}
        onSetGroupColor={onSetGroupColor}
        onToggleCollapsed={onToggleCollapsed}
        onMoveGroup={onMoveGroup}
        onRemoveGroup={onRemoveGroup}
        onAssignTab={onAssignTab}
        onActivate={onActivate}
        onReveal={onReveal}
        onEditGroupAppearance={onEditGroupAppearance}
      />

      <MasterSearch windowId={windowId} onActivate={onActivate} />
    </div>
  );
}

/* -------- 1. The current tab strip ------------------------------------- */

function StripSearch({
  tabs,
  describe,
  collapsedFor,
  onActivate,
  onClose,
  onTogglePin,
  onReveal,
}: {
  tabs: readonly DiscoveryTab[];
  describe: (tab: DiscoveryTab) => string;
  collapsedFor: (tab: DiscoveryTab) => boolean;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onReveal: (tabId: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const results = useMemo(
    () => tabs.filter((tab) => search.matches(`${tab.title} ${tab.meta}`)),
    [tabs, search],
  );

  return (
    <section className={styles.section} aria-labelledby="workspace-tabs-strip-search-heading">
      <h2 className={styles.heading} id="workspace-tabs-strip-search-heading">
        {t('workspaceTabs.searchStripHeading')}
        <span className={styles.count}>{results.length}</span>
      </h2>
      <RegexSearchField
        search={search}
        fieldLabel={t('workspaceTabs.searchStripField')}
        className={styles.input}
        hostClassName={styles.field}
        placeholder={t('workspaceTabs.searchStripHeading')}
        ariaLabel={t('workspaceTabs.searchStripHeading')}
        testId="workspace-tabs-strip-search"
      />
      {results.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.searchNoTabs')}</p>
      ) : (
        <ul className={styles.list}>
          {results.map((tab) => (
            <li key={tab.id} className={styles.row}>
              <button
                type="button"
                className={styles.rowMain}
                aria-current={tab.active ? 'true' : undefined}
                onClick={() => onActivate(tab.id)}
              >
                <span className={styles.rowTitle}>{tab.title}</span>
                <span className={styles.rowMeta}>{describe(tab)}</span>
              </button>
              {collapsedFor(tab) ? (
                <button
                  type="button"
                  className={styles.rowAction}
                  title={t('workspaceTabs.revealHint')}
                  aria-label={`${t('workspaceTabs.reveal')} — ${tab.title}`}
                  onClick={() => onReveal(tab.id)}
                >
                  <Icon name="eye" size={12} aria-hidden />
                </button>
              ) : null}
              {tab.permanent ? null : (
                <>
                  <button
                    type="button"
                    className={styles.rowAction}
                    aria-pressed={tab.pinned}
                    aria-label={tab.pinned ? t('workspaceTabs.unpin') : t('workspaceTabs.pin')}
                    onClick={() => onTogglePin(tab.id)}
                  >
                    <Icon name="star" size={12} aria-hidden />
                  </button>
                  {tab.pinned ? null : (
                    <button
                      type="button"
                      className={styles.rowAction}
                      aria-label={`${t('common.close')}: ${tab.title}`}
                      onClick={() => onClose(tab.id)}
                    >
                      <Icon name="close" size={11} aria-hidden />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------- 3. Groups by their visible name, and 2. inside each group ----- */

function GroupNameSearch({
  groups,
  tabs,
  onCreateGroup,
  onRenameGroup,
  onSetGroupColor,
  onToggleCollapsed,
  onMoveGroup,
  onRemoveGroup,
  onAssignTab,
  onActivate,
  onReveal,
  onEditGroupAppearance,
}: {
  groups: readonly WorkspaceTabGroup[];
  tabs: readonly DiscoveryTab[];
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupColor: (groupId: string, color: TabGroupColor) => void;
  onToggleCollapsed: (groupId: string) => void;
  onMoveGroup: (groupId: string, offset: number) => void;
  onRemoveGroup: (groupId: string) => void;
  onAssignTab: (tabId: string, groupId: string | null) => void;
  onActivate: (tabId: string) => void;
  onReveal: (tabId: string) => void;
  onEditGroupAppearance: (groupId: string, anchor: DOMRect) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);

  const untitled = t('workspaceTabs.groupUntitled');
  const results = useMemo(
    () => groups.filter((group) => search.matches(tabGroupDisplayName(group, untitled))),
    [groups, search, untitled],
  );

  return (
    <section className={styles.section} aria-labelledby="workspace-tabs-group-search-heading">
      <h2 className={styles.heading} id="workspace-tabs-group-search-heading">
        {t('workspaceTabs.searchGroupsHeading')}
        <span className={styles.count}>{results.length}</span>
      </h2>
      <RegexSearchField
        search={search}
        fieldLabel={t('workspaceTabs.searchGroupsField')}
        className={styles.input}
        hostClassName={styles.field}
        placeholder={t('workspaceTabs.searchGroupsHeading')}
        ariaLabel={t('workspaceTabs.searchGroupsHeading')}
        testId="workspace-tabs-group-search"
      />
      <button type="button" className={styles.newGroup} onClick={onCreateGroup}>
        <Icon name="plus" size={12} aria-hidden />
        <span>{t('workspaceTabs.groupNew')}</span>
      </button>
      {groups.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.groupNoneYet')}</p>
      ) : results.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.searchNoGroups')}</p>
      ) : (
        <ul className={styles.groupList}>
          {results.map((group, index) => (
            <li key={group.id}>
              <GroupCard
                group={group}
                first={index === 0}
                last={index === results.length - 1}
                tabs={tabs.filter((tab) => tab.groupId === group.id)}
                otherTabs={tabs.filter((tab) => !tab.permanent && tab.groupId !== group.id)}
                onRenameGroup={onRenameGroup}
                onSetGroupColor={onSetGroupColor}
                onToggleCollapsed={onToggleCollapsed}
                onMoveGroup={onMoveGroup}
                onRemoveGroup={onRemoveGroup}
                onAssignTab={onAssignTab}
                onActivate={onActivate}
                onReveal={onReveal}
                onEditGroupAppearance={onEditGroupAppearance}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One group, with its own tab search — discovery search 2.
 *
 * This is a component rather than an inlined block for one reason: the hook.
 * `useRegexSearch` cannot be called inside `results.map(...)`, so a per-group
 * controller requires a per-group component instance. The consequence is the
 * behaviour the requirement asks for — every group's field owns its own query,
 * mode, flags and builder, and nothing leaks between two groups.
 */
function GroupCard({
  group,
  first,
  last,
  tabs,
  otherTabs,
  onRenameGroup,
  onSetGroupColor,
  onToggleCollapsed,
  onMoveGroup,
  onRemoveGroup,
  onAssignTab,
  onActivate,
  onReveal,
  onEditGroupAppearance,
}: {
  group: WorkspaceTabGroup;
  first: boolean;
  last: boolean;
  tabs: readonly DiscoveryTab[];
  otherTabs: readonly DiscoveryTab[];
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupColor: (groupId: string, color: TabGroupColor) => void;
  onToggleCollapsed: (groupId: string) => void;
  onMoveGroup: (groupId: string, offset: number) => void;
  onRemoveGroup: (groupId: string) => void;
  onAssignTab: (tabId: string, groupId: string | null) => void;
  onActivate: (tabId: string) => void;
  onReveal: (tabId: string) => void;
  onEditGroupAppearance: (groupId: string, anchor: DOMRect) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const name = tabGroupDisplayName(group, t('workspaceTabs.groupUntitled'));
  const results = useMemo(
    () => tabs.filter((tab) => search.matches(`${tab.title} ${tab.meta}`)),
    [tabs, search],
  );

  return (
    <div className={styles.groupCard} data-tab-group-color={group.color}>
      <div className={styles.groupCardHead}>
        <span className={styles.groupSwatch} aria-hidden />
        <input
          className={styles.groupName}
          value={group.name}
          placeholder={t('workspaceTabs.groupUntitled')}
          aria-label={t('workspaceTabs.groupRenameLabel')}
          onChange={(event) => onRenameGroup(group.id, event.target.value)}
        />
        <span className={styles.groupCount}>
          {t('workspaceTabs.groupTabCount', { count: tabs.length })}
        </span>
      </div>

      <div className={styles.groupActions}>
        <button
          type="button"
          className={styles.groupAction}
          aria-expanded={!group.collapsed}
          onClick={() => onToggleCollapsed(group.id)}
        >
          {group.collapsed
            ? t('workspaceTabs.groupExpand')
            : t('workspaceTabs.groupCollapse')}
        </button>
        <button
          type="button"
          className={styles.groupAction}
          disabled={first}
          aria-label={t('workspaceTabs.groupMoveEarlier')}
          onClick={() => onMoveGroup(group.id, -1)}
        >
          <Icon name="chevron-left" size={12} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.groupAction}
          disabled={last}
          aria-label={t('workspaceTabs.groupMoveLater')}
          onClick={() => onMoveGroup(group.id, 1)}
        >
          <Icon name="chevron-right" size={12} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.groupAction}
          onClick={(event) =>
            onEditGroupAppearance(group.id, event.currentTarget.getBoundingClientRect())
          }
        >
          {t('workspaceTabs.groupEditAppearance')}
        </button>
        <button
          type="button"
          className={styles.groupAction}
          onClick={() => onRemoveGroup(group.id)}
        >
          {t('workspaceTabs.groupRemove')}
        </button>
      </div>

      <div
        className={styles.groupColors}
        role="group"
        aria-label={t('workspaceTabs.groupColorLabel')}
      >
        {TAB_GROUP_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={styles.groupColorSwatch}
            data-tab-group-color={color}
            aria-pressed={group.color === color}
            aria-label={t(COLOR_LABEL_KEYS[color])}
            onClick={() => onSetGroupColor(group.id, color)}
          />
        ))}
      </div>

      <RegexSearchField
        search={search}
        fieldLabel={t('workspaceTabs.searchInGroupField', { name })}
        className={styles.input}
        hostClassName={styles.field}
        placeholder={t('workspaceTabs.searchInGroupField', { name })}
        ariaLabel={t('workspaceTabs.searchInGroupField', { name })}
        testId={`workspace-tabs-group-tab-search-${group.id}`}
      />

      {tabs.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.groupEmpty')}</p>
      ) : results.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.searchNoTabs')}</p>
      ) : (
        <ul className={styles.list}>
          {results.map((tab) => (
            <li key={tab.id} className={styles.row}>
              <button
                type="button"
                className={styles.rowMain}
                aria-current={tab.active ? 'true' : undefined}
                onClick={() => onActivate(tab.id)}
              >
                <span className={styles.rowTitle}>{tab.title}</span>
                <span className={styles.rowMeta}>
                  {group.collapsed
                    ? `${name} · ${t('workspaceTabs.resultCollapsedGroup')}`
                    : name}
                </span>
              </button>
              {group.collapsed ? (
                <button
                  type="button"
                  className={styles.rowAction}
                  title={t('workspaceTabs.revealHint')}
                  aria-label={`${t('workspaceTabs.reveal')} — ${tab.title}`}
                  onClick={() => onReveal(tab.id)}
                >
                  <Icon name="eye" size={12} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className={styles.rowAction}
                aria-label={t('workspaceTabs.groupRemoveTab')}
                onClick={() => onAssignTab(tab.id, null)}
              >
                <Icon name="minus" size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {otherTabs.length > 0 ? (
        <GroupAssignmentPicker
          group={group}
          groupName={name}
          tabs={otherTabs}
          onAssignTab={onAssignTab}
        />
      ) : null}
    </div>
  );
}

function GroupAssignmentPicker({
  group,
  groupName,
  tabs,
  onAssignTab,
}: {
  group: WorkspaceTabGroup;
  groupName: string;
  tabs: readonly DiscoveryTab[];
  onAssignTab: (tabId: string, groupId: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusScopeId = `workspace-tabs-group-assignment-${group.id}`;
  const results = useMemo(
    () => tabs.filter((tab) => search.matches(`${tab.title} ${tab.meta}`)),
    [search, tabs],
  );

  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement>('[data-testid^="workspace-tabs-group-assignment-search-"]')
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof Element) {
        const nestedDialog = target.closest('[role="dialog"]');
        if (nestedDialog && nestedDialog !== panelRef.current) return;
      }
      event.preventDefault();
      close();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      if (target instanceof Node && triggerRef.current?.contains(target)) return;
      if (
        target instanceof Element
        && target.closest(`[data-focus-scope="${focusScopeId}"]`)
      ) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [focusScopeId, open]);

  return (
    <div className={styles.assignmentWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.groupAction}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
      >
        {t('workspaceTabs.groupAddTab')}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className={styles.assignmentPicker}
          role="dialog"
          data-workspace-tabs-nested-dialog="group-assignment"
          data-focus-scope={focusScopeId}
          aria-label={`${t('workspaceTabs.groupMoveTabHeading')}: ${groupName}`}
        >
          <RegexSearchField
            search={search}
            fieldLabel={t('workspaceTabs.groupAddTabPlaceholder')}
            className={styles.input}
            hostClassName={styles.field}
            placeholder={t('workspaceTabs.groupAddTabPlaceholder')}
            ariaLabel={t('workspaceTabs.groupAddTabPlaceholder')}
            testId={`workspace-tabs-group-assignment-search-${group.id}`}
            focusScopeId={focusScopeId}
          />
          {results.length === 0 ? (
            <p className={styles.empty} role="status">
              {t('workspaceTabs.searchNoTabs')}
            </p>
          ) : (
            <div className={styles.assignmentList}>
              {results.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={styles.assignmentOption}
                  onClick={() => {
                    onAssignTab(tab.id, group.id);
                    close();
                  }}
                >
                  <span className={styles.rowTitle}>{tab.title}</span>
                  <span className={styles.rowMeta}>{tab.meta}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -------- 4. Every open tab, in every window --------------------------- */

function MasterSearch({
  windowId,
  onActivate,
}: {
  windowId: string;
  onActivate: (tabId: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const [results, setResults] = useState<MasterTabResult[]>([]);
  const [handoff, setHandoff] = useState<{ title: string; location: string } | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  // Read on mount and whenever another window republishes. `storage` fires only
  // in the OTHER windows, which is exactly the direction that matters: this
  // window's own tabs come from its own state, refreshed on every render.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      const snapshots = readWorkspaceTabWindowSnapshots(window.localStorage, Date.now());
      setResults(flattenWorkspaceTabWindowSnapshots(snapshots, windowId));
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && !isWorkspaceTabWindowKey(event.key)) return;
      refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [windowId]);

  const matched = useMemo(
    () => results.filter((result) => search.matches(`${result.title} ${result.meta}`)),
    [results, search],
  );
  const windowCount = useMemo(
    () => new Set(results.map((result) => result.windowId)).size,
    [results],
  );

  const activateResult = (
    result: MasterTabResult,
    trigger: HTMLButtonElement,
  ) => {
    if (result.isCurrentWindow) {
      onActivate(result.id);
      return;
    }
    const requestId = createWorkspaceTabWindowId();
    const key = publishWorkspaceTabActivationRequest(window.localStorage, {
      requestId,
      sourceWindowId: windowId,
      targetWindowId: result.windowId,
      tabId: result.id,
      requestedAt: Date.now(),
    });
    if (!key) return;
    window.setTimeout(() => {
      removeWorkspaceTabActivationRequest(window.localStorage, requestId);
    }, WORKSPACE_TAB_ACTIVATION_TTL_MS);
    returnFocusRef.current = trigger;
    setHandoff({
      title: result.title,
      location: t('workspaceTabs.resultOtherWindow', { index: result.windowIndex }),
    });
  };

  return (
    <section className={styles.section} aria-labelledby="workspace-tabs-master-search-heading">
      <h2 className={styles.heading} id="workspace-tabs-master-search-heading">
        {t('workspaceTabs.searchMasterHeading')}
        <span className={styles.count}>{matched.length}</span>
      </h2>
      <p className={styles.sectionNote}>
        {t('workspaceTabs.masterScope', { tabs: results.length, windows: windowCount })}
      </p>
      <RegexSearchField
        search={search}
        fieldLabel={t('workspaceTabs.searchMasterField')}
        className={styles.input}
        hostClassName={styles.field}
        placeholder={t('workspaceTabs.searchMasterHeading')}
        ariaLabel={t('workspaceTabs.searchMasterHeading')}
        testId="workspace-tabs-master-search"
      />
      {handoff ? (
        <div className={styles.handoffStatus}>
          <span role="status">
            {handoff.title} · {handoff.location} · {t('workspaceTabs.otherWindowHint')}
          </span>
          <button
            type="button"
            className={styles.groupAction}
            onClick={() => {
              window.focus();
              returnFocusRef.current?.focus();
            }}
          >
            {t('workspaceTabs.resultThisWindow')}
          </button>
        </div>
      ) : null}
      {matched.length === 0 ? (
        <p className={styles.empty}>{t('workspaceTabs.searchNoTabs')}</p>
      ) : (
        <ul className={styles.list}>
          {matched.map((result) => {
            const location = result.isCurrentWindow
              ? t('workspaceTabs.resultThisWindow')
              : t('workspaceTabs.resultOtherWindow', { index: result.windowIndex });
            const group = result.groupName ?? t('workspaceTabs.resultUngrouped');
            const flags = [location, t('workspaceTabs.resultStrip'), group];
            if (result.pinned) flags.push(t('workspaceTabs.resultPinned'));
            if (result.groupCollapsed) flags.push(t('workspaceTabs.resultCollapsedGroup'));
            return (
              <li key={`${result.windowId}:${result.id}`} className={styles.row}>
                <button
                  type="button"
                  className={styles.rowMain}
                  aria-current={result.active ? 'true' : undefined}
                  title={result.isCurrentWindow ? undefined : t('workspaceTabs.otherWindowHint')}
                  onClick={(event) => activateResult(result, event.currentTarget)}
                >
                  <span className={styles.rowTitle}>{result.title}</span>
                  <span className={styles.rowMeta}>{flags.join(' · ')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
