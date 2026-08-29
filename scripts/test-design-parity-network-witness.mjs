import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAndPinParityRegistries } from './design-parity-production.mjs';
import {
  PARITY_PROTOCOLS,
  PARITY_WITNESS_FIELDS,
  buildParityRoute,
  createCaptureIsolation,
  createObservedParityWitness,
  deepFreezeParityGraph,
  evaluateCaptureNetwork,
  parseParityRoute,
  parityWitnessMatches,
  requireParityWitnessMatch,
  requireReferencePostSettleMatch,
  resolveParityPresentationBinding,
  validateReferenceLauncherReadiness,
} from '../tools/design-reference-app/parity-route-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const loaded = loadAndPinParityRegistries(root);
const tuple = loaded.inventory.rows[0].tuple;
const route = parseParityRoute(buildParityRoute(PARITY_PROTOCOLS.reference, tuple), { protocol: PARITY_PROTOCOLS.reference });
const rendererWitness = {
  routeId: route.id,
  routePath: route.browserPath,
  routeState: tuple.state,
  fixtureSource: 'checked-in-reference',
  fixturePath: loaded.pinnedReference.reference.path,
  fixtureRevision: tuple.fixtureRevision,
  fixtureSha256: loaded.pinnedReference.reference.sha256,
};
const captureSettledWitness = { settled: true, routePath: route.browserPath, revision: 'capture-settled-v1' };
const witness = createObservedParityWitness(route, { rendererWitness, captureSettledWitness });
assert.deepEqual(Object.keys(witness), ['version', ...PARITY_WITNESS_FIELDS]);
assert.equal(PARITY_WITNESS_FIELDS.length, 21);
assert.equal(Object.isFrozen(witness), true);
assert.equal(Object.isFrozen(witness.rendererWitness), true);
assert.equal(Object.isFrozen(witness.captureSettledWitness), true);

const resolvedBindings = new Set();
for (const row of loaded.inventory.rows) {
  for (const presentation of row.presentations) {
    const binding = resolveParityPresentationBinding(row.id, presentation.presentationId, loaded);
    const parsedReference = parseParityRoute(presentation.referenceRoute, { protocol: PARITY_PROTOCOLS.reference });
    const parsedApplication = parseParityRoute(presentation.applicationRoute, { protocol: PARITY_PROTOCOLS.application });
    assert.equal(binding.presentation.bindingId, presentation.bindingId);
    assert.equal(parsedReference.bindingId, presentation.bindingId);
    assert.equal(parsedApplication.bindingId, presentation.bindingId);
    assert.deepEqual(parsedReference.tuple, presentation.tuple);
    assert.deepEqual(parsedApplication.tuple, presentation.tuple);
    resolvedBindings.add(presentation.bindingId);
  }
}
assert.equal(resolvedBindings.size, 60);
const lightIsolation = createCaptureIsolation('home-default-light', 'light-normal-100', 'run-0123456789abcdef0123456789abcdef');
const darkIsolation = createCaptureIsolation('home-default-light', 'dark-normal-100', 'run-0123456789abcdef0123456789abcdef');
assert.equal(lightIsolation.bindingId, 'home-default-light--light-normal-100');
assert.equal(darkIsolation.bindingId, 'home-default-light--dark-normal-100');
assert.notEqual(lightIsolation.partition, darkIsolation.partition);

const localScript = 'https://example.invalid/local-script.js';
const network = evaluateCaptureNetwork([
  { url: localScript, resourceType: 'script' },
  { url: 'https://example.invalid/blocked.css', resourceType: 'stylesheet' },
  { url: 'https://example.invalid/blocked.png', resourceType: 'image' },
], new Set([localScript]));
assert.equal(network.ready, false);
assert.equal(network.reason, 'capture.network_unexpected_blocked');
assert.equal(network.unexpected.length, 2);
assert.equal(network.blockedRequests[0].kind, 'local-substitution');

