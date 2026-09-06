import { createContext, useContext } from 'react';
import type { AppearanceTarget, RenderedElement } from './elementAppearance';

export interface ElementAppearanceActions {
  findTarget(element: RenderedElement): AppearanceTarget | undefined;
  openEditor(target: AppearanceTarget): Promise<void>;
}

/** Access the owning boundary's registry, never create another registration. */
export const ElementAppearanceActionsContext = createContext<ElementAppearanceActions | null>(null);
export function useElementAppearanceActions(): ElementAppearanceActions | null {
  return useContext(ElementAppearanceActionsContext);
}
