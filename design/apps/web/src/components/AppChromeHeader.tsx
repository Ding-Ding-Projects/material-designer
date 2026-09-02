import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { MaterialSymbol } from './MaterialSymbol';

interface Props {
  actions?: ReactNode;
  children?: ReactNode;
  fileActionsBefore?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  showTrafficSpace?: boolean;
}

export const APP_CHROME_FILE_ACTIONS_ID = 'app-chrome-file-actions';
export const APP_CHROME_FILE_ACTIONS_SELECTOR = '[data-app-chrome-file-actions="true"]';

export function AppChromeHeader({
  actions,
  children,
  fileActionsBefore,
  onBack,
  backLabel,
  showTrafficSpace = true,
}: Props) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t('project.backToProjects');

  return (
    <header className="app-chrome-header">
      {showTrafficSpace ? <div className="app-chrome-traffic-space" aria-hidden /> : null}
      {onBack ? (
        <button
          type="button"
          className="app-chrome-back od-tooltip"
          onClick={onBack}
          title={resolvedBackLabel}
          data-tooltip={resolvedBackLabel}
          data-tooltip-placement="bottom"
          aria-label={resolvedBackLabel}
        >
          <MaterialSymbol name="arrow_back" size={16} />
        </button>
      ) : null}
      {children ? <div className="app-chrome-content">{children}</div> : null}
      <div className="app-chrome-drag" aria-hidden />
      {fileActionsBefore ? <div className="app-chrome-file-actions-before">{fileActionsBefore}</div> : null}
      <div
        id={APP_CHROME_FILE_ACTIONS_ID}
        className="app-chrome-file-actions"
        data-app-chrome-file-actions="true"
      />
      {actions ? <div className="app-chrome-actions">{actions}</div> : null}
    </header>
  );
}

export function SettingsIconButton({
  onClick,
  title,
  ariaLabel,
}: {
  onClick: () => void;
  title: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className="settings-icon-btn od-tooltip"
      onClick={onClick}
      title={title}
      data-tooltip={title}
      data-tooltip-placement="bottom"
      aria-label={ariaLabel}
    >
      <MaterialSymbol name="settings" size={18} />
    </button>
  );
}