const rendererRouteState = deepFreezeParityGraph({ routeId: route.id, screen: tuple.screen, state: tuple.state, routePath: route.browserPath, observation: { selector: 'main > header h1', text: 'Home' } });
const measured = deepFreezeParityGraph({ viewport: { width: tuple.viewport.width, height: tuple.viewport.height }, devicePixelRatio: tuple.scale, fonts: { robotoFlex: true, robotoMono: true, materialSymbolsRounded: true }, motionStyle: true, tuple });
const snapshot = deepFreezeParityGraph({
  route: route.referenceRoute,
  tuple,
  identity: route.identity,
  rendererRouteState,
  reference: { path: loaded.pinnedReference.reference.path, sha256: loaded.pinnedReference.reference.sha256 },
  measured,
  network: { policy: 'disabled', blockedRequests: [], blockedRequestPolicy: 'fail', ready: true },
  witness,
  freezeStatus: { tuple: true, viewport: true, identity: true, rendererRouteState: true, rendererWitness: true, captureSettledWitness: true, witness: true, snapshot: true },
});
assert.equal(validateReferenceLauncherReadiness(route, loaded.pinnedReference.reference, snapshot).route, route.referenceRoute);
assert.equal(requireReferencePostSettleMatch(route, loaded.pinnedReference.reference, snapshot, structuredClone(snapshot)), true);

for (const field of PARITY_WITNESS_FIELDS) {
  const broken = structuredClone(snapshot);
  if (field === 'rendererWitness') broken.witness.rendererWitness.routePath = '/wrong-route';
  else if (field === 'captureSettledWitness') broken.witness.captureSettledWitness.routePath = '/wrong-route';
  else if (typeof broken.witness[field] === 'number') broken.witness[field] += 1;
  else broken.witness[field] = `wrong-${field}`;
  assert.throws(() => requireReferencePostSettleMatch(route, loaded.pinnedReference.reference, snapshot, broken));
}
for (const mutate of [
  (value) => { value.tuple.viewport.width += 1; },
  (value) => { value.rendererRouteState.routeId = 'projects-default-light'; },
  (value) => { value.rendererRouteState.routePath = '/projects'; },
  (value) => { value.rendererRouteState.state = 'appearance'; },
  (value) => { value.reference.path = 'wrong-reference.html'; },
  (value) => { value.reference.sha256 = '0'.repeat(64); },
  (value) => { value.network.ready = false; },
  (value) => { value.freezeStatus.viewport = false; },
]) {
  const broken = structuredClone(snapshot); mutate(broken);
  assert.throws(() => requireReferencePostSettleMatch(route, loaded.pinnedReference.reference, snapshot, broken));
}
const nestedMutation = structuredClone(witness);
nestedMutation.rendererWitness.routePath = '/wrong-route';
assert.equal(parityWitnessMatches(witness, nestedMutation), false);
assert.throws(() => requireParityWitnessMatch(witness, nestedMutation), (error) => error.code === 'witness.mismatch');
assert.throws(() => createObservedParityWitness(route, { rendererWitness: null, captureSettledWitness }), (error) => error.code === 'witness.missing');
assert.throws(() => createObservedParityWitness(route, { rendererWitness, captureSettledWitness: null }), (error) => error.code === 'witness.missing');

const launcherSource = readFileSync(new URL('../tools/design-reference-app/main.mjs', import.meta.url), 'utf8');
assert.match(launcherSource, /^const firstRendererSnapshot = await readRendererOwnedSnapshot\(window\);$/m);
assert.match(launcherSource, /^const acceptedSnapshot = validateReferenceLauncherReadiness\(requested, pinnedReference\.reference, firstSnapshot\);$/m);
assert.match(launcherSource, /^requireReferencePostSettleMatch\(requested, pinnedReference\.reference, acceptedSnapshot, postSettleSnapshot\);$/m);
assert.doesNotMatch(launcherSource, /Object\.defineProperty\(globalThis, '__MATERIAL_DESIGNER_REFERENCE_ROUTE__'[\s\S]*JSON\.stringify\(observedWitness\)/);

process.stdout.write(JSON.stringify({ ok: true, bindings: resolvedBindings.size, blockedRequests: network.blockedRequests.length, unexpected: network.unexpected.length, witnessFields: PARITY_WITNESS_FIELDS.length, witnessFieldNegatives: PARITY_WITNESS_FIELDS.length, readinessNegatives: 8, productionReadinessHelpers: true }) + '\n');
