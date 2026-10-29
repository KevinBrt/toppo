/**
 * Publishes plugin authors' packages to npm, each after what it depends on, those of a version
 * npm has already left as they are: run by `publish-plugin-packages.yml` only, which npm trusts
 * to publish them (trusted publishing: no token, a signed provenance). `--dry-run` checks
 * everything but publishes nothing.
 */
import { npm, packPluginPackages } from './pack-plugin-packages.ts';

const dryRun = process.argv.includes('--dry-run');

/** Whether npm has this version of the package already: a version is never published twice. */
function published(name: string, version: string): boolean {
  try {
    return npm(['view', `${name}@${version}`, 'version'], process.cwd()).trim() === version;
  } catch {
    // npm answers 404 for a package or a version it does not have.
    return false;
  }
}

for (const [name, tarball] of packPluginPackages()) {
  const version = /-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/.exec(tarball)?.[1];
  if (!version) {
    throw new Error(`No version in ${tarball}`);
  }
  if (published(name, version)) {
    console.log(`${name} ${version}: on npm already`);
    continue;
  }
  npm(['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])], process.cwd());
  console.log(`${name} ${version}: ${dryRun ? 'would be published' : 'published'}`);
}
