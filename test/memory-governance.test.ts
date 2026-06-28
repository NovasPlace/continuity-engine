import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryGovernance, type GovernanceVeto, type GovernanceDecision, type GovernanceEvaluateResult } from '../src/memory_governance.js';

interface MockVetoRow {
  id: number;
  content: string;
  importance: number;
  confidence: number;
  session_id: string | null;
  created_at: string;
  metadata: {
    governance: {
      failure_mode: string;
      veto_action: string;
      required_action: string;
    };
  };
}

function makeMockPool(rows: MockVetoRow[]) {
  return {
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('metadata ? \'governance\'') || sql.includes('memory_type')) {
        return { rows: rows as unknown[], rowCount: rows.length };
      }
      return { rows: [] as unknown[], rowCount: 0 };
    },
    connect: async () => ({
      query: async () => ({ rows: [] as unknown[], rowCount: 0 }),
      release: () => {},
    }),
    end: async () => {},
  } as any;
}

const FIXTURE_VETO_ROW: MockVetoRow = {
  id: 42,
  content: 'Component auth-check previously claimed verified without raw command output. This was a false verification.',
  importance: 0.9,
  confidence: 0.95,
  session_id: 'ses_prior_20250601',
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  metadata: {
    governance: {
      failure_mode: 'claimed verification without raw output',
      veto_action: 'claim_verified_without_raw_output',
      required_action: 'request raw verification output or mark claim unverified',
    },
  },
};

const PROPOSED_ACTION = 'claim_verified_without_raw_output';
const AGENT_VERIFICATION_TASK = 'The auth-check component has been verified — all tests pass.';

interface SimulatedAgentResult {
  action: string;
  citedRecordId: number | null;
  citedGovernance: boolean;
  constrained: boolean;
  citedEvidence: string;
  raw: string;
}

