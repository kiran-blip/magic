/**
 * Fleet message bus - inter-agent communication system.
 * Simple in-memory event system for agent-to-agent and CEO-to-agent communication.
 */

import { randomUUID } from 'crypto';
import {
  AgentRole,
  FleetMessage,
  Proposal,
  Directive,
  FleetMetrics,
  AgentStatusInfo,
  AgentStatus,
  ProposalApproval,
  VerificationStatus,
} from './types';
import { computeVerificationStatus } from './verification';
import { FLEET_AGENTS } from './agents';
import * as persistence from './persistence';

/**
 * In-memory message bus for fleet communication.
 */
class FleetBus {
  private messages: FleetMessage[] = [];
  private proposals: Proposal[] = [];
  private directives: Directive[] = [];
  private agentStatuses: Map<AgentRole, AgentStatusInfo> = new Map();
  private listeners: Map<AgentRole | 'CEO', ((msg: FleetMessage) => void)[]> = new Map();

  constructor() {
    this.initializeAgentStatuses();
    this.restoreState();
  }

  /**
   * Restore fleet state from SQLite on startup.
   */
  private restoreState(): void {
    try {
      // Restore messages (last 200)
      const savedMessages = persistence.loadMessages(200);
      if (savedMessages.length > 0) {
        this.messages = savedMessages;
        console.log(`[Fleet Bus] Restored ${savedMessages.length} messages from disk`);
      }

      // Restore proposals
      const savedProposals = persistence.loadProposals();
      if (savedProposals.length > 0) {
        this.proposals = savedProposals;
        console.log(`[Fleet Bus] Restored ${savedProposals.length} proposals from disk`);
      }

      // Restore directives
      const savedDirectives = persistence.loadDirectives();
      if (savedDirectives.length > 0) {
        this.directives = savedDirectives;
        console.log(`[Fleet Bus] Restored ${savedDirectives.length} directives from disk`);
      }

      // Restore agent metrics
      const savedMetrics = persistence.loadAgentMetrics();
      if (savedMetrics.size > 0) {
        savedMetrics.forEach((info, role) => {
          const existing = this.agentStatuses.get(role as AgentRole);
          if (existing) {
            existing.messagesProcessed = info.messagesProcessed;
            existing.proposalsMade = info.proposalsMade;
            existing.lastActive = info.lastActive;
          }
        });
        console.log(`[Fleet Bus] Restored metrics for ${savedMetrics.size} agents`);
      }
    } catch (error) {
      console.error("[Fleet Bus] Failed to restore state:", error);
    }
  }

  /**
   * Initialize agent statuses.
   */
  private initializeAgentStatuses(): void {
    Object.keys(FLEET_AGENTS).forEach((role) => {
      const agentRole = role as AgentRole;
      this.agentStatuses.set(agentRole, {
        role: agentRole,
        status: 'idle',
        lastActive: new Date().toISOString(),
        messagesProcessed: 0,
        proposalsMade: 0,
      });
    });
  }

  /**
   * Send a message between agents or from CEO.
   * @param msg - The message to send (without id, timestamp, status)
   * @returns The created message with metadata
   */
  send(msg: Omit<FleetMessage, 'id' | 'timestamp' | 'status'>): FleetMessage {
    const message: FleetMessage = {
      ...msg,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    this.messages.push(message);
    persistence.saveMessage(message);

    // Update sender's last active time
    if (msg.sender !== 'CEO') {
      const senderStatus = this.agentStatuses.get(msg.sender);
      if (senderStatus) {
        senderStatus.lastActive = message.timestamp;
        senderStatus.messagesProcessed += 1;
      }
    }

    // Notify recipients
    msg.recipients.forEach((recipient) => {
      this.notifyListeners(recipient, message);
    });

    return message;
  }

  /**
   * Submit a proposal for CEO approval.
   * @param proposal - The proposal to submit (without id, timestamp, status)
   * @returns The created proposal with metadata
   */
  submitProposal(
    proposal: Omit<Proposal, 'id' | 'timestamp' | 'status'>,
  ): Proposal {
    const fullProposal: Proposal = {
      ...proposal,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      status: 'pending',
      verificationStatus: proposal.requiredApprovals.length > 0
        ? 'awaiting_verification'
        : 'verified',
    };

    this.proposals.push(fullProposal);
    persistence.saveProposal(fullProposal);

    // Update sender's proposal count
    if (fullProposal.sender !== 'CEO') {
      const senderStatus = this.agentStatuses.get(fullProposal.sender);
      if (senderStatus) {
        senderStatus.proposalsMade += 1;
      }
    }

    // Notify recipients about the proposal
    fullProposal.recipients.forEach((recipient) => {
      this.notifyListeners(recipient, fullProposal);
    });

    return fullProposal;
  }

  /**
   * CEO approves or rejects a proposal.
   * @param proposalId - ID of the proposal
   * @param approved - Whether CEO approved
   * @param notes - Optional notes from CEO
   * @returns Updated proposal or null if not found
   */
  decideProposal(proposalId: string, approved: boolean, notes?: string): Proposal | null {
    const proposal = this.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return null;
    }

    proposal.ceoDecision = {
      approved,
      notes,
      timestamp: new Date().toISOString(),
    };

    // Update verification status — if CEO approves a disputed proposal, mark as overridden
    if (approved && proposal.verificationStatus === 'disputed') {
      proposal.verificationStatus = 'overridden';
    }
    persistence.saveProposal(proposal);

    // Create decision message and notify all agents
    const decisionMsg: FleetMessage = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sender: 'CEO',
      recipients: proposal.recipients,
      type: 'DECISION',
      priority: 'high',
      subject: `Decision on ${proposal.proposalType}: ${proposal.subject}`,
      payload: {
        proposalId,
        approved,
        notes,
      },
      status: 'pending',
      parentId: proposalId,
    };

