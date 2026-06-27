import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { reconcileSystemMap } from '../src/hooks/doc-analyzer.js';

const TARGETS = [
  'src/context-governor-trace.ts',
  'src/context-governor-trace-capture.ts',
  'test/benchmark-context-governor-trace.ts',
  'test/phase32-trace-benchmark.test.ts',
];

function seedWorkspace(root: string): string {
  mkdirSync(join(root, 'docs'), { recursive: true });
  for (const rel of TARGETS) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(resolve(rel), dest);
  }
  let systemMap = readFileSync(resolve('docs/SYSTEM_MAP.md'), 'utf8');
  for (const rel of TARGETS) {
    const marker = `| \`${rel}\` |`;
    systemMap = systemMap
      .split(/\r?\n/)
      .filter((line) => !line.includes(marker))
      .join('\n');
  }
  const systemMapPath = join(root, 'docs', 'SYSTEM_MAP.md');
  writeFileSync(systemMapPath, systemMap, 'utf8');
  return systemMapPath;
}

test('Phase 32 files remain auto-documentable after compaction work', async () => {
  const root = resolve(`.tmp_phase32_docs_continuity_${process.pid}_${Date.now()}`);
  rmSync(root, { recursive: true, force: true });
  const systemMapPath = seedWorkspace(root);
  const before = readFileSync(systemMapPath, 'utf8');
  const cwd = process.cwd();
  let result;
  try {
    process.chdir(root);
    result = await reconcileSystemMap(join(root, 'docs'));
  } finally {
    process.chdir(cwd);
  }
  const after = readFileSync(systemMapPath, 'utf8');
  rmSync(root, { recursive: true, force: true });
  assert.equal(before.includes('src/context-governor-trace.ts'), false);
  assert.equal(before.includes('src/context-governor-trace-capture.ts'), false);
  assert.equal(result.added >= 4, true);
  assert.equal(after.includes('src/context-governor-trace.ts'), true);
  assert.equal(after.includes('src/context-governor-trace-capture.ts'), true);
  assert.equal(after.includes('test/benchmark-context-governor-trace.ts'), true);
  assert.equal(after.includes('test/phase32-trace-benchmark.test.ts'), true);
  assert.equal(existsSync(root), false);
});
