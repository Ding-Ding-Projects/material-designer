// One row of the guided parts list.
//
// Every control here edits a value in plain terms — "text to match", "any
// digit", "one or more" — and the regex source it emits is shown beside it, so
// the guided view teaches the syntax instead of hiding it.

import { Button, Input, Select } from '@open-design/components';

import { Icon } from '../Icon';
import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import {
  ANCHOR_KINDS,
  CHAR_CLASS_PRESETS,
  GROUP_KINDS,
  MAX_QUANTIFIER_COUNT,
  QUANTIFIER_KINDS,
  quantifierSupportsLazy,
  quantifierUsesMax,
  quantifierUsesMin,
  renderPart,
  type AnchorKind,
  type CharClassPreset,
  type GroupKind,
  type Quantifier,
  type QuantifierKind,
  type RegexPart,
  type RegexPartKind,
} from './pattern';
import styles from './RegexBuilder.module.css';

export const PART_KIND_LABEL: Record<RegexPartKind, keyof Dict> = {
  literal: 'regexBuilder.partLiteral',
  charClass: 'regexBuilder.partCharClass',
  anchor: 'regexBuilder.partAnchor',
  group: 'regexBuilder.partGroup',
  alternation: 'regexBuilder.partAlternation',
};

const CLASS_PRESET_LABEL: Record<CharClassPreset, keyof Dict> = {
  digit: 'regexBuilder.classDigit',
  notDigit: 'regexBuilder.classNotDigit',
  word: 'regexBuilder.classWord',
  notWord: 'regexBuilder.classNotWord',
  whitespace: 'regexBuilder.classWhitespace',
  notWhitespace: 'regexBuilder.classNotWhitespace',
  any: 'regexBuilder.classAny',
  custom: 'regexBuilder.classCustom',
};

const ANCHOR_LABEL: Record<AnchorKind, keyof Dict> = {
  start: 'regexBuilder.anchorStart',
  end: 'regexBuilder.anchorEnd',
  wordBoundary: 'regexBuilder.anchorWordBoundary',
  notWordBoundary: 'regexBuilder.anchorNotWordBoundary',
};

const GROUP_KIND_LABEL: Record<GroupKind, keyof Dict> = {
  capturing: 'regexBuilder.groupCapturing',
  nonCapturing: 'regexBuilder.groupNonCapturing',
  named: 'regexBuilder.groupNamed',
};

const QUANTIFIER_LABEL: Record<QuantifierKind, keyof Dict> = {
  one: 'regexBuilder.quantifierOne',
  optional: 'regexBuilder.quantifierOptional',
  star: 'regexBuilder.quantifierStar',
  plus: 'regexBuilder.quantifierPlus',
  exactly: 'regexBuilder.quantifierExactly',
  atLeast: 'regexBuilder.quantifierAtLeast',
  between: 'regexBuilder.quantifierBetween',
};

interface QuantifierEditorProps {
  idPrefix: string;
  quantifier: Quantifier;
  onChange: (next: Quantifier) => void;
}

