// Pure list operations on the guided parts. Kept out of the component so the
// builder is layout and the behaviour is testable without a DOM.

import { nextPartId, once, type RegexPart, type RegexPartKind } from './pattern';

export function createPart(kind: RegexPartKind): RegexPart {
  if (kind === 'literal') {
    return { id: nextPartId(), kind: 'literal', value: '', quantifier: once() };
  }
  if (kind === 'charClass') {
    return {
      id: nextPartId(),
      kind: 'charClass',
      preset: 'digit',
      custom: '',
      negated: false,
      quantifier: once(),
    };
  }
  if (kind === 'anchor') {
    return { id: nextPartId(), kind: 'anchor', anchor: 'start' };
  }
  if (kind === 'group') {
    return {
      id: nextPartId(),
      kind: 'group',
      groupKind: 'capturing',
      name: '',
      body: '',
      quantifier: once(),
    };
  }
  return { id: nextPartId(), kind: 'alternation', options: ['', ''], quantifier: once() };
}

export function appendPart(parts: readonly RegexPart[], part: RegexPart): RegexPart[] {
  return [...parts, part];
}

export function removePartAt(parts: readonly RegexPart[], index: number): RegexPart[] {
  return parts.filter((_, i) => i !== index);
}

/** Move the part at `index` by `delta`, clamped; returns the same list when it cannot move. */
export function movePart(parts: readonly RegexPart[], index: number, delta: number): RegexPart[] {
  const target = index + delta;
  if (index < 0 || index >= parts.length) return [...parts];
  if (target < 0 || target >= parts.length) return [...parts];
  const next = [...parts];
  const moved = next[index];
  const displaced = next[target];
  if (!moved || !displaced) return [...parts];
  next[index] = displaced;
  next[target] = moved;
  return next;
}

/** Replace the part at `index`. The caller supplies a whole part, so the
 *  discriminated union cannot be broken by a partial patch. */
export function replacePartAt(
  parts: readonly RegexPart[],
  index: number,
  part: RegexPart,
): RegexPart[] {
  return parts.map((existing, i) => (i === index ? part : existing));
}
