/**
 * Fleet Orchestrator - Manages autonomous agent fleet execution and lifecycle.
 * Auto-starts on first access — agents run on staggered schedules.
 * Each agent has its own timer and real market data behavior.
 */

import { fleetBus } from './bus';
import { FLEET_AGENTS, getAllAgents } from './agents';
import {
  AgentRole,
  FleetState,
  FleetMessage,
  Proposal,
  Directive,
  DirectiveType,
  AgentDefinition,
  AgentStatusInfo,
  FleetMetrics,
} from './types';
import { AGENT_BEHAVIORS } from './agent-behaviors';

/** Agent schedule configuration: interval in ms and initial offset in ms */
const AGENT_SCHEDULES: Record<AgentRole, { intervalMs: number; offsetMs: number }> = {
  [AgentRole.RESEARCH_ANALYST]:     { intervalMs: 90_000,  offsetMs: 0 },
  [AgentRole.RISK_MANAGER]:         { intervalMs: 60_000,  offsetMs: 10_000 },
  [AgentRole.PORTFOLIO_STRATEGIST]: { intervalMs: 120_000, offsetMs: 20_000 },
  [AgentRole.TRADING_ANALYST]:      { intervalMs: 45_000,  offsetMs: 30_000 },
  [AgentRole.SENTIMENT_ANALYST]:    { intervalMs: 75_000,  offsetMs: 40_000 },
  [AgentRole.QUANT_ANALYST]:        { intervalMs: 150_000, offsetMs: 50_000 },
};

/**
 * FleetOrchestrator manages the autonomous agent fleet.
 * Auto-starts all agents on staggered schedules when initialized.
 */
export class FleetOrchestrator {
  private running: boolean = false;
  private agentTimers: Map<AgentRole, NodeJS.Timeout> = new Map();
  private intervalMs: number = 5000; // Legacy compat — unused by new scheduler

  constructor() {
    // Auto-start on construction
    this.start();
  }

  /**
   * Start all agents with staggered schedules.
   * Each agent runs on its own timer at its own interval.
   */
  start(intervalMs: number = 5000): void {
    if (this.running) {
      console.log('[Fleet Orchestrator] Already running — all agents active');
      return;
    }

    this.intervalMs = intervalMs;
    this.running = true;
    console.log('[Fleet Orchestrator] Starting autonomous fleet — all agents activating...');

    // Start each agent on its own staggered timer
    for (const role of Object.values(AgentRole)) {
      const schedule = AGENT_SCHEDULES[role];
      if (!schedule) continue;

      const behavior = AGENT_BEHAVIORS[role];
      if (!behavior) continue;

      const agentName = FLEET_AGENTS[role]?.shortName ?? role;

      // Initial delayed start (staggered offset)
      const initialTimeout = setTimeout(() => {
        console.log(`[Fleet Orchestrator] ${agentName} — first tick`);
        behavior().catch(err => console.error(`[Fleet] ${agentName} error:`, err));

        // Then repeat at interval
        const interval = setInterval(() => {
          if (!this.running) return;
          behavior().catch(err => console.error(`[Fleet] ${agentName} error:`, err));
        }, schedule.intervalMs);

        this.agentTimers.set(role, interval);
      }, schedule.offsetMs);

      // Store the initial timeout so we can clear it on stop
      this.agentTimers.set(role, initialTimeout as unknown as NodeJS.Timeout);
    }

    console.log('[Fleet Orchestrator] All 6 agents scheduled and running autonomously');
  }

