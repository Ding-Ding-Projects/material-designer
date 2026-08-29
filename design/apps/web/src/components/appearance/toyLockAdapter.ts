import type { AppearanceTarget, RenderedElement } from './elementAppearance';

export const ELEMENT_TOY_LOCK_REQUEST = 'open-design:element-toy-lock-request';
export const ELEMENT_TOY_LOCK_CONFIGURATION = 'open-design:element-toy-lock-configuration';
export const ELEMENT_TOY_LOCK_STATE = 'open-design:element-toy-lock-state';
export const ELEMENT_TOY_LOCK_ACTIVATION = 'open-design:element-toy-lock-activation';

export interface ElementToyLockRequestDetail {
  targetId: string;
  targetLabel: string;
  targetRole: string;
  anchor: RenderedElement | null;
}

export interface ElementToyLockStateDetail {
  targetId: string;
  locked: boolean;
  policy?: string;
}

/**
 * Adapter seam owned by the appearance boundary. The authentication lane
 * listens for this request and decides policy, credentials, and prompt UI;
 * appearance never stores or verifies a secret and never pretends a request
 * is already authorized.
 */
export function requestElementToyLock(target: AppearanceTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ElementToyLockRequestDetail>(ELEMENT_TOY_LOCK_REQUEST, {
    detail: {
      targetId: target.id,
      targetLabel: target.label,
      targetRole: target.role,
      anchor: target.element,
    },
  }));
}

export function publishElementToyLockConfigurationRequest(detail: ElementToyLockRequestDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ElementToyLockRequestDetail>(ELEMENT_TOY_LOCK_CONFIGURATION, { detail }));
}

export function publishElementToyLockState(detail: ElementToyLockStateDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ElementToyLockStateDetail>(ELEMENT_TOY_LOCK_STATE, { detail }));
}

export function requestElementToyLockActivation(target: AppearanceTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ElementToyLockRequestDetail>(ELEMENT_TOY_LOCK_ACTIVATION, {
    detail: { targetId: target.id, targetLabel: target.label, targetRole: target.role, anchor: target.element },
  }));
}
