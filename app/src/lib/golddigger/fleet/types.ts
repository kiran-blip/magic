/**
 * Type definitions for the autonomous agent fleet system.
 * 6 AI agents work autonomously, with the CEO as the human decision-maker.
 */

export enum AgentRole {
  RESEARCH_ANALYST = 'RESEARCH_ANALYST',
  RISK_MANAGER = 'RISK_MANAGER',
  PORTFOLIO_STRATEGIST = 'PORTFOLIO_STRATEGIST',
  TRADING_ANALYST = 'TRADING_ANALYST',
  SENTIMENT_ANALYST = 'SENTIMENT_ANALYST',
  QUANT_ANALYST = 'QUANT_ANALYST',
}

export type MessageType =
  | 'PROPOSAL'
  | 'REQUEST'
  | 'RESPONSE'
  | 'ALERT'
  | 'DECISION'
  | 'INSIGHT'
  | 'DIRECTIVE';

export type MessagePriority = 'low' | 'medium' | 'high' | 'critical';

export type MessageStatus = 'pending' | 'delivered' | 'read' | 'acted_on';

export type AgentStatus = 'idle' | 'thinking' | 'analyzing' | 'proposing' | 'waiting';

export type ProposalType = 'trade' | 'rebalance' | 'research' | 'alert' | 'strategy_change';

export type DirectiveType =
  | 'risk_tolerance'
  | 'focus_sectors'
  | 'max_position_size'
  | 'trading_style'
  | 'general';

/**
 * Base message structure for inter-agent communication.
 */
export interface FleetMessage {
  id: string;
  timestamp: string;
  sender: AgentRole | 'CEO';
  recipients: (AgentRole | 'CEO')[];
  type: MessageType;
  priority: MessagePriority;
  subject: string;
  payload: Record<string, unknown>;
  status: MessageStatus;
  parentId?: string;
}

/**
 * Risk assessment details for proposals.
 */
export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: string[];
}

/**
 * CEO decision on a proposal.
 */
export interface CEODecision {
  approved: boolean;
  notes?: string;
  timestamp: string;
}

/**
 * Approval from an agent on a proposal.
 */
export interface ProposalApproval {
  agent: AgentRole;
  approved: boolean;
  notes: string;
  timestamp: string;
  payload?: {
    riskScore?: number;
    impactMetrics?: Record<string, number>;
    recommendations?: string[];
    verificationMethod?: string;
  };
}

/**
 * Verification status of a proposal — computed from approvals vs required.
 */
export type VerificationStatus =
  | 'awaiting_verification'  // Not all required agents have reviewed
  | 'verified'               // All required agents approved
  | 'disputed'               // At least one required agent rejected
  | 'mixed'                  // All reviewed but some rejected (with optional agents)
  | 'overridden';            // CEO approved despite failed verification

/**
 * Detailed verification result from a single agent's cross-check.
 */
export interface VerificationResult {
  agent: AgentRole;
  approved: boolean;
  confidence: number;          // 0-1 confidence in the verification
  concerns: string[];          // Specific concerns found
  recommendations: string[];   // What should change
  metrics: Record<string, number>; // Quantitative checks
  verificationMethod: string;  // e.g. "risk_model", "neural_crosscheck", "sentiment_analysis"
}

/**
 * Proposal that requires CEO approval/rejection.
 * Extends FleetMessage with additional proposal-specific fields.
 *
 * Chain-of-Verification flow:
 *   1. Agent submits proposal → verificationStatus = 'awaiting_verification'
 *   2. Required agents review → populate approvals[]
 *   3. All required approve → verificationStatus = 'verified' → CEO sees it
 *   4. Any required reject → verificationStatus = 'disputed' → CEO still sees (flagged)
 *   5. CEO can approve regardless → verificationStatus = 'overridden' if disputed
 */
export interface Proposal extends FleetMessage {
  type: 'PROPOSAL';
  proposalType: ProposalType;
  summary: string;
  reasoning: string;
  riskAssessment?: RiskAssessment;
  neuralConfidence?: number;
  expectedReturn?: number;
  requiredApprovals: AgentRole[];
  approvals: ProposalApproval[];
  verificationStatus?: VerificationStatus;
  verificationDeadline?: string;    // ISO timestamp — auto-escalate if exceeded
  ceoDecision?: CEODecision;
}

/**
 * High-level strategy directive from CEO.
 */
export interface Directive {
  id: string;
  timestamp: string;
  type: DirectiveType;
  value: string;
  active: boolean;
}

/**
 * Agent definition with metadata and capabilities.
 */
export interface AgentDefinition {
  role: AgentRole;
  name: string;
  shortName: string;
  description: string;
  capabilities: string[];
  triggers: string[];
  color: string;
}

/**
 * Current status of an individual agent.
 */
export interface AgentStatusInfo {
  role: AgentRole;
  status: AgentStatus;
  lastActive: string;
  currentTask?: string;
  messagesProcessed: number;
  proposalsMade: number;
}

/**
 * Fleet-wide metrics and statistics.
 */
export interface FleetMetrics {
  totalProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  approvalRate: number;
  avgConfidence: number;
  totalReturn: number;
  messagesProcessed: number;
  activeDirectives: number;
  /** Chain-of-Verification metrics */
  verifiedProposals: number;
  disputedProposals: number;
  awaitingVerification: number;
  verificationRate: number;
}

/**
 * Complete fleet state snapshot.
 */
export interface FleetState {
  agents: Record<AgentRole, AgentStatusInfo>;
  messageLog: FleetMessage[];
  proposals: Proposal[];
  directives: Directive[];
  metrics: FleetMetrics;
}
