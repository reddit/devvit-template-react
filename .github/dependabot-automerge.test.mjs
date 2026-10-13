import assert from 'node:assert/strict';
import test from 'node:test';
import { ineligibleReason } from './dependabot-automerge.mjs';

const patch = (dependencyName) => ({
  dependencyName,
  updateType: 'version-update:semver-patch',
  prevVersion: '0.14.7',
  newVersion: '0.14.8',
});
const eligible = {
  dependencies: [patch('devvit'), patch('@devvit/web')],
  files: [{ filename: 'package.json', status: 'modified' }],
  manifest: {
    dependencies: { devvit: '0.14.8', '@devvit/web': '0.14.8' },
    devDependencies: { '@devvit/start': '0.14.8' },
  },
  rules: [
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: 'test', integration_id: 15368 }],
      },
    },
  ],
};

test('allows grouped Devvit patches and third-party patches behind required CI', () => {
  assert.equal(ineligibleReason(eligible), undefined);
  assert.equal(
    ineligibleReason({ ...eligible, dependencies: [patch('hono')] }),
    undefined
  );
});

const blocked = [
  [
    'missing metadata',
    (input) => {
      input.dependencies = [];
    },
  ],
  [
    'a group containing a minor upgrade',
    (input) => {
      input.dependencies[1].updateType = 'version-update:semver-minor';
    },
  ],
  [
    'a group containing an unknown update',
    (input) => {
      input.dependencies[1].updateType = '';
    },
  ],
  [
    'a prerelease patch',
    (input) => {
      input.dependencies[0].newVersion = '0.14.8-next.1';
    },
  ],
  [
    'changes outside the manifest',
    (input) => {
      input.files.push({ filename: 'src/server/index.ts' });
    },
  ],
  [
    'mismatched Devvit packages',
    (input) => {
      input.manifest.devDependencies['@devvit/start'] = '0.14.7';
    },
  ],
  [
    'an unpinned Devvit version',
    (input) => {
      input.manifest = {
        dependencies: { devvit: '^0.14.8', '@devvit/web': '^0.14.8' },
      };
    },
  ],
  [
    'CI that is not required',
    (input) => {
      input.rules = [];
    },
  ],
  [
    'CI from another provider',
    (input) => {
      input.rules[0].parameters.required_status_checks[0].integration_id = 1;
    },
  ],
  [
    'CI without requiring an up-to-date branch',
    (input) => {
      input.rules[0].parameters.strict_required_status_checks_policy = false;
    },
  ],
];

for (const [name, changes] of blocked) {
  test(`leaves ${name} for manual review`, () => {
    const input = structuredClone(eligible);
    changes(input);
    assert.ok(ineligibleReason(input));
  });
}
