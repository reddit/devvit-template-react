import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const stableVersion = /^\d+\.\d+\.\d+$/;
const githubActionsAppId = 15368;
const isDevvit = (name) => name === 'devvit' || name.startsWith('@devvit/');

export function ineligibleReason({ dependencies, files, manifest, rules }) {
  if (
    dependencies.length === 0 ||
    dependencies.some(
      (dependency) =>
        dependency.updateType !== 'version-update:semver-patch' ||
        !stableVersion.test(dependency.prevVersion) ||
        !stableVersion.test(dependency.newVersion)
    )
  ) {
    return 'Every dependency must be a stable patch update.';
  }

  if (
    files.length !== 1 ||
    files[0].filename !== 'package.json' ||
    files[0].status !== 'modified'
  ) {
    return 'Only package.json dependency updates may auto-merge.';
  }

  if (dependencies.some((dependency) => isDevvit(dependency.dependencyName))) {
    const versions = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })
      .filter(([name]) => isDevvit(name))
      .map(([, version]) => version);
    if (
      versions.length === 0 ||
      versions.some(
        (version) => !stableVersion.test(version) || version !== versions[0]
      )
    ) {
      return 'Devvit packages must be pinned to the same stable version.';
    }
  }

  if (
    !rules.some(
      (rule) =>
        rule.type === 'required_status_checks' &&
        rule.parameters.strict_required_status_checks_policy &&
        rule.parameters.required_status_checks.some(
          (check) =>
            check.context === 'test' &&
            check.integration_id === githubActionsAppId
        )
    )
  ) {
    return 'Require the GitHub Actions test check and an up-to-date branch in a main ruleset before enabling auto-merge.';
  }

  return undefined;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { GH_REPO, PR_NUMBER, PR_HEAD_SHA, UPDATED_DEPENDENCIES } = process.env;
  const api = (path) =>
    JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
  const reason = ineligibleReason({
    dependencies: JSON.parse(UPDATED_DEPENDENCIES),
    files: api(`repos/${GH_REPO}/pulls/${PR_NUMBER}/files?per_page=100`),
    manifest: JSON.parse(
      Buffer.from(
        api(`repos/${GH_REPO}/contents/package.json?ref=${PR_HEAD_SHA}`)
          .content,
        'base64'
      ).toString('utf8')
    ),
    rules: api(`repos/${GH_REPO}/rules/branches/main`),
  });
  if (reason) {
    console.log(`Leaving PR #${PR_NUMBER} for manual review: ${reason}`);
  } else {
    execFileSync(
      'gh',
      [
        'pr',
        'merge',
        PR_NUMBER,
        '--repo',
        GH_REPO,
        '--auto',
        '--squash',
        '--match-head-commit',
        PR_HEAD_SHA,
      ],
      { stdio: 'inherit' }
    );
  }
}
