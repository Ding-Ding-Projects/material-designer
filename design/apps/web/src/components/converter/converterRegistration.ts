import { FILE_CONVERTER_ROUTE, FILE_CONVERTER_SURFACE_ID } from './converterBridge';

/** Source integration descriptor. Built and installed interaction remains a separate proof boundary. */
export const FILE_CONVERTER_C0_REGISTRATION = Object.freeze({
  route: FILE_CONVERTER_ROUTE,
  surfaceId: FILE_CONVERTER_SURFACE_ID,
  componentExport: 'FileConverterView',
  bridgeCapability: 'converter',
  sourceIntegratedPaths: [
    'design/apps/web/src/App.tsx',
    'design/apps/desktop/src/main/preload.cts',
    'design/apps/desktop/src/main/runtime.ts',
    'design/packages/host/src/protocol.ts',
    'site/index.html',
    'site/assets/js/converter.js',
  ] as const,
  status: 'source-integrated-built-proof-pending' as const,
});

export type FileConverterRegistration = typeof FILE_CONVERTER_C0_REGISTRATION;