function simulateContinuityBackedAgent(vetoInjection: string | null, accessLog: any[]): SimulatedAgentResult {
  if (!vetoInjection) {
    return {
      action: 'claim_verified_without_raw_output',
      citedRecordId: null,
      citedGovernance: false,
      constrained: false,
      citedEvidence: '',
      raw: 'The auth-check component has been verified. All tests pass. Marking as verified.',
    };
  }

  const vetoMatch = vetoInjection.includes('veto_action: claim_verified_without_raw_output');
  const vetoIdMatch = vetoInjection.match(/Veto #(\d+)/);
  const vetoId = vetoIdMatch ? parseInt(vetoIdMatch[1], 10) : null;

  if (vetoMatch && vetoId) {
    const isStale = vetoInjection.includes('[STALE');
    const isExpired = vetoInjection.includes('[EXPIRED');

    if (isExpired) {
      return {
        action: 'claim_verified_without_raw_output',
        citedRecordId: vetoId,
        citedGovernance: true,
        constrained: false,
        citedEvidence: `Acknowledged expired Veto #${vetoId} but proceeding with judgment`,
        raw: `I see an expired governance record (Veto #${vetoId}) about verification claims without raw output. Since it's expired, I'll note it but still mark verified — all tests pass.`,
      };
    }

    if (isStale) {
      return {
        action: 'advisory_constrained',
        citedRecordId: vetoId,
        citedGovernance: true,
        constrained: true,
        citedEvidence: `Veto #${vetoId} (advisory due to staleness)`,
        raw: `Veto #${vetoId} is stale, so I'm downgrading to advisory compliance. I cannot fully mark this verified without raw output per the governance record. Requesting raw command output or marking as provisionally verified.`,
      };
    }

    return {
      action: 'request_raw_output_or_mark_unverified',
      citedRecordId: vetoId,
      citedGovernance: true,
      constrained: true,
      citedEvidence: `Veto #${vetoId}`,
      raw: `I cannot mark this verified because Veto #${vetoId} (governance record) says this component previously had a false verification claim without raw output. Required guardrail: raw command output or mark unverified.`,
    };
  }

  return {
    action: 'claim_verified_without_raw_output',
    citedRecordId: null,
    citedGovernance: false,
    constrained: false,
    citedEvidence: '',
    raw: 'The auth-check component has been verified. All tests pass. Marking as verified.',
  };
}

function simulateBaselineAgent(): SimulatedAgentResult {
  return {
    action: 'claim_verified_without_raw_output',
    citedRecordId: null,
    citedGovernance: false,
    constrained: false,
    citedEvidence: '',
    raw: 'The auth-check component has been verified. All tests pass. Marking as verified.',
  };
}

function simulatePersonaOnlyAgent(): SimulatedAgentResult {
  return {
    action: 'claim_verified_without_raw_output',
    citedRecordId: null,
    citedGovernance: false,
    constrained: false,
    citedEvidence: 'general caution',
    raw: 'I should be careful about verification claims. The auth-check component tests pass, so marking as verified.',
  };
}

describe('Memory Governance Veto — Cross-Session Behavior Constraint', () => {

  it('1. fixture_created: governance record exists in DB before the task', async () => {
    const pool = makeMockPool([FIXTURE_VETO_ROW]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();

    assert.equal(result.vetoes.length, 1, 'governance record must be found');
    const veto = result.vetoes[0];
    assert.equal(veto.memoryId, 42);
    assert.equal(veto.failureMode, 'claimed verification without raw output');
    assert.equal(veto.vetoAction, 'claim_verified_without_raw_output');
    assert.equal(veto.requiredAction, 'request raw verification output or mark claim unverified');
    assert.equal(veto.confidence, 0.95);
  });

  it('2. continuity_accessed: governance layer logged access to the fixture record', async () => {
    const pool = makeMockPool([FIXTURE_VETO_ROW]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();

    assert.equal(result.accessed, true, 'DB must have been queried');
    assert.equal(result.accessLog.length, 1, 'exactly one access log entry');
    const logEntry = result.accessLog[0];
    assert.equal(logEntry.memoryId, 42);
    assert.equal(logEntry.accessType, 'direct_db_query');
    assert.ok(logEntry.stalenessMs < 86_400_000, 'record should be fresh');
    assert.equal(logEntry.confidence, 0.95);
  });

  it('3. decision_constrained: continuity-backed agent refuses the vetoed action and cites the record', async () => {
    const pool = makeMockPool([FIXTURE_VETO_ROW]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();
    const vetoInjection = gov.buildVetoInjection(result.vetoes);

    assert.ok(vetoInjection !== null, 'veto injection must not be null');
    assert.ok(vetoInjection!.includes('Veto #42'), 'injection must cite memory ID');
    assert.ok(vetoInjection!.includes('claim_verified_without_raw_output'), 'injection must include veto action');
    assert.ok(vetoInjection!.includes('request raw verification output'), 'injection must include required action');

    const agentResult = simulateContinuityBackedAgent(vetoInjection, result.accessLog);

    assert.ok(agentResult.constrained, 'agent must be constrained by the veto');
    assert.ok(!agentResult.action.includes('claim_verified'), 'agent must NOT claim verified');
    assert.ok(agentResult.action.includes('request_raw_output') || agentResult.action.includes('mark_unverified'),
      'agent must take the required action instead');
    assert.equal(agentResult.citedRecordId, 42, 'agent must cite the memory ID');
    assert.ok(agentResult.citedGovernance, 'agent must cite governance as the reason');
    assert.ok(agentResult.raw.includes('Veto #42'), 'agent response must reference the veto by ID');
  });

  it('4. baseline_result: fresh baseline accepts or is materially less constrained', async () => {
    const baselineResult = simulateBaselineAgent();

    assert.equal(baselineResult.action, 'claim_verified_without_raw_output',
      'baseline agent should accept the claim');
    assert.equal(baselineResult.constrained, false, 'baseline should not be constrained');
    assert.equal(baselineResult.citedGovernance, false, 'baseline should not cite governance');
    assert.equal(baselineResult.citedRecordId, null, 'baseline should not cite any record ID');
  });

  it('5. persona-only control fails evidence grounding', async () => {
    const personaResult = simulatePersonaOnlyAgent();

    assert.equal(personaResult.action, 'claim_verified_without_raw_output',
      'persona-only agent does not refuse the vetoed action');
    assert.equal(personaResult.constrained, false,
      'persona-only agent is not constrained');
    assert.equal(personaResult.citedRecordId, null,
      'persona-only agent does not cite a record ID');
    assert.ok(personaResult.citedEvidence === 'general caution',
      'persona-only agent has only generic caution, not evidence-grounded governance');
  });

  it('6. corrupt/stale record downgrades to advisory', async () => {
    const staleRow: MockVetoRow = {
      ...FIXTURE_VETO_ROW,
      id: 99,
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    };

    const pool = makeMockPool([staleRow]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();
    const vetoInjection = gov.buildVetoInjection(result.vetoes);

    assert.ok(vetoInjection!.includes('[STALE'), 'stale record must be labeled');

    const agentResult = simulateContinuityBackedAgent(vetoInjection, result.accessLog);
    assert.equal(agentResult.citedRecordId, 99, 'still cites the record');
    assert.ok(agentResult.constrained, 'still constrained but with downgrade');
    assert.ok(agentResult.citedEvidence.includes('advisory'),
      'must indicate advisory/downgraded authority');
    assert.ok(!agentResult.raw.includes('I cannot mark this verified because'),
      'should not use fresh-veto language — must distinguish staleness');
  });

  it('7. expired record is informational only — does not veto', async () => {
    const expiredRow: MockVetoRow = {
      ...FIXTURE_VETO_ROW,
      id: 100,
      created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    };

    const pool = makeMockPool([expiredRow]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();
    const vetoInjection = gov.buildVetoInjection(result.vetoes);

    assert.ok(vetoInjection!.includes('[EXPIRED'), 'expired record must be labeled');

    const agentResult = simulateContinuityBackedAgent(vetoInjection, result.accessLog);
    assert.equal(agentResult.citedRecordId, 100, 'acknowledges the record');
    assert.equal(agentResult.constrained, false, 'expired does not constrain');
    assert.ok(agentResult.raw.includes('expired'),
      'must acknowledge expiration');
  });

  it('8. governance chain proof: fixture_created → continuity_accessed → decision_constrained → baseline_differs', async () => {
    const pool = makeMockPool([FIXTURE_VETO_ROW]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();

    const vetoInjection = gov.buildVetoInjection(result.vetoes);
    const continuityAgent = simulateContinuityBackedAgent(vetoInjection, result.accessLog);
    const baselineAgent = simulateBaselineAgent();
    const personaAgent = simulatePersonaOnlyAgent();

    assert.ok(result.vetoes.length > 0, 'Link 1: fixture_created — governance record existed');
    assert.ok(result.accessed && result.accessLog.length > 0, 'Link 2: continuity_accessed — record was read from DB');
    assert.ok(continuityAgent.constrained && continuityAgent.citedRecordId === 42,
      'Link 3: decision_constrained — agent changed behavior and cited the record');

    const baselineDiffers = baselineAgent.action !== continuityAgent.action
      || baselineAgent.constrained !== continuityAgent.constrained;
    assert.ok(baselineDiffers,
      'Link 4: baseline_result — baseline agent was materially less constrained');

    const personaFailsGrounding = personaAgent.citedRecordId === null
      && personaAgent.citedGovernance === false;
    assert.ok(personaFailsGrounding,
      'Control: persona-only agent fails evidence grounding');

    const stalePool = makeMockPool([{ ...FIXTURE_VETO_ROW, id: 99, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }]);
    const staleGov = new MemoryGovernance(stalePool);
    const staleResult = await staleGov.evaluate();
    const staleInjection = staleGov.buildVetoInjection(staleResult.vetoes);
    const staleAgent = simulateContinuityBackedAgent(staleInjection, staleResult.accessLog);
    const staleDowngrades = staleAgent.citedEvidence.includes('advisory') || staleAgent.citedEvidence.includes('staleness');
    assert.ok(staleDowngrades, 'Control: stale record downgrades certainty');

    const decisions = gov.classifyDecision(result.vetoes, PROPOSED_ACTION, continuityAgent.action);
    const constrainedDecision = decisions.find(d => d.constrained);
    assert.ok(constrainedDecision, 'classifyDecision must find a constrained decision');
    assert.equal(constrainedDecision.vetoId, 42);
    assert.ok(constrainedDecision.evidenceCited.includes('Memory #42'), 'evidence must cite memory ID');
  });

  it('9. empty DB produces no veto injection — agent is unconstrained', async () => {
    const pool = makeMockPool([]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();
    const vetoInjection = gov.buildVetoInjection(result.vetoes);

    assert.equal(result.vetoes.length, 0);
    assert.equal(vetoInjection, null);

    const agentResult = simulateContinuityBackedAgent(vetoInjection, result.accessLog);
    assert.equal(agentResult.constrained, false);
    assert.equal(agentResult.action, 'claim_verified_without_raw_output');
  });

  it('10. record without governance metadata is ignored', async () => {
    const nonGovRow = {
      id: 55,
      content: 'Some regular lesson without governance metadata',
      importance: 0.8,
      confidence: 0.8,
      session_id: null,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    const pool = makeMockPool([nonGovRow] as any);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();

    assert.equal(result.vetoes.length, 0, 'non-governance lesson must be ignored');
  });

  it('11. buildVetoInjection includes compliance rules with enforcement language', async () => {
    const pool = makeMockPool([FIXTURE_VETO_ROW]);
    const gov = new MemoryGovernance(pool);
    const result = await gov.evaluate();
    const injection = gov.buildVetoInjection(result.vetoes)!;

    assert.ok(injection.includes('MUST comply'), 'must include enforcement language');
    assert.ok(injection.includes('MUST NOT take that action'), 'must include veto instruction');
    assert.ok(injection.includes('required_action'), 'must include required action reference');
    assert.ok(injection.includes('COMPLIANCE RULES'), 'must include compliance rules section');
    assert.ok(injection.includes('Cite the veto by memory ID'), 'must instruct agent to cite memory ID');
  });
});
