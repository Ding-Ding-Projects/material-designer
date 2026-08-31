import { FILE_CONVERTER_ROUTE, FILE_CONVERTER_SURFACE_ID } from './converterBridge';

/** C0 seam descriptor. Central App, host, and Day Teet Hui wiring remain parent-owned. */
export const FILE_CONVERTER_C0_REGISTRATION = Object.freeze({
  route: FILE_CONVERTER_ROUTE,
  surfaceId: FILE_CONVERTER_SURFACE_ID,
  componentExport: 'FileConverterView',
  bridgeCapability: 'converter',
  parentOwnedPaths: [
    'design/apps/web/src/App.tsx',
    'design/apps/desktop/src/main/preload.cts',
    'design/apps/desktop/src/main/runtime.ts',
    'design/packages/host/src/protocol.ts',
    'site/index.html',
    'site/assets/js/converter.js',
  ] as const,
});

export type FileConverterRegistration = typeof FILE_CONVERTER_C0_REGISTRATION;