  /**
   * Stop all agents.
   */
  stop(): void {
    if (!this.running) {
      console.log('[Fleet Orchestrator] Not running');
      return;
    }

    // Clear all agent timers
    for (const [role, timer] of this.agentTimers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.agentTimers.clear();

    this.running = false;
    console.log('[Fleet Orchestrator] All agents stopped');
  }

  /**
   * Execute a single tick — runs ALL agents once.
   * Useful for manual triggering or testing.
   */
  tick(): void {
    console.log('[Fleet Orchestrator] Manual tick — running all agents');
    for (const role of Object.values(AgentRole)) {
      const behavior = AGENT_BEHAVIORS[role];
      if (behavior) {
        behavior().catch(err => console.error(`[Fleet] ${role} tick error:`, err));
      }
    }
  }

  /**
   * Manually run a specific agent immediately.
   */
  runAgent(role: AgentRole): void {
    const behavior = AGENT_BEHAVIORS[role];
    if (!behavior) {
      throw new Error(`Unknown agent role: ${role}`);
    }

    const agentName = FLEET_AGENTS[role]?.name ?? role;
    console.log(`[Fleet Orchestrator] Force-running agent: ${agentName}`);
    behavior().catch(err => console.error(`[Fleet] ${agentName} force-run error:`, err));
  }

  /**
   * Get the current running state.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get complete fleet state snapshot.
   */
  getFleetState(): FleetState {
    const agents = fleetBus.getAgentStatuses();
    const messageLog = fleetBus.getLog();
    const proposals = fleetBus.getProposals();
    const directives = fleetBus.getAllDirectives();
    const metrics = fleetBus.getMetrics();

    return {
      agents,
      messageLog,
      proposals,
      directives,
      metrics,
    };
  }

  /**
   * Get full fleet status for dashboard.
   */
  getStatus(): {
    running: boolean;
    intervalMs: number;
    agents: Record<AgentRole, AgentStatusInfo>;
    pendingProposals: number;
    totalMessages: number;
    metrics: FleetMetrics;
  } {
    const state = this.getFleetState();

    return {
      running: this.running,
      intervalMs: this.intervalMs,
      agents: state.agents,
      pendingProposals: fleetBus.getPendingProposals().length,
      totalMessages: state.messageLog.length,
      metrics: state.metrics,
    };
  }

  /**
   * Get all proposals with optional filtering.
   */
  getProposals(filter?: { status?: string }): Proposal[] {
    const proposals = fleetBus.getProposals();

    if (filter?.status === 'pending') {
      return fleetBus.getPendingProposals();
    }

    if (filter?.status === 'approved') {
      return proposals.filter((p) => p.ceoDecision?.approved === true);
    }

    if (filter?.status === 'rejected') {
      return proposals.filter((p) => p.ceoDecision?.approved === false);
    }

    return proposals;
  }

  /**
   * Get recent messages from log.
   */
  getLog(limit: number = 50): FleetMessage[] {
    return fleetBus.getLog(limit);
  }

  /**
   * Get agent definitions and statuses.
   */
  getAgents(): {
    definitions: AgentDefinition[];
    statuses: Record<AgentRole, AgentStatusInfo>;
  } {
    return {
      definitions: getAllAgents(),
      statuses: fleetBus.getAgentStatuses(),
    };
  }

  /**
   * Get all directives (CEO commands).
   */
  getDirectives(): Directive[] {
    return fleetBus.getAllDirectives();
  }

  /**
   * Get fleet metrics.
   */
  getMetrics(): FleetMetrics {
    return fleetBus.getMetrics();
  }

  /**
   * CEO makes a decision on a proposal.
   */
  decideProposal(proposalId: string, approved: boolean, notes?: string): Proposal | null {
    return fleetBus.decideProposal(proposalId, approved, notes);
  }

  /**
   * CEO adds a directive.
   */
  addDirective(type: string, value: string): Directive {
    const validTypes: DirectiveType[] = ['risk_tolerance', 'focus_sectors', 'max_position_size', 'trading_style', 'general'];
    const directiveType: DirectiveType = validTypes.includes(type as DirectiveType) ? (type as DirectiveType) : 'general';
    return fleetBus.addDirective({
      type: directiveType,
      value,
      active: true,
    });
  }

  /**
   * CEO deactivates a directive.
   */
  deactivateDirective(directiveId: string): Directive | null {
    return fleetBus.deactivateDirective(directiveId);
  }
}

/**
 * Singleton orchestrator instance.
 * Auto-starts on first access — fleet runs autonomously.
 */
let orchestrator: FleetOrchestrator | null = null;

/**
 * Get or create the singleton orchestrator.
 * First call auto-starts the fleet.
 */
export function getOrchestrator(): FleetOrchestrator {
  if (!orchestrator) {
    orchestrator = new FleetOrchestrator();
  }
  return orchestrator;
}

export default FleetOrchestrator;
