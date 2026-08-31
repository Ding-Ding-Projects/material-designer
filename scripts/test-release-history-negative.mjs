import assert from 'node:assert/strict';

import {
  generate,
  validateReleaseHistory,
} from './generate-release-history.mjs';

const SHA_ONE = 'a'.repeat(40);
const SHA_TWO = 'b'.repeat(40);

function release(tag, publishedAt, body = '## Added\n\n- A factual note.') {
  return {
    tag_name: tag,
    name: `Material Designer ${tag}`,
    published_at: publishedAt,
    html_url: `https://github.com/example-org/example-app/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    body,
  };
}

function expectFailure(action, message) {
  assert.throws(action, (error) => error instanceof Error && error.message.includes(message));
}

const records = [
  release('v1.0.1', '2026-08-29T05:00:00Z'),
  release('v1.0.0', '2026-08-28T05:00:00Z', '## Fixed\n\n- An older factual note.'),
];
const resolver = (tag) => tag === 'v1.0.1' ? SHA_ONE : SHA_TWO;
const history = generate({ records, repository: 'example-org/example-app', expectedCount: 2, resolveSha: resolver });
assert.equal(history.length, 2);
assert.equal(history[0].targetSha, SHA_ONE);
assert.equal(history[0].categories[0].name, 'Added');
validateReleaseHistory(history, { repository: 'example-org/example-app', expectedCount: 2 });
console.log('Baseline green: complete release history validates.');

expectFailure(
  () => generate({ records: [records[0]], repository: 'example-org/example-app', expectedCount: 2, resolveSha: resolver }),
  'expected 2 published releases, found 1',
);
console.log('Negative red: omitted release is rejected.');

expectFailure(
  () => generate({ records: [records[0], { ...records[1], tag_name: records[0].tag_name }], repository: 'example-org/example-app', expectedCount: 2, resolveSha: resolver }),
  'duplicate published tag',
);
console.log('Negative red: duplicate tag is rejected.');

expectFailure(
  () => generate({ records, repository: 'example-org/example-app', expectedCount: 2, resolveSha: () => 'short' }),
  'non-40-character commit SHA',
);
console.log('Negative red: wrong SHA is rejected.');

expectFailure(
  () => generate({ records: [release('v1.0.2', '2026-08-29')], repository: 'example-org/example-app', expectedCount: 1, resolveSha: () => SHA_ONE }),
  'invalid published date',
);
console.log('Negative red: wrong published date is rejected.');

const wrongTarget = history.map((entry, index) => index === 0 ? { ...entry, targetUrl: `https://github.com/example-org/example-app/commit/${SHA_TWO}` } : entry);
expectFailure(
  () => validateReleaseHistory(wrongTarget, { repository: 'example-org/example-app', expectedCount: 2 }),
  'target URL is not backed by its full SHA',
);
console.log('Negative red: wrong target URL is rejected.');

validateReleaseHistory(history, { repository: 'example-org/example-app', expectedCount: 2 });
console.log('Restored green: original release history validates again.');