function QuantifierEditor({ idPrefix, quantifier, onChange }: QuantifierEditorProps) {
  const t = useT();
  const showMin = quantifierUsesMin(quantifier.kind);
  const showMax = quantifierUsesMax(quantifier.kind);
  const showLazy = quantifierSupportsLazy(quantifier.kind);

  return (
    <div className={styles.quantRow}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('regexBuilder.quantifierLabel')}</span>
        <Select
          className={styles.select}
          value={quantifier.kind}
          onChange={(event) =>
            onChange({ ...quantifier, kind: event.target.value as QuantifierKind })
          }
        >
          {QUANTIFIER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(QUANTIFIER_LABEL[kind])}
            </option>
          ))}
        </Select>
      </label>

      {showMin ? (
        <label className={styles.fieldNarrow}>
          <span className={styles.fieldLabel}>{t('regexBuilder.quantifierMin')}</span>
          <Input
            className={styles.numberInput}
            type="number"
            min={0}
            max={MAX_QUANTIFIER_COUNT}
            value={String(quantifier.min)}
            onChange={(event) => onChange({ ...quantifier, min: Number(event.target.value) })}
          />
        </label>
      ) : null}

      {showMax ? (
        <label className={styles.fieldNarrow}>
          <span className={styles.fieldLabel}>{t('regexBuilder.quantifierMax')}</span>
          <Input
            className={styles.numberInput}
            type="number"
            min={0}
            max={MAX_QUANTIFIER_COUNT}
            value={String(quantifier.max)}
            onChange={(event) => onChange({ ...quantifier, max: Number(event.target.value) })}
          />
        </label>
      ) : null}

      {showLazy ? (
        <label className={styles.checkboxField} htmlFor={`${idPrefix}-lazy`}>
          <input
            id={`${idPrefix}-lazy`}
            type="checkbox"
            checked={quantifier.lazy}
            onChange={(event) => onChange({ ...quantifier, lazy: event.target.checked })}
          />
          <span>
            <span className={styles.checkboxLabel}>{t('regexBuilder.quantifierLazy')}</span>
            <span className={styles.hint}>{t('regexBuilder.quantifierLazyHint')}</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

interface Props {
  part: RegexPart;
  index: number;
  total: number;
  onChange: (part: RegexPart) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}

export function RegexPartRow({ part, index, total, onChange, onMove, onRemove }: Props) {
  const t = useT();
  const idPrefix = `regex-part-${part.id}`;
  const source = renderPart(part);

  return (
    <li className={styles.partRow} data-testid={`regex-part-${index}`}>
      <div className={styles.partHead}>
        <span className={styles.partKind}>{t(PART_KIND_LABEL[part.kind])}</span>
        <code className={styles.partSource}>{source || '—'}</code>
        <span className={styles.partActions}>
          <Button
            variant="subtle"
            size="icon"
            className={styles.iconButton}
            aria-label={t('regexBuilder.movePartUp')}
            title={t('regexBuilder.movePartUp')}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            {/* The icon set has no chevron-up; the down one is flipped so the
                pair stays visually identical rather than mismatched. */}
            <Icon name="chevron-down" size={13} className={styles.flipY} />
          </Button>
          <Button
            variant="subtle"
            size="icon"
            className={styles.iconButton}
            aria-label={t('regexBuilder.movePartDown')}
            title={t('regexBuilder.movePartDown')}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <Icon name="chevron-down" size={13} />
          </Button>
          <Button
            variant="subtle"
            size="icon"
            className={styles.iconButton}
            aria-label={t('regexBuilder.removePart')}
            title={t('regexBuilder.removePart')}
            onClick={onRemove}
          >
            <Icon name="close" size={13} />
          </Button>
        </span>
      </div>

      {part.kind === 'literal' ? (
        <div className={styles.partBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.literalValueLabel')}</span>
            <Input
              className={styles.textInput}
              value={part.value}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => onChange({ ...part, value: event.target.value })}
            />
          </label>
          <p className={styles.hint}>{t('regexBuilder.literalHint')}</p>
          <QuantifierEditor
            idPrefix={idPrefix}
            quantifier={part.quantifier}
            onChange={(quantifier) => onChange({ ...part, quantifier })}
          />
        </div>
      ) : null}

      {part.kind === 'charClass' ? (
        <div className={styles.partBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.classPresetLabel')}</span>
            <Select
              className={styles.select}
              value={part.preset}
              onChange={(event) =>
                onChange({ ...part, preset: event.target.value as CharClassPreset })
              }
            >
              {CHAR_CLASS_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(CLASS_PRESET_LABEL[preset])}
                </option>
              ))}
            </Select>
          </label>
          {part.preset === 'custom' ? (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('regexBuilder.classCustomLabel')}</span>
                <Input
                  className={styles.codeInput}
                  value={part.custom}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => onChange({ ...part, custom: event.target.value })}
                />
              </label>
              <p className={styles.hint}>{t('regexBuilder.classCustomHint')}</p>
              <label className={styles.checkboxField} htmlFor={`${idPrefix}-negated`}>
                <input
                  id={`${idPrefix}-negated`}
                  type="checkbox"
                  checked={part.negated}
                  onChange={(event) => onChange({ ...part, negated: event.target.checked })}
                />
                <span className={styles.checkboxLabel}>{t('regexBuilder.classNegate')}</span>
              </label>
            </>
          ) : null}
          <QuantifierEditor
            idPrefix={idPrefix}
            quantifier={part.quantifier}
            onChange={(quantifier) => onChange({ ...part, quantifier })}
          />
        </div>
      ) : null}

      {part.kind === 'anchor' ? (
        <div className={styles.partBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.anchorLabel')}</span>
            <Select
              className={styles.select}
              value={part.anchor}
              onChange={(event) => onChange({ ...part, anchor: event.target.value as AnchorKind })}
            >
              {ANCHOR_KINDS.map((anchor) => (
                <option key={anchor} value={anchor}>
                  {t(ANCHOR_LABEL[anchor])}
                </option>
              ))}
            </Select>
          </label>
        </div>
      ) : null}

      {part.kind === 'group' ? (
        <div className={styles.partBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.groupKindLabel')}</span>
            <Select
              className={styles.select}
              value={part.groupKind}
              onChange={(event) =>
                onChange({ ...part, groupKind: event.target.value as GroupKind })
              }
            >
              {GROUP_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(GROUP_KIND_LABEL[kind])}
                </option>
              ))}
            </Select>
          </label>
          {part.groupKind === 'named' ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('regexBuilder.groupNameLabel')}</span>
              <Input
                className={styles.codeInput}
                value={part.name}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => onChange({ ...part, name: event.target.value })}
              />
            </label>
          ) : null}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.groupBodyLabel')}</span>
            <Input
              className={styles.codeInput}
              value={part.body}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => onChange({ ...part, body: event.target.value })}
            />
          </label>
          <p className={styles.hint}>{t('regexBuilder.groupBodyHint')}</p>
          <QuantifierEditor
            idPrefix={idPrefix}
            quantifier={part.quantifier}
            onChange={(quantifier) => onChange({ ...part, quantifier })}
          />
        </div>
      ) : null}

      {part.kind === 'alternation' ? (
        <div className={styles.partBody}>
          <p className={styles.hint}>{t('regexBuilder.alternationHint')}</p>
          {part.options.map((option, optionIndex) => (
            <div className={styles.optionRow} key={`${part.id}-option-${optionIndex}`}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('regexBuilder.alternationOptionLabel', { index: optionIndex + 1 })}
                </span>
                <Input
                  className={styles.textInput}
                  value={option}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) =>
                    onChange({
                      ...part,
                      options: part.options.map((existing, i) =>
                        i === optionIndex ? event.target.value : existing,
                      ),
                    })
                  }
                />
              </label>
              <Button
                variant="subtle"
                size="icon"
                className={styles.iconButton}
                aria-label={t('regexBuilder.alternationRemove', { index: optionIndex + 1 })}
                title={t('regexBuilder.alternationRemove', { index: optionIndex + 1 })}
                disabled={part.options.length <= 2}
                onClick={() =>
                  onChange({
                    ...part,
                    options: part.options.filter((_, i) => i !== optionIndex),
                  })
                }
              >
                <Icon name="close" size={13} />
              </Button>
            </div>
          ))}
          <Button
            variant="subtle"
            className={styles.smallButton}
            onClick={() => onChange({ ...part, options: [...part.options, ''] })}
          >
            {t('regexBuilder.alternationAdd')}
          </Button>
          <QuantifierEditor
            idPrefix={idPrefix}
            quantifier={part.quantifier}
            onChange={(quantifier) => onChange({ ...part, quantifier })}
          />
        </div>
      ) : null}
    </li>
  );
}
