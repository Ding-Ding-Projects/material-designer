export type FileViewerElementAction = 'edit-appearance' | 'lock-element';
export type FileViewerActionInput = 'pointer' | 'keyboard' | 'programmatic';
export type FileViewerReceiptPhase = 'requested' | 'opened' | 'completed' | 'cancelled';

export interface FileViewerElementActionRequest {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly targetRole: string;
  readonly anchor: HTMLElement | null;
  readonly action: FileViewerElementAction;
  readonly input: FileViewerActionInput;
}

export interface FileViewerElementActionReceipt {
  readonly targetId: string;
  readonly action: FileViewerElementAction;
  readonly phase: FileViewerReceiptPhase;
}

export interface FileViewerContextMenuRequest {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly targetRole: string;
  readonly anchor: HTMLElement | null;
  readonly x: number;
  readonly y: number;
  readonly actions: readonly FileViewerElementAction[];
}

export interface FileViewerContextMenuReceipt {
  readonly targetId: string;
  readonly phase: FileViewerReceiptPhase;
}

export type FileViewerDestructiveAction = 'restore-version' | 'unpublish-public-file';

export interface FileViewerDestructiveActionRequest {
  readonly action: FileViewerDestructiveAction;
  readonly targetId: string;
  readonly label: string;
  readonly resourcePath: string;
  readonly payload: unknown;
  readonly execute: () => Promise<boolean | void>;
}

export interface FileViewerDestructiveActionReceipt {
  readonly action: FileViewerDestructiveAction;
  readonly targetId: string;
  readonly phase: FileViewerReceiptPhase;
}

/**
 * C0 supplies the reviewed owner implementation. A missing, throwing, or
 * malformed owner is unavailable, never an implicit authorization.
 */
export interface FileViewerCapabilities {
  readonly requestElementAction: (
    request: FileViewerElementActionRequest,
  ) => FileViewerElementActionReceipt;
  readonly requestContextMenu: (
    request: FileViewerContextMenuRequest,
  ) => FileViewerContextMenuReceipt;
  readonly requestAuthorizedDestructiveAction: (
    request: FileViewerDestructiveActionRequest,
  ) => FileViewerDestructiveActionReceipt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileViewerDestructiveAction(value: unknown): value is FileViewerDestructiveAction {
  return value === 'restore-version' || value === 'unpublish-public-file';
}

export function isFileViewerReceiptPhase(value: unknown): value is FileViewerReceiptPhase {
  return value === 'requested' || value === 'opened' || value === 'completed' || value === 'cancelled';
}

export function isFileViewerCapabilities(value: unknown): value is FileViewerCapabilities {
  if (!isRecord(value)) return false;
  try {
    return typeof value.requestElementAction === 'function'
      && typeof value.requestContextMenu === 'function'
      && typeof value.requestAuthorizedDestructiveAction === 'function';
  } catch {
    return false;
  }
}

/**
 * C0 ownership is an all-or-nothing handshake. A truthy object with one
 * missing handler is not a capability owner and must stay unavailable.
 */
export function normalizeFileViewerCapabilities(value: unknown): FileViewerCapabilities | null {
  return isFileViewerCapabilities(value) ? value : null;
}

function isFileViewerDestructiveActionReceipt(
  value: unknown,
): value is FileViewerDestructiveActionReceipt {
  return isRecord(value)
    && isFileViewerDestructiveAction(value.action)
    && typeof value.targetId === 'string'
    && isFileViewerReceiptPhase(value.phase);
}

function isFileViewerElementActionReceipt(
  value: unknown,
): value is FileViewerElementActionReceipt {
  return isRecord(value)
    && (value.action === 'edit-appearance' || value.action === 'lock-element')
    && typeof value.targetId === 'string'
    && isFileViewerReceiptPhase(value.phase);
}

function isFileViewerContextMenuReceipt(
  value: unknown,
): value is FileViewerContextMenuReceipt {
  return isRecord(value)
    && typeof value.targetId === 'string'
    && isFileViewerReceiptPhase(value.phase);
}

function unavailableElementActionReceipt(
  request: FileViewerElementActionRequest,
): FileViewerElementActionReceipt {
  // `cancelled` is the existing typed no-op state. It never represents an
  // opened or completed action, and keeps the caller from guessing that a
  // missing owner performed anything.
  return {
    targetId: request.targetId,
    action: request.action,
    phase: 'cancelled',
  };
}

function unavailableContextMenuReceipt(
  request: FileViewerContextMenuRequest,
): FileViewerContextMenuReceipt {
  return {
    targetId: request.targetId,
    phase: 'cancelled',
  };
}

export function requestFileViewerElementAction(
  capabilities: FileViewerCapabilities | null,
  request: FileViewerElementActionRequest,
): FileViewerElementActionReceipt {
  if (!isFileViewerCapabilities(capabilities)) return unavailableElementActionReceipt(request);
  try {
    const receipt = capabilities.requestElementAction(request);
    if (!isFileViewerElementActionReceipt(receipt)
      || receipt.targetId !== request.targetId
      || receipt.action !== request.action) return unavailableElementActionReceipt(request);
    return receipt;
  } catch {
    return unavailableElementActionReceipt(request);
  }
}

export function requestFileViewerContextMenu(
  capabilities: FileViewerCapabilities | null,
  request: FileViewerContextMenuRequest,
): FileViewerContextMenuReceipt {
  if (!isFileViewerCapabilities(capabilities)) return unavailableContextMenuReceipt(request);
  try {
    const receipt = capabilities.requestContextMenu(request);
    if (!isFileViewerContextMenuReceipt(receipt) || receipt.targetId !== request.targetId) {
      return unavailableContextMenuReceipt(request);
    }
    return receipt;
  } catch {
    return unavailableContextMenuReceipt(request);
  }
}

export function requestFileViewerDestructiveAction(
  capabilities: FileViewerCapabilities | null,
  request: FileViewerDestructiveActionRequest,
): FileViewerDestructiveActionReceipt | null {
  if (!isFileViewerCapabilities(capabilities)) return null;
  try {
    const receipt = capabilities.requestAuthorizedDestructiveAction(request);
    if (!isFileViewerDestructiveActionReceipt(receipt)
      || receipt.action !== request.action
      || receipt.targetId !== request.targetId) return null;
    return receipt;
  } catch {
    return null;
  }
}