    this.messages.push(decisionMsg);
    persistence.saveMessage(decisionMsg);

    // Notify agents about decision
    proposal.recipients.forEach((recipient) => {
      this.notifyListeners(recipient, decisionMsg);
    });

    return proposal;
  }

  /**
   * Get pending proposals awaiting CEO decision.
   * @returns Array of proposals pending CEO decision
   */
  getPendingProposals(): Proposal[] {
    return this.proposals.filter((p) => !p.ceoDecision);
  }

  /**
   * Get proposals with optional filtering.
   * @param filter - Optional filter criteria
   * @returns Filtered proposals
   */
  getProposals(filter?: {
    status?: string;
    type?: string;
    approved?: boolean;
  }): Proposal[] {
    return this.proposals.filter((p) => {
      if (filter?.status && p.status !== filter.status) {
        return false;
      }
      if (filter?.type && p.proposalType !== filter.type) {
        return false;
      }
      if (filter?.approved !== undefined && p.ceoDecision?.approved !== filter.approved) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get messages for a specific agent or CEO.
   * @param role - The recipient role
   * @param unreadOnly - Only return unread messages
   * @returns Array of messages
   */
  getMessagesFor(role: AgentRole | 'CEO', unreadOnly: boolean = false): FleetMessage[] {
    return this.messages.filter((msg) => {
      const isRecipient = msg.recipients.includes(role);
      if (!isRecipient) {
        return false;
      }
      if (unreadOnly && msg.status !== 'pending') {
        return false;
      }
      return true;
    });
  }

  /**
   * Get full message log with optional limit.
   * @param limit - Maximum number of messages to return (most recent)
   * @returns Array of messages
   */
  getLog(limit: number = 0): FleetMessage[] {
    const log = [...this.messages];
    if (limit > 0) {
      return log.slice(-limit);
    }
    return log;
  }

  /**
   * Add a directive from the CEO.
   * @param directive - The directive (without id, timestamp)
   * @returns The created directive
   */
  addDirective(directive: Omit<Directive, 'id' | 'timestamp'>): Directive {
    const fullDirective: Directive = {
      ...directive,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.directives.push(fullDirective);
    persistence.saveDirective(fullDirective);

    // Create a directive message and notify all agents
    const directiveMsg: FleetMessage = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sender: 'CEO',
      recipients: Array.from(this.agentStatuses.keys()),
      type: 'DIRECTIVE',
      priority: 'high',
      subject: `New ${directive.type} directive`,
      payload: {
        directiveId: fullDirective.id,
        value: directive.value,
      },
      status: 'pending',
    };

    this.messages.push(directiveMsg);
    persistence.saveMessage(directiveMsg);

    // Notify all agents
    this.agentStatuses.forEach((_, role) => {
      this.notifyListeners(role, directiveMsg);
    });

    return fullDirective;
  }

  /**
   * Get all active directives.
   * @returns Array of active directives
   */
  getDirectives(): Directive[] {
    return this.directives.filter((d) => d.active);
  }

  /**
   * Get all directives (active and inactive).
   * @returns Array of all directives
   */
  getAllDirectives(): Directive[] {
    return [...this.directives];
  }

  /**
   * Deactivate a directive.
   * @param directiveId - ID of the directive to deactivate
   * @returns The updated directive or null if not found
   */
  deactivateDirective(directiveId: string): Directive | null {
    const directive = this.directives.find((d) => d.id === directiveId);
    if (directive) {
      directive.active = false;
      persistence.saveDirective(directive);
    }
    return directive || null;
  }

  /**
   * Subscribe to messages for a role.
   * @param role - The role to listen for
   * @param callback - Function to call when message is received
   * @returns Unsubscribe function
   */
  subscribe(role: AgentRole | 'CEO', callback: (msg: FleetMessage) => void): () => void {
    if (!this.listeners.has(role)) {
      this.listeners.set(role, []);
    }

    const callbacks = this.listeners.get(role)!;
    callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners for a role.
   * @param role - The role to notify
   * @param message - The message to send
   */
  private notifyListeners(role: AgentRole | 'CEO', message: FleetMessage): void {
    const callbacks = this.listeners.get(role) || [];
    callbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        console.error(`Error in listener for ${role}:`, error);
      }
    });
  }

  /**
   * Mark a message as read.
   * @param messageId - ID of the message
   */
  markMessageAsRead(messageId: string): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message && message.status === 'pending') {
      message.status = 'delivered';
      persistence.saveMessage(message);
    }
  }

  /**
   * Mark a message as acted upon.
   * @param messageId - ID of the message
   */
  markMessageAsActed(messageId: string): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.status = 'acted_on';
      persistence.saveMessage(message);
    }
  }

  /**
   * Update agent status.
   * @param role - The agent role
   * @param status - Partial status update
   */
  updateAgentStatus(role: AgentRole, status: Partial<AgentStatusInfo>): void {
    const currentStatus = this.agentStatuses.get(role);
    if (currentStatus) {
      Object.assign(currentStatus, status);
      currentStatus.lastActive = new Date().toISOString();
      persistence.saveAgentMetrics(role, currentStatus);
    }
  }

  /**
   * Get all agent statuses.
   * @returns Record of agent roles to statuses
   */
  getAgentStatuses(): Record<AgentRole, AgentStatusInfo> {
    const result: Record<string, AgentStatusInfo> = {};
    this.agentStatuses.forEach((status, role) => {
      result[role] = status;
    });
    return result as Record<AgentRole, AgentStatusInfo>;
  }

  /**
   * Get a single agent's status.
   * @param role - The agent role
   * @returns The agent status
   */
  getAgentStatus(role: AgentRole): AgentStatusInfo | null {
    return this.agentStatuses.get(role) || null;
  }

  /**
   * Get fleet metrics.
   * @returns Fleet metrics
   */
  getMetrics(): FleetMetrics {
    const approvedProposals = this.proposals.filter(
      (p) => p.ceoDecision?.approved === true,
    ).length;
    const rejectedProposals = this.proposals.filter(
      (p) => p.ceoDecision?.approved === false,
    ).length;

    const confidences = this.proposals
      .filter((p) => p.neuralConfidence !== undefined)
      .map((p) => p.neuralConfidence!);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const returns = this.proposals
      .filter((p) => p.expectedReturn !== undefined)
      .map((p) => p.expectedReturn!);
    const totalReturn = returns.reduce((a, b) => a + b, 0);

    // Chain-of-Verification metrics
    const verifiedProposals = this.proposals.filter(
      (p) => p.verificationStatus === 'verified',
    ).length;
    const disputedProposals = this.proposals.filter(
      (p) => p.verificationStatus === 'disputed',
    ).length;
    const awaitingVerification = this.proposals.filter(
      (p) => p.verificationStatus === 'awaiting_verification',
    ).length;

    return {
      totalProposals: this.proposals.length,
      approvedProposals,
      rejectedProposals,
      approvalRate:
        this.proposals.length > 0 ? approvedProposals / this.proposals.length : 0,
      avgConfidence,
      totalReturn,
      messagesProcessed: this.messages.length,
      activeDirectives: this.directives.filter((d) => d.active).length,
      verifiedProposals,
      disputedProposals,
      awaitingVerification,
      verificationRate:
        this.proposals.length > 0 ? verifiedProposals / this.proposals.length : 0,
    };
  }

  /**
   * Clear all data (for testing).
   * Note: This clears only in-memory state; persistent SQLite data remains intact
   * and will be restored on next FleetBus initialization.
   */
  clear(): void {
    console.log("[Fleet Bus] Clearing in-memory state (SQLite persistence unchanged)");
    this.messages = [];
    this.proposals = [];
    this.directives = [];
    this.listeners.clear();
    this.initializeAgentStatuses();
  }

  /**
   * Get statistics about a specific agent.
   * @param role - The agent role
   * @returns Agent statistics
   */
  getAgentStats(role: AgentRole): {
    messagesReceived: number;
    messagesSent: number;
    proposalsMade: number;
    proposalsApproved: number;
    proposalsRejected: number;
  } {
    const received = this.messages.filter((m) => m.recipients.includes(role)).length;
    const sent = this.messages.filter((m) => m.sender === role).length;
    const proposals = this.proposals.filter((p) => p.sender === role);
    const approved = proposals.filter((p) => p.ceoDecision?.approved === true).length;
    const rejected = proposals.filter((p) => p.ceoDecision?.approved === false).length;

    return {
      messagesReceived: received,
      messagesSent: sent,
      proposalsMade: proposals.length,
      proposalsApproved: approved,
      proposalsRejected: rejected,
    };
  }

  // ── Chain-of-Verification Methods ──────────────────────────────────────

  /**
   * Submit an agent's verification approval/rejection for a proposal.
   * Updates the proposal's approvals[] and recomputes verificationStatus.
   * @param proposalId - ID of the proposal being reviewed
   * @param approval - The agent's approval with notes and metrics
   * @returns Updated proposal or null if not found
   */
  submitApproval(proposalId: string, approval: ProposalApproval): Proposal | null {
    const proposal = this.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return null;
    }

    // Prevent duplicate approvals from the same agent
    const existingIdx = proposal.approvals.findIndex((a) => a.agent === approval.agent);
    if (existingIdx >= 0) {
      proposal.approvals[existingIdx] = approval;
    } else {
      proposal.approvals.push(approval);
    }

    // Recompute verification status
    proposal.verificationStatus = computeVerificationStatus(proposal);
    persistence.saveProposal(proposal);

    // Create a verification message for the activity log
    const verificationMsg: FleetMessage = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sender: approval.agent,
      recipients: ['CEO', proposal.sender as AgentRole],
      type: 'RESPONSE',
      priority: approval.approved ? 'medium' : 'high',
      subject: `${approval.approved ? '✓ Verified' : '✗ Disputed'}: ${proposal.subject}`,
      payload: {
        proposalId,
        approved: approval.approved,
        verificationNotes: approval.notes,
        verificationMethod: approval.payload?.verificationMethod,
        concerns: approval.payload?.recommendations,
      },
      status: 'pending',
      parentId: proposalId,
    };

    this.messages.push(verificationMsg);
    persistence.saveMessage(verificationMsg);

    // Notify CEO and proposal sender about the verification
    this.notifyListeners('CEO', verificationMsg);
    if (proposal.sender !== 'CEO') {
      this.notifyListeners(proposal.sender as AgentRole, verificationMsg);
    }

    // Update verifier's status
    const verifierStatus = this.agentStatuses.get(approval.agent);
    if (verifierStatus) {
      verifierStatus.lastActive = new Date().toISOString();
      verifierStatus.messagesProcessed += 1;
      persistence.saveAgentMetrics(approval.agent, verifierStatus);
    }

    console.log(
      `[Fleet Bus] ${approval.agent} ${approval.approved ? 'verified' : 'disputed'} proposal ${proposalId} — status: ${proposal.verificationStatus}`,
    );

    return proposal;
  }

  /**
   * Get proposals that still need verification from a specific agent.
   * @param agent - The agent role to check
   * @returns Proposals awaiting this agent's verification
   */
  getProposalsAwaitingVerification(agent: AgentRole): Proposal[] {
    return this.proposals.filter((p) => {
      // Must be pending CEO decision
      if (p.ceoDecision) return false;
      // Must require this agent's approval
      if (!p.requiredApprovals.includes(agent)) return false;
      // Must not already have this agent's approval
      if (p.approvals.some((a) => a.agent === agent)) return false;
      // Must not be the sender (agents don't verify their own proposals)
      if (p.sender === agent) return false;
      return true;
    });
  }

  /**
   * Get proposals by verification status.
   * @param status - The verification status to filter by
   * @returns Filtered proposals
   */
  getProposalsByVerificationStatus(status: VerificationStatus): Proposal[] {
    return this.proposals.filter((p) => p.verificationStatus === status);
  }
}

/**
 * Singleton fleet bus instance.
 */
export const fleetBus = new FleetBus();

export default fleetBus;
