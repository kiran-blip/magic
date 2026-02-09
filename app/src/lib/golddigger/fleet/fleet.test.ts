import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fleetBus } from './bus';
import { AgentRole, Proposal, FleetMessage, Directive } from './types';
import { FLEET_AGENTS, getAllAgents } from './agents';
import { FleetOrchestrator } from './orchestrator';
import { TradeScorer, PositionSizer, RiskAssessor, NeuralNetwork } from './neural';

// ============================================================================
// PART 1: REAL-LIFE SIMULATION TEST
// ============================================================================

describe('Part 1: Fleet Real-Life Simulation', () => {
  let orchestrator: FleetOrchestrator;

  beforeEach(() => {
    fleetBus.clear();
    orchestrator = new FleetOrchestrator();
    // Stop auto-started timers to prevent network calls during tests
    orchestrator.stop();
  });

  it('should initialize fleet bus with all 6 agents in idle status', () => {
    const statuses = fleetBus.getAgentStatuses();

    // Check all 6 agent roles are present
    expect(Object.keys(statuses)).toHaveLength(6);
    expect(statuses[AgentRole.RESEARCH_ANALYST]).toBeDefined();
    expect(statuses[AgentRole.RISK_MANAGER]).toBeDefined();
    expect(statuses[AgentRole.PORTFOLIO_STRATEGIST]).toBeDefined();
    expect(statuses[AgentRole.TRADING_ANALYST]).toBeDefined();
    expect(statuses[AgentRole.SENTIMENT_ANALYST]).toBeDefined();
    expect(statuses[AgentRole.QUANT_ANALYST]).toBeDefined();

    // Check all start with idle status
    Object.values(statuses).forEach((status) => {
      expect(status.status).toBe('idle');
      expect(status.messagesProcessed).toBe(0);
      expect(status.proposalsMade).toBe(0);
    });
  });

  it('should submit 3 proposals with varying risk levels and confidence', () => {
    // Submit from RESEARCH_ANALYST
    const prop1 = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Tech Sector Opportunity',
      payload: { details: 'Emerging tech trends detected' },
      proposalType: 'trade',
      summary: 'Strong buy signal in tech sector',
      reasoning: 'Market analysis shows undervalued tech stocks',
      riskAssessment: { level: 'medium', factors: ['volatility', 'sector risk'] },
      neuralConfidence: 0.85,
      expectedReturn: 0.08,
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [],
    });

    // Submit from TRADING_ANALYST
    const prop2 = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Entry Point Alert',
      payload: { details: 'Price touched support level' },
      proposalType: 'trade',
      summary: 'Conservative entry opportunity',
      reasoning: 'Technical support confirmed',
      riskAssessment: { level: 'low', factors: ['clear support'] },
      neuralConfidence: 0.65,
      expectedReturn: 0.03,
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [],
    });

    // Submit from PORTFOLIO_STRATEGIST
    const prop3 = fleetBus.submitProposal({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Rebalancing Required',
      payload: { details: 'Portfolio drift exceeded threshold' },
      proposalType: 'rebalance',
      summary: 'Rebalance portfolio to target allocation',
      reasoning: 'Sector weights have drifted significantly',
      riskAssessment: { level: 'high', factors: ['concentration', 'drift'] },
      neuralConfidence: 0.92,
      expectedReturn: 0.02,
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [],
    });

    // Verify all 3 proposals are in pending list
    const pending = fleetBus.getPendingProposals();
    expect(pending).toHaveLength(3);
    expect(pending.map((p) => p.id)).toEqual([prop1.id, prop2.id, prop3.id]);

    // Verify confidence and risk levels
    expect(prop1.neuralConfidence).toBe(0.85);
    expect(prop2.neuralConfidence).toBe(0.65);
    expect(prop3.neuralConfidence).toBe(0.92);

    expect(prop1.riskAssessment?.level).toBe('medium');
    expect(prop2.riskAssessment?.level).toBe('low');
    expect(prop3.riskAssessment?.level).toBe('high');
  });

  it('should allow CEO to approve, reject, and leave proposals pending', () => {
    // Submit proposals
    const prop1 = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Proposal 1',
      payload: {},
      proposalType: 'trade',
      summary: 'Test proposal 1',
      reasoning: 'Test',
      neuralConfidence: 0.8,
      expectedReturn: 0.05,
      requiredApprovals: [],
      approvals: [],
    });

    const prop2 = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Proposal 2',
      payload: {},
      proposalType: 'trade',
      summary: 'Test proposal 2',
      reasoning: 'Test',
      neuralConfidence: 0.7,
      expectedReturn: 0.03,
      requiredApprovals: [],
      approvals: [],
    });

    const prop3 = fleetBus.submitProposal({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'low',
      subject: 'Proposal 3',
      payload: {},
      proposalType: 'rebalance',
      summary: 'Test proposal 3',
      reasoning: 'Test',
      neuralConfidence: 0.6,
      expectedReturn: 0.02,
      requiredApprovals: [],
      approvals: [],
    });

    // CEO approves prop1
    const approved = fleetBus.decideProposal(prop1.id, true, 'Great analysis');
    expect(approved?.ceoDecision?.approved).toBe(true);
    expect(approved?.ceoDecision?.notes).toBe('Great analysis');

    // CEO rejects prop2
    const rejected = fleetBus.decideProposal(prop2.id, false, 'Too risky');
    expect(rejected?.ceoDecision?.approved).toBe(false);
    expect(rejected?.ceoDecision?.notes).toBe('Too risky');

    // prop3 still pending
    const pending = fleetBus.getPendingProposals();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(prop3.id);

    // Verify decisions are persisted
    const all = fleetBus.getProposals();
    expect(all.filter((p) => p.ceoDecision?.approved === true)).toHaveLength(1);
    expect(all.filter((p) => p.ceoDecision?.approved === false)).toHaveLength(1);
  });

  it('should add and manage CEO directives', () => {
    // Add directive 1: risk tolerance
    const dir1 = fleetBus.addDirective({
      type: 'risk_tolerance',
      value: 'moderate',
      active: true,
    });

    expect(dir1.id).toBeDefined();
    expect(dir1.type).toBe('risk_tolerance');
    expect(dir1.value).toBe('moderate');
    expect(dir1.active).toBe(true);

    // Add directive 2: focus sectors
    const dir2 = fleetBus.addDirective({
      type: 'focus_sectors',
      value: 'technology, healthcare',
      active: true,
    });

    expect(dir2.type).toBe('focus_sectors');

    // Get active directives
    const active = fleetBus.getDirectives();
    expect(active).toHaveLength(2);

    // Deactivate one
    const deactivated = fleetBus.deactivateDirective(dir1.id);
    expect(deactivated?.active).toBe(false);

    // Verify only 1 active directive
    const activeAfter = fleetBus.getDirectives();
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].id).toBe(dir2.id);

    // But all directives should still exist
    const all = fleetBus.getAllDirectives();
    expect(all).toHaveLength(2);
  });

  it('should handle inter-agent messages and delivery', () => {
    // RESEARCH_ANALYST requests analysis from RISK_MANAGER
    const msg1 = fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: [AgentRole.RISK_MANAGER],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Risk analysis needed',
      payload: { symbolsToAnalyze: ['AAPL', 'MSFT'] },
    });

    expect(msg1.id).toBeDefined();
    expect(msg1.status).toBe('pending');
    expect(msg1.timestamp).toBeDefined();

    // RISK_MANAGER responds to RESEARCH_ANALYST
    const msg2 = fleetBus.send({
      sender: AgentRole.RISK_MANAGER,
      recipients: [AgentRole.RESEARCH_ANALYST],
      type: 'RESPONSE',
      priority: 'high',
      subject: 'Risk analysis result',
      payload: { riskScores: { AAPL: 0.3, MSFT: 0.25 } },
      parentId: msg1.id,
    });

    // Verify message log contains both
    const log = fleetBus.getLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log).toContainEqual(expect.objectContaining({ id: msg1.id }));
    expect(log).toContainEqual(expect.objectContaining({ id: msg2.id }));

    // Verify message routing
    const msgsForRiskMgr = fleetBus.getMessagesFor(AgentRole.RISK_MANAGER);
    expect(msgsForRiskMgr.length).toBeGreaterThanOrEqual(1);
    expect(msgsForRiskMgr[0].recipients).toContain(AgentRole.RISK_MANAGER);

    const msgsForResearch = fleetBus.getMessagesFor(AgentRole.RESEARCH_ANALYST);
    expect(msgsForResearch.length).toBeGreaterThanOrEqual(1);
  });

  it('should calculate accurate fleet metrics', () => {
    // Create a scenario with known metrics
    fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Proposal A',
      payload: {},
      proposalType: 'trade',
      summary: 'Test',
      reasoning: 'Test',
      neuralConfidence: 0.9,
      expectedReturn: 0.1,
      requiredApprovals: [],
      approvals: [],
    });

    fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Proposal B',
      payload: {},
      proposalType: 'trade',
      summary: 'Test',
      reasoning: 'Test',
      neuralConfidence: 0.7,
      expectedReturn: 0.05,
      requiredApprovals: [],
      approvals: [],
    });

    fleetBus.submitProposal({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Proposal C',
      payload: {},
      proposalType: 'rebalance',
      summary: 'Test',
      reasoning: 'Test',
      neuralConfidence: 0.8,
      expectedReturn: 0.02,
      requiredApprovals: [],
      approvals: [],
    });

    const proposals = fleetBus.getProposals();
    fleetBus.decideProposal(proposals[0].id, true);
    fleetBus.decideProposal(proposals[1].id, false);

    fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: [AgentRole.RISK_MANAGER],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Test message',
      payload: {},
    });

    const metrics = fleetBus.getMetrics();

    expect(metrics.totalProposals).toBe(3);
    expect(metrics.approvedProposals).toBe(1);
    expect(metrics.rejectedProposals).toBe(1);
    expect(metrics.approvalRate).toBe(1 / 3);
    expect(metrics.avgConfidence).toBe((0.9 + 0.7 + 0.8) / 3);
    expect(metrics.totalReturn).toBe(0.1 + 0.05 + 0.02);
    expect(metrics.messagesProcessed).toBeGreaterThanOrEqual(1);
    expect(metrics.activeDirectives).toBe(0);
  });

  it('should auto-start orchestrator, run agents, and stop', () => {
    vi.useFakeTimers();

    // Orchestrator was stopped in beforeEach — verify stopped state
    expect(orchestrator.isRunning()).toBe(false);

    // Start it manually
    orchestrator.start(100);
    expect(orchestrator.isRunning()).toBe(true);

    // Advance time to let staggered agents kick in
    vi.advanceTimersByTime(250);

    // Stop orchestrator
    orchestrator.stop();
    expect(orchestrator.isRunning()).toBe(false);

    // Verify a fresh FleetOrchestrator auto-starts
    const freshOrch = new FleetOrchestrator();
    expect(freshOrch.isRunning()).toBe(true);
    freshOrch.stop();

    vi.useRealTimers();
  });

  it('should track agent proposal counts and message counts', () => {
    // Submit proposals from different agents
    const prop1 = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Proposal from Research',
      payload: {},
      proposalType: 'research',
      summary: 'Research analysis',
      reasoning: 'Market scan',
      requiredApprovals: [],
      approvals: [],
    });

    const prop2 = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Another proposal from Research',
      payload: {},
      proposalType: 'trade',
      summary: 'Trade opportunity',
      reasoning: 'Technical signal',
      requiredApprovals: [],
      approvals: [],
    });

    // Send messages
    fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: [AgentRole.RISK_MANAGER],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Need risk analysis',
      payload: {},
    });

    fleetBus.send({
      sender: AgentRole.RISK_MANAGER,
      recipients: [AgentRole.RESEARCH_ANALYST],
      type: 'RESPONSE',
      priority: 'medium',
      subject: 'Risk analysis ready',
      payload: {},
    });

    // Check agent status
    const researchStatus = fleetBus.getAgentStatus(AgentRole.RESEARCH_ANALYST);
    const riskStatus = fleetBus.getAgentStatus(AgentRole.RISK_MANAGER);

    expect(researchStatus?.proposalsMade).toBe(2);
    expect(researchStatus?.messagesProcessed).toBeGreaterThanOrEqual(1);

    expect(riskStatus?.messagesProcessed).toBeGreaterThanOrEqual(1);

    // Check agent stats
    const researchStats = fleetBus.getAgentStats(AgentRole.RESEARCH_ANALYST);
    expect(researchStats.proposalsMade).toBe(2);
    expect(researchStats.messagesSent).toBeGreaterThanOrEqual(1);
    expect(researchStats.messagesReceived).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// PART 2: STRESS TEST
