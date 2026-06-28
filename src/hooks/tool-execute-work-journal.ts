import type { PluginContext } from '../plugin-context.js';

export function createToolExecuteAfterWorkJournalHook(ctx: PluginContext) {
  return async (input: any, output: any) => {
    try {
      ctx.syncActiveSession(input.sessionID);
      const sid = ctx.state.currentSessionId;

      if (!sid || !ctx.config.workJournal?.enabled) return;

      const filePath =
        (input.args?.filePath as string) ??
        (input.args?.path as string) ??
        undefined;

      ctx.workJournal.recordToolCall({
        sessionId: sid,
        projectId: ctx.directory,
        toolName: input.tool as string,
        args: input.args ?? {},
        output: typeof output.output === 'string'
          ? output.output.substring(0, 2000)
          : JSON.stringify(output.output ?? '').substring(0, 2000),
        error: output.metadata?.error as string | undefined,
        exitCode: output.metadata?.exitCode as number | undefined,
      });

      ctx.workJournal.updateTokenSnapshot(output.metadata?.tokenCount ?? 0);
    } catch (error) {
      console.error('[WorkJournal] Tool execution hook error:', error);
    }
  };
}
