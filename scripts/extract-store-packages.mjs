import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const STORE = path.join(process.env.HOME, 'Library/pnpm/store');
const NODE_MODULES = path.join(ROOT, 'node_modules');

const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const requireFromNpm = createRequire(path.join(npmRoot, 'npm/package.json'));
const semver = requireFromNpm('semver');

const directDependencies = {
  react: '19.2.4',
  'react-dom': '19.2.4',
  'react-router-dom': '7.13.0',
  vite: '7.3.1',
};

const optionalTargets = new Set();

if (process.platform === 'darwin' && process.arch === 'arm64') {
  optionalTargets.add('@rollup/rollup-darwin-arm64');
  optionalTargets.add('@esbuild/darwin-arm64');
}

function ensureDir(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function decodeIntegrityToStorePath(integrity) {
  const base64 = integrity.split('-')[1];
  const hex = Buffer.from(base64, 'base64').toString('hex');
  return path.join(STORE, 'v3/files', hex.slice(0, 2), hex.slice(2));
}

function candidateIndexPaths(name) {
  const output = execFileSync(
    'rg',
    ['-l', '-F', `"name":"${name}"`, STORE, '-g', '*index.json'],
    { encoding: 'utf8' },
  );

  return output
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean);
}

function getPackageInfo(indexPath) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const packageJsonMeta = index.files['package.json'];
  if (!packageJsonMeta) {
    return null;
  }

  const packageJsonPath = decodeIntegrityToStorePath(packageJsonMeta.integrity);
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  return {
    indexPath,
    index,
    packageJsonPath,
    packageJson: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')),
  };
}

function resolvePackage(name, range) {
  const candidates = [];

  for (const indexPath of candidateIndexPaths(name)) {
    const info = getPackageInfo(indexPath);
    if (!info || info.packageJson.name !== name) {
      continue;
    }

    if (!semver.satisfies(info.packageJson.version, range, { includePrerelease: true })) {
      continue;
    }

    candidates.push(info);
  }

  candidates.sort((left, right) => semver.rcompare(left.packageJson.version, right.packageJson.version));
  const selected = candidates[0];

  if (!selected) {
    throw new Error(`Unable to resolve ${name}@${range} from ${STORE}`);
  }

  return selected;
}

function packageDirectory(rootDir, packageName) {
  if (packageName.startsWith('@')) {
    const [scope, bareName] = packageName.split('/');
    return path.join(rootDir, scope, bareName);
  }

  return path.join(rootDir, packageName);
}

function shouldInstallOptional(name) {
  return optionalTargets.has(name);
}

function linkBins(targetDir, packageJson) {
  if (!packageJson.bin) {
    return;
  }

  const binEntries =
    typeof packageJson.bin === 'string'
      ? [[packageJson.name.includes('/') ? packageJson.name.split('/')[1] : packageJson.name, packageJson.bin]]
      : Object.entries(packageJson.bin);

  const binDir = path.join(NODE_MODULES, '.bin');
  ensureDir(binDir);

  for (const [binName, relativeTarget] of binEntries) {
    let targetFile = path.join(targetDir, relativeTarget);
    if (!fs.existsSync(targetFile) && packageJson.name === 'vite' && relativeTarget === 'bin/vite.js') {
      targetFile = path.join(targetDir, 'dist/node/cli.js');
    }

    if (!fs.existsSync(targetFile)) {
      continue;
    }

    const binPath = path.join(binDir, binName);

    if (fs.existsSync(binPath)) {
      fs.rmSync(binPath, { force: true });
    }

    fs.symlinkSync(path.relative(path.dirname(binPath), targetFile), binPath);
  }
}

function copyPackage(info, targetDir) {
  ensureDir(targetDir);

  for (const [relativePath, metadata] of Object.entries(info.index.files)) {
    const sourcePath = decodeIntegrityToStorePath(metadata.integrity);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const destinationPath = path.join(targetDir, relativePath);
    ensureDir(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);

    if (typeof metadata.mode === 'number') {
      fs.chmodSync(destinationPath, metadata.mode & 0o777);
    }
  }
}

const installed = new Map();

function installPackage(name, range, rootDir = NODE_MODULES) {
  const resolved = resolvePackage(name, range);
  const installKey = `${name}@${resolved.packageJson.version}`;

  if (installed.has(installKey)) {
    return installed.get(installKey);
  }

  const targetDir = packageDirectory(rootDir, name);
  copyPackage(resolved, targetDir);
  linkBins(targetDir, resolved.packageJson);
  installed.set(installKey, targetDir);

  const dependencies = Object.entries(resolved.packageJson.dependencies ?? {});
  const optionalDependencies = Object.entries(resolved.packageJson.optionalDependencies ?? {}).filter(([depName]) =>
    shouldInstallOptional(depName),
  );

  for (const [depName, depRange] of [...dependencies, ...optionalDependencies]) {
    installPackage(depName, depRange, NODE_MODULES);
  }

  return targetDir;
}

fs.rmSync(NODE_MODULES, { recursive: true, force: true });
ensureDir(NODE_MODULES);

for (const [packageName, versionRange] of Object.entries(directDependencies)) {
  installPackage(packageName, versionRange, NODE_MODULES);
}

console.log(`Extracted ${installed.size} packages into ${NODE_MODULES}`);