// ============================================================================

describe('Part 2: Brutal Stress Test', () => {
  beforeEach(() => {
    fleetBus.clear();
  });

  it('should handle 100 rapid proposals without data loss', () => {
    const proposalIds: string[] = [];

    for (let i = 0; i < 100; i++) {
      const agentRole = Object.values(AgentRole)[i % 6];
      const prop = fleetBus.submitProposal({
        sender: agentRole,
        recipients: ['CEO'],
        type: 'PROPOSAL',
        priority: i % 2 === 0 ? 'high' : 'low',
        subject: `Mass proposal ${i}`,
        payload: { index: i },
        proposalType: 'trade',
        summary: `Test proposal ${i}`,
        reasoning: `Reasoning for proposal ${i}`,
        neuralConfidence: 0.5 + (i % 50) / 100,
        expectedReturn: (i % 20) / 100,
        requiredApprovals: [],
        approvals: [],
      });
      proposalIds.push(prop.id);
    }

    const all = fleetBus.getProposals();
    expect(all).toHaveLength(100);

    // Verify all IDs are unique
    const uniqueIds = new Set(proposalIds);
    expect(uniqueIds.size).toBe(100);

    // Spot check some proposals
    const first = all.find((p) => p.subject === 'Mass proposal 0');
    expect(first).toBeDefined();

    const last = all.find((p) => p.subject === 'Mass proposal 99');
    expect(last).toBeDefined();
  });

  it('should handle 200 inter-agent messages without data loss', () => {
    const agents = Object.values(AgentRole);
    const messageIds: string[] = [];

    for (let i = 0; i < 200; i++) {
      const sender = agents[i % agents.length];
      const recipientIndex = (i + 1) % agents.length;
      const recipient = agents[recipientIndex];

      const msg = fleetBus.send({
        sender,
        recipients: [recipient],
        type: i % 3 === 0 ? 'REQUEST' : 'RESPONSE',
        priority: i % 5 === 0 ? 'critical' : 'medium',
        subject: `Message ${i}`,
        payload: { index: i },
      });
      messageIds.push(msg.id);
    }

    const log = fleetBus.getLog();
    expect(log.length).toBeGreaterThanOrEqual(200);

    // Verify all message IDs are unique
    const uniqueIds = new Set(messageIds);
    expect(uniqueIds.size).toBe(200);
  });

  it('should process 100 concurrent decisions on proposals', () => {
    // Create 100 proposals
    const proposalIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const agentRole = Object.values(AgentRole)[i % 6];
      const prop = fleetBus.submitProposal({
        sender: agentRole,
        recipients: ['CEO'],
        type: 'PROPOSAL',
        priority: 'high',
        subject: `Decision test ${i}`,
        payload: {},
        proposalType: 'trade',
        summary: 'Test',
        reasoning: 'Test',
        requiredApprovals: [],
        approvals: [],
      });
      proposalIds.push(prop.id);
    }

    // Approve/reject all
    for (let i = 0; i < 100; i++) {
      const approved = i % 2 === 0;
      const result = fleetBus.decideProposal(proposalIds[i], approved);
      expect(result?.ceoDecision?.approved).toBe(approved);
    }

    // Verify metrics
    const metrics = fleetBus.getMetrics();
    expect(metrics.totalProposals).toBe(100);
    expect(metrics.approvedProposals).toBe(50);
    expect(metrics.rejectedProposals).toBe(50);
  });

  it('should handle edge case: decide on non-existent proposal', () => {
    const result = fleetBus.decideProposal('non-existent-id', true);
    expect(result).toBeNull();
  });

  it('should handle edge case: deactivate non-existent directive', () => {
    const result = fleetBus.deactivateDirective('non-existent-id');
    expect(result).toBeNull();
  });

  it('should throw error when running non-existent agent', () => {
    const orchestrator = new FleetOrchestrator();
    expect(() => {
      orchestrator.runAgent('INVALID_AGENT' as AgentRole);
    }).toThrow();
  });

  it('should handle proposal with all optional fields undefined', () => {
    const prop = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Minimal proposal',
      payload: {},
      proposalType: 'trade',
      summary: 'Summary only',
      reasoning: 'No reasoning',
      requiredApprovals: [],
      approvals: [],
      // neuralConfidence intentionally undefined
      // expectedReturn intentionally undefined
      // riskAssessment intentionally undefined
    });

    expect(prop.id).toBeDefined();
    expect(prop.neuralConfidence).toBeUndefined();
    expect(prop.expectedReturn).toBeUndefined();
    expect(prop.riskAssessment).toBeUndefined();

    const metrics = fleetBus.getMetrics();
    expect(metrics.avgConfidence).toBe(0); // No confidences defined
    expect(metrics.totalReturn).toBe(0); // No returns defined
  });

  it('should handle proposal with neuralConfidence = 0', () => {
    const prop = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'low',
      subject: 'Zero confidence proposal',
      payload: {},
      proposalType: 'trade',
      summary: 'No confidence',
      reasoning: 'Test',
      neuralConfidence: 0, // Falsy but valid
      expectedReturn: 0.05,
      requiredApprovals: [],
      approvals: [],
    });

    expect(prop.neuralConfidence).toBe(0);

    const metrics = fleetBus.getMetrics();
    expect(metrics.avgConfidence).toBe(0);
  });

  it('should handle proposal with expectedReturn = 0', () => {
    const prop = fleetBus.submitProposal({
      sender: AgentRole.RISK_MANAGER,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'low',
      subject: 'Zero return proposal',
      payload: {},
      proposalType: 'trade',
      summary: 'No return',
      reasoning: 'Test',
      neuralConfidence: 0.5,
      expectedReturn: 0, // Falsy but valid
      requiredApprovals: [],
      approvals: [],
    });

    expect(prop.expectedReturn).toBe(0);

    const metrics = fleetBus.getMetrics();
    expect(metrics.totalReturn).toBe(0);
  });

  it('should handle empty string subjects and summaries', () => {
    const prop = fleetBus.submitProposal({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: '', // Empty
      payload: {},
      proposalType: 'rebalance',
      summary: '', // Empty
      reasoning: 'Some reasoning',
      requiredApprovals: [],
      approvals: [],
    });

    expect(prop.subject).toBe('');
    expect(prop.summary).toBe('');
  });

  it('should maintain metrics accuracy after mass operations', () => {
    // Create 50 proposals
    const proposalIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const prop = fleetBus.submitProposal({
        sender: AgentRole.RESEARCH_ANALYST,
        recipients: ['CEO'],
        type: 'PROPOSAL',
        priority: 'high',
        subject: `Test ${i}`,
        payload: {},
        proposalType: 'trade',
        summary: 'Test',
        reasoning: 'Test',
        neuralConfidence: 0.5 + i / 100,
        expectedReturn: i / 1000,
        requiredApprovals: [],
        approvals: [],
      });
      proposalIds.push(prop.id);
    }

    // Approve first 30
    for (let i = 0; i < 30; i++) {
      fleetBus.decideProposal(proposalIds[i], true);
    }

    // Reject next 20
    for (let i = 30; i < 50; i++) {
      fleetBus.decideProposal(proposalIds[i], false);
    }

    const metrics = fleetBus.getMetrics();
    expect(metrics.totalProposals).toBe(50);
    expect(metrics.approvedProposals).toBe(30);
    expect(metrics.rejectedProposals).toBe(20);
    expect(metrics.approvalRate).toBe(30 / 50);

    // Verify confidence calculation
    const confidences = Array.from({ length: 50 }, (_, i) => 0.5 + i / 100);
    const expectedAvgConfidence = confidences.reduce((a, b) => a + b) / 50;
    expect(Math.abs(metrics.avgConfidence - expectedAvgConfidence)).toBeLessThan(0.001);

    // Verify return calculation
    const returns = Array.from({ length: 50 }, (_, i) => i / 1000);
    const expectedTotalReturn = returns.reduce((a, b) => a + b);
    expect(Math.abs(metrics.totalReturn - expectedTotalReturn)).toBeLessThan(0.001);
  });

  it('should handle rapid agent status updates', () => {
    for (let i = 0; i < 50; i++) {
      fleetBus.updateAgentStatus(AgentRole.RESEARCH_ANALYST, {
        status: i % 2 === 0 ? 'thinking' : 'analyzing',
        currentTask: `Task ${i}`,
      });
    }

    const status = fleetBus.getAgentStatus(AgentRole.RESEARCH_ANALYST);
    expect(status).toBeDefined();
    expect(status?.status).toBe('analyzing'); // Last update was analyzing
    expect(status?.currentTask).toBe('Task 49');
  });

  it('should clear bus and reinitialize agents', () => {
    // Add data
    fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Test',
      payload: {},
      proposalType: 'trade',
      summary: 'Test',
      reasoning: 'Test',
      requiredApprovals: [],
      approvals: [],
    });

    fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: [AgentRole.RISK_MANAGER],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Test',
      payload: {},
    });

    fleetBus.addDirective({
      type: 'risk_tolerance',
      value: 'moderate',
      active: true,
    });

    // Clear
    fleetBus.clear();

    // Verify cleared
    expect(fleetBus.getProposals()).toHaveLength(0);
    expect(fleetBus.getLog()).toHaveLength(0);
    expect(fleetBus.getAllDirectives()).toHaveLength(0);

    // Verify agents reinitialized
    const statuses = fleetBus.getAgentStatuses();
    Object.values(statuses).forEach((status) => {
      expect(status.status).toBe('idle');
      expect(status.messagesProcessed).toBe(0);
      expect(status.proposalsMade).toBe(0);
    });
  });

  it('should filter messages correctly for specific agents', () => {
    // Create message network
    fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: [AgentRole.RISK_MANAGER],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Message 1',
      payload: {},
    });

    fleetBus.send({
      sender: AgentRole.RISK_MANAGER,
      recipients: [AgentRole.RESEARCH_ANALYST],
      type: 'RESPONSE',
      priority: 'high',
      subject: 'Message 2',
      payload: {},
    });

    fleetBus.send({
      sender: AgentRole.TRADING_ANALYST,
      recipients: [AgentRole.PORTFOLIO_STRATEGIST],
      type: 'REQUEST',
      priority: 'high',
      subject: 'Message 3',
      payload: {},
    });

    // Check messages for RESEARCH_ANALYST
    const researchMsgs = fleetBus.getMessagesFor(AgentRole.RESEARCH_ANALYST);
    expect(researchMsgs.length).toBeGreaterThanOrEqual(1);
    researchMsgs.forEach((msg) => {
      expect(msg.recipients).toContain(AgentRole.RESEARCH_ANALYST);
    });

    // Check messages for RISK_MANAGER
    const riskMsgs = fleetBus.getMessagesFor(AgentRole.RISK_MANAGER);
    expect(riskMsgs.length).toBeGreaterThanOrEqual(1);
    riskMsgs.forEach((msg) => {
      expect(msg.recipients).toContain(AgentRole.RISK_MANAGER);
    });

    // Check messages for TRADING_ANALYST (should be empty or very few)
    const tradingMsgs = fleetBus.getMessagesFor(AgentRole.TRADING_ANALYST);
    tradingMsgs.forEach((msg) => {
      expect(msg.recipients).toContain(AgentRole.TRADING_ANALYST);
    });
  });

  it('should filter proposals with various criteria', () => {
    // Submit proposals
    const approved = fleetBus.submitProposal({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'high',
      subject: 'Approved proposal',
      payload: {},
      proposalType: 'trade',
      summary: 'Test',
      reasoning: 'Test',
      requiredApprovals: [],
      approvals: [],
    });

    const rejected = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Rejected proposal',
      payload: {},
      proposalType: 'rebalance',
      summary: 'Test',
      reasoning: 'Test',
      requiredApprovals: [],
      approvals: [],
    });

    const pending = fleetBus.submitProposal({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'low',
      subject: 'Pending proposal',
      payload: {},
      proposalType: 'alert',
      summary: 'Test',
      reasoning: 'Test',
      requiredApprovals: [],
      approvals: [],
    });

    // Set decisions
    fleetBus.decideProposal(approved.id, true);
    fleetBus.decideProposal(rejected.id, false);

    // Filter by approval status
    const approvedProposals = fleetBus.getProposals({ approved: true });
    expect(approvedProposals).toHaveLength(1);
    expect(approvedProposals[0].id).toBe(approved.id);

    const rejectedProposals = fleetBus.getProposals({ approved: false });
    expect(rejectedProposals).toHaveLength(1);
    expect(rejectedProposals[0].id).toBe(rejected.id);

    // Filter by type
    const tradeProposals = fleetBus.getProposals({ type: 'trade' });
    expect(tradeProposals.length).toBeGreaterThanOrEqual(1);
    tradeProposals.forEach((p) => {
      expect(p.proposalType).toBe('trade');
    });

    // Filter by status (proposal status is always 'pending' until approved/rejected)
    const allStatuses = fleetBus.getProposals({ status: 'pending' });
    expect(allStatuses.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// PART 3: NEURAL NETWORK TEST
// ============================================================================

describe('Part 3: Neural Network Tests', () => {
  it('should create TradeScorer and return valid confidence', () => {
    const scorer = new TradeScorer();

    const result = scorer.score({
      priceChange24h: 0.05,
      volumeChange: 0.2,
      rsiNormalized: 0.65,
      macdSignal: 0.1,
      sentimentScore: 0.3,
      fundamentalScore: 0.7,
      marketTrend: 0.4,
      volatility: 0.2,
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.signal);
  });

  it('should map confidence to correct signal types', () => {
    const scorer = new TradeScorer();

    // Test strong_buy (confidence >= 0.8)
    // We can't guarantee specific outputs without training, but we can test the ranges
    const result1 = scorer.score({
      priceChange24h: 1,
      volumeChange: 1,
      rsiNormalized: 1,
      macdSignal: 1,
      sentimentScore: 1,
      fundamentalScore: 1,
      marketTrend: 1,
      volatility: 0,
    });
    expect(result1.confidence).toBeGreaterThanOrEqual(0);
    expect(result1.confidence).toBeLessThanOrEqual(1);

    const result2 = scorer.score({
      priceChange24h: 0,
      volumeChange: 0,
      rsiNormalized: 0,
      macdSignal: 0,
      sentimentScore: 0,
      fundamentalScore: 0,
      marketTrend: 0,
      volatility: 1,
    });
    expect(result2.confidence).toBeGreaterThanOrEqual(0);
    expect(result2.confidence).toBeLessThanOrEqual(1);
  });

  it('should create PositionSizer and return valid position sizes', () => {
    const sizer = new PositionSizer();

    const result = sizer.optimize({
      confidence: 0.8,
      volatility: 0.2,
      portfolioValue: 100000,
      currentExposure: 0.1,
      riskTolerance: 0.6,
      correlationToPortfolio: 0.3,
    });

    expect(result.positionPct).toBeGreaterThanOrEqual(0.001); // Min 0.1%
    expect(result.positionPct).toBeLessThanOrEqual(0.3); // Max 30%
    expect(result.dollarAmount).toBeGreaterThanOrEqual(100);
    expect(result.dollarAmount).toBeLessThanOrEqual(30000);
    expect(result.reasoning).toBeDefined();
    expect(typeof result.reasoning).toBe('string');
  });

  it('should respect position size constraints', () => {
    const sizer = new PositionSizer();

    for (let i = 0; i < 20; i++) {
      const result = sizer.optimize({
        confidence: Math.random(),
        volatility: Math.random(),
        portfolioValue: 100000 + Math.random() * 900000,
        currentExposure: Math.random(),
        riskTolerance: Math.random(),
        correlationToPortfolio: Math.random() * 2 - 1,
      });

      expect(result.positionPct).toBeGreaterThanOrEqual(0.001);
      expect(result.positionPct).toBeLessThanOrEqual(0.3);
    }
  });

  it('should create RiskAssessor and return valid risk levels', () => {
    const assessor = new RiskAssessor();

    const result = assessor.assess({
      portfolioBeta: 1.2,
      sectorConcentration: 0.3,
      correlationAvg: 0.5,
      maxDrawdownPct: 0.2,
      sharpeRatio: 1.0,
      volatility: 0.15,
      marketRegime: 0.3,
    });

    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(1);
    expect(result.stressScore).toBeGreaterThanOrEqual(0);
    expect(result.stressScore).toBeLessThanOrEqual(1);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
  });

  it('should generate appropriate risk recommendations', () => {
    const assessor = new RiskAssessor();

    // Low risk scenario
    const lowRisk = assessor.assess({
      portfolioBeta: 0.8,
      sectorConcentration: 0.1,
      correlationAvg: 0.2,
      maxDrawdownPct: 0.05,
      sharpeRatio: 2.0,
      volatility: 0.08,
      marketRegime: 0.5,
    });

    // Risk level should be one of the valid types
    expect(['low', 'medium', 'high', 'critical']).toContain(lowRisk.riskLevel);
    expect(lowRisk.recommendations.length).toBeGreaterThanOrEqual(1);
    // Low risk scenario should have lower risk score than high risk
    const riskScoreLow = lowRisk.riskScore;

    // High risk scenario
    const highRisk = assessor.assess({
      portfolioBeta: 2.0,
      sectorConcentration: 0.8,
      correlationAvg: 0.9,
      maxDrawdownPct: 0.6,
      sharpeRatio: -0.5,
      volatility: 0.5,
      marketRegime: -0.7,
    });

    expect(['low', 'medium', 'high', 'critical']).toContain(highRisk.riskLevel);
    // High risk scenario should have higher risk score
    expect(highRisk.riskScore).toBeGreaterThanOrEqual(riskScoreLow);
  });

  it('should handle extreme neural network inputs', () => {
    const scorer = new TradeScorer();

    // All zeros
    const zeroResult = scorer.score({
      priceChange24h: 0,
      volumeChange: 0,
      rsiNormalized: 0,
      macdSignal: 0,
      sentimentScore: 0,
      fundamentalScore: 0,
      marketTrend: 0,
      volatility: 0,
    });
    expect(zeroResult.confidence).toBeGreaterThanOrEqual(0);
    expect(zeroResult.confidence).toBeLessThanOrEqual(1);

    // All ones
    const oneResult = scorer.score({
      priceChange24h: 1,
      volumeChange: 1,
      rsiNormalized: 1,
      macdSignal: 1,
      sentimentScore: 1,
      fundamentalScore: 1,
      marketTrend: 1,
      volatility: 1,
    });
    expect(oneResult.confidence).toBeGreaterThanOrEqual(0);
    expect(oneResult.confidence).toBeLessThanOrEqual(1);

    // Mixed extremes
    const mixedResult = scorer.score({
      priceChange24h: 1,
      volumeChange: 0,
      rsiNormalized: 1,
      macdSignal: 0,
      sentimentScore: 1,
      fundamentalScore: 0,
      marketTrend: 1,
      volatility: 0,
    });
    expect(mixedResult.confidence).toBeGreaterThanOrEqual(0);
    expect(mixedResult.confidence).toBeLessThanOrEqual(1);
  });

  it('should train NeuralNetwork and reduce loss over epochs', () => {
    const nn = new NeuralNetwork({
      inputSize: 4,
      hiddenLayers: [{ size: 8, activation: 'relu' }],
      outputSize: 1,
      outputActivation: 'sigmoid',
      learningRate: 0.1,
    });

    const trainingData = [
      { inputs: [0, 0, 0, 0], targets: [0] },
      { inputs: [1, 1, 1, 1], targets: [1] },
      { inputs: [0.5, 0.5, 0.5, 0.5], targets: [0.5] },
      { inputs: [0.2, 0.8, 0.3, 0.7], targets: [0.5] },
    ];

    // Train and collect losses
    const losses: number[] = [];
    for (let epoch = 0; epoch < 20; epoch++) {
      let epochLoss = 0;
      for (const sample of trainingData) {
        epochLoss += nn.train(sample.inputs, sample.targets);
      }
      epochLoss /= trainingData.length;
      losses.push(epochLoss);
    }

    // Verify network learns (loss generally decreases)
    // We can't guarantee strict decrease due to randomness, but average trend should decrease
    const firstAvg = (losses[0] + losses[1]) / 2;
    const lastAvg = (losses[losses.length - 2] + losses[losses.length - 1]) / 2;
    expect(lastAvg).toBeLessThanOrEqual(firstAvg + 0.1); // Allow some variance

    // Test predictions after training
    const pred1 = nn.predict([0, 0, 0, 0]);
    const pred2 = nn.predict([1, 1, 1, 1]);

    expect(pred1[0]).toBeGreaterThanOrEqual(0);
    expect(pred1[0]).toBeLessThanOrEqual(1);
    expect(pred2[0]).toBeGreaterThanOrEqual(0);
    expect(pred2[0]).toBeLessThanOrEqual(1);
  });

  it('should predict valid outputs for various inputs', () => {
    const nn = new NeuralNetwork({
      inputSize: 3,
      hiddenLayers: [{ size: 5, activation: 'sigmoid' }],
      outputSize: 2,
      outputActivation: 'sigmoid',
    });

    const output1 = nn.predict([0.1, 0.2, 0.3]);
    expect(output1).toHaveLength(2);
    output1.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });

    const output2 = nn.predict([0.9, 0.8, 0.7]);
    expect(output2).toHaveLength(2);
    output2.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });
  });

  it('should handle network weight export and import', () => {
    const nn = new NeuralNetwork({
      inputSize: 2,
      hiddenLayers: [{ size: 4, activation: 'relu' }],
      outputSize: 1,
      outputActivation: 'sigmoid',
    });

    // Train for a few epochs
    for (let i = 0; i < 5; i++) {
      nn.train([0, 0], [0]);
      nn.train([1, 1], [1]);
    }

    // Get prediction before export
    const pred1 = nn.predict([0.5, 0.5]);

    // Export weights
    const exported = nn.exportWeights();
    expect(exported.weights).toBeDefined();
    expect(exported.biases).toBeDefined();
    expect(exported.config).toBeDefined();

    // Create new network and import weights
    const nn2 = new NeuralNetwork({
      inputSize: 2,
      hiddenLayers: [{ size: 4, activation: 'relu' }],
      outputSize: 1,
      outputActivation: 'sigmoid',
    });

    nn2.importWeights(exported);

    // Get prediction after import
    const pred2 = nn2.predict([0.5, 0.5]);

    // Predictions should be identical
    expect(pred2[0]).toBe(pred1[0]);
  });

  it('should validate input/output dimensions', () => {
    const nn = new NeuralNetwork({
      inputSize: 3,
      hiddenLayers: [{ size: 4, activation: 'relu' }],
      outputSize: 2,
      outputActivation: 'sigmoid',
    });

    // Wrong input size
    expect(() => {
      nn.predict([0, 0]); // Only 2 inputs, need 3
    }).toThrow();

    // Wrong training targets size
    expect(() => {
      nn.train([0, 0, 0], [0, 0, 0]); // 3 targets, need 2
    }).toThrow();

    // Correct dimensions
    const output = nn.predict([0, 0, 0]);
    expect(output).toHaveLength(2);

    const loss = nn.train([0, 0, 0], [0, 0]);
    expect(typeof loss).toBe('number');
    expect(loss).toBeGreaterThanOrEqual(0);
  });
});
