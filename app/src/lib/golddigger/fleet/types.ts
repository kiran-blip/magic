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
}

/**
 * Proposal that requires CEO approval/rejection.
 * Extends FleetMessage with additional proposal-specific fields.
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
