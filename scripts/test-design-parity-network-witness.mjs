import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PARITY_PROTOCOLS,
  buildParityRoute,
  createObservedParityWitness,
  evaluateCaptureNetwork,
  parseParityRoute,
  parityWitnessMatches,
  requireParityWitnessMatch,
} from '../tools/design-reference-app/parity-route-contract.mjs';

const root = new URL('../', import.meta.url);
const inventory = JSON.parse(readFileSync(new URL('.codex/verification/design-parity/inventory.json', root), 'utf8'));
const tuple = inventory.rows[0].tuple;
const route = parseParityRoute(buildParityRoute(PARITY_PROTOCOLS.reference, tuple), { protocol: PARITY_PROTOCOLS.reference });
const rendererWitness = {
  routeId: route.id,
  routePath: route.browserPath,
  routeState: tuple.state,
  fixtureSource: 'checked-in-reference',
  fixtureRevision: tuple.fixtureRevision,
};
const captureSettledWitness = { settled: true, routePath: route.browserPath, revision: 'capture-settled-v1' };
const witness = createObservedParityWitness(route, { rendererWitness, captureSettledWitness });
assert.equal(Object.isFrozen(witness), true);
assert.equal(Object.isFrozen(witness.rendererWitness), true);
assert.equal(Object.isFrozen(witness.captureSettledWitness), true);

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

const nestedMutation = structuredClone(witness);
nestedMutation.rendererWitness.routePath = '/wrong-route';
assert.equal(parityWitnessMatches(witness, nestedMutation), false);
assert.throws(() => requireParityWitnessMatch(witness, nestedMutation), (error) => error.code === 'witness.mismatch');
assert.equal(witness.captureSettledWitness.settled, true);

process.stdout.write(JSON.stringify({ ok: true, blockedRequests: network.blockedRequests.length, unexpected: network.unexpected.length, witnessFields: Object.keys(witness).length }) + '\n');
