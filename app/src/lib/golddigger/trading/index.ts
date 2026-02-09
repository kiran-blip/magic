/**
 * Trading module re-exports.
 *
 * Usage:
 *   import { createOrderProposal, approveProposal, executeApprovedProposal } from "../trading";
 */

export {
  type OrderProposal,
  type CreateProposalInput,
  createOrderProposal,
  getOrderProposals,
  getOrderProposal,
  approveProposal,
  rejectProposal,
  executeApprovedProposal,
  calculatePositionSize,
} from "./executor";
