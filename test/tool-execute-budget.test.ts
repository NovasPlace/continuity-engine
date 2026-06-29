import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { packageCommandEvidence } from '../src/hooks/tool-execute-budget.js';
import type { PluginContext } from '../src/plugin-context.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'csm-hook-budget-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function context(): PluginContext {
  return { directory: tempDir } as PluginContext;
}

describe('tool execute budget adapter', () => {
  it('packages bash output as compact evidence metadata', async () => {
    const metadata = await packageCommandEvidence(
      context(),
      { tool: 'bash', args: { command: 'rg needle src' } },
      {
        output: Array.from({ length: 80 }, (_, index) => `line ${index}`).join('\n'),
        metadata: { exitCode: 0 },
      },
    );

    assert.ok(metadata);
    assert.equal(metadata.command, 'rg needle src');
    assert.equal(metadata.exitCode, 0);
    assert.equal(typeof metadata.evidenceRef, 'string');
    assert.equal((metadata.tokensAvoided as number) > 0, true);
    assert.match(String(metadata.promptPayload), /evidence_ref:/);
    assert.doesNotMatch(String(metadata.promptPayload), /line 0\nline 1\nline 2/);
  });

  it('ignores non-bash tools', async () => {
    const metadata = await packageCommandEvidence(
      context(),
      { tool: 'read', args: { filePath: 'src/index.ts' } },
      { output: 'file content', metadata: { exitCode: 0 } },
    );

    assert.equal(metadata, null);
  });
});
