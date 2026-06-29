import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { estimateTokens } from './token-bucket-analyzer.js';

export interface EvidenceRecordInput {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface EvidenceRecord extends EvidenceRecordInput {
  id: string;
  evidenceRef: string;
  rawTokens: number;
}

export interface EvidenceVaultOptions {
  rootDir?: string;
  now?: () => Date;
}

const DEFAULT_ROOT = join(process.cwd(), 'artifacts', 'evidence');

export class EvidenceVault {
  private rootDir: string;
  private now: () => Date;

  constructor(options: EvidenceVaultOptions = {}) {
    this.rootDir = options.rootDir ?? DEFAULT_ROOT;
    this.now = options.now ?? (() => new Date());
  }

  async store(input: EvidenceRecordInput): Promise<EvidenceRecord> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const id = this.buildId(input.command);
    const evidenceRef = join(this.rootDir, `${id}.json`);
    const record: EvidenceRecord = {
      ...input,
      id,
      evidenceRef,
      rawTokens: estimateTokens(`${input.stdout}\n${input.stderr ?? ''}`),
      startedAt: input.startedAt ?? this.now().toISOString(),
      endedAt: input.endedAt ?? this.now().toISOString(),
    };
    await fs.writeFile(evidenceRef, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return record;
  }

  async read(evidenceRef: string): Promise<EvidenceRecord> {
    const raw = await fs.readFile(evidenceRef, 'utf-8');
    return JSON.parse(raw) as EvidenceRecord;
  }

  toDisplayRef(evidenceRef: string, baseDir = process.cwd()): string {
    return relative(baseDir, evidenceRef).replace(/\\/g, '/');
  }

  private buildId(command: string): string {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const slug = command.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${stamp}-${slug || 'command'}-${suffix}`;
  }
}
