import { join } from 'path';
import { ContextBudgetGovernor } from '../context-budget-governor.js';
import { EvidenceVault } from '../evidence-vault.js';
import type { PluginContext } from '../plugin-context.js';

interface ShellHookInput {
  tool?: string;
  args?: Record<string, unknown>;
}

interface ShellHookOutput {
  output?: unknown;
  metadata?: Record<string, unknown>;
}

function textOutput(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function exitCode(output: ShellHookOutput): number {
  const code = output.metadata?.exitCode;
  return typeof code === 'number' ? code : 0;
}

function evidenceRoot(ctx: PluginContext): string {
  return join(ctx.directory, 'artifacts', 'evidence');
}

export async function packageCommandEvidence(
  ctx: PluginContext,
  input: ShellHookInput,
  output: ShellHookOutput,
): Promise<Record<string, unknown> | null> {
  if (input.tool !== 'bash') return null;
  const command = String(input.args?.command ?? 'unknown');
  const governor = new ContextBudgetGovernor(
    new EvidenceVault({ rootDir: evidenceRoot(ctx) }),
  );
  const packaged = await governor.packageShellOutput({
    command,
    cwd: ctx.directory,
    exitCode: exitCode(output),
    stdout: textOutput(output.output),
    stderr: typeof output.metadata?.stderr === 'string' ? output.metadata.stderr : undefined,
    latestUserText: command,
    finalProofRequired: /npm\.cmd test|npm test|typecheck|build|verify/i.test(command),
  });

  return {
    command: command.substring(0, 500),
    exitCode: exitCode(output),
    contextBudget: packaged.decision,
    evidenceRef: packaged.distilled?.displayRef,
    tokensAvoided: packaged.distilled?.tokensAvoided ?? 0,
    promptPayload: packaged.promptPayload.substring(0, 1000),
  };
}
