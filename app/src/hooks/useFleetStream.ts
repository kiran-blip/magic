"use client";

/**
 * useFleetStream — Real-time fleet data via Server-Sent Events.
 *
 * Connects to /api/golddigger/fleet/stream for live updates.
 * Falls back to polling if SSE is unavailable.
 * Auto-reconnects on disconnect with exponential backoff.
 *
 * Usage:
 *   const { fleet, broker, connected, reconnecting } = useFleetStream();
 */

import { useState, useEffect, useCallback, useRef } from "react";

/* ── Types ─────────────────────────────────────────────── */

interface Agent {
  id: string;
  role: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  capabilities: string[];
  status: "idle" | "thinking" | "analyzing" | "proposing" | "waiting";
  lastActive: string;
  messagesProcessed: number;
  proposalsMade: number;
}

interface RiskAssessment {
  level: "low" | "medium" | "high";
  factors: string[];
}

interface Proposal {
  id: string;
  timestamp: string;
  sender: string;
  senderName: string;
  senderShortName: string;
  senderColor: string;
  recipients: string[];
  type: "PROPOSAL";
  priority: "high" | "medium" | "low";
  subject: string;
  payload: Record<string, unknown>;
  proposalType:
    | "trade"
    | "rebalance"
    | "research"
    | "alert"
    | "strategy_change";
  summary: string;
  reasoning: string;
  riskAssessment: RiskAssessment;
  neuralConfidence: number;
  expectedReturn: number;
  requiredApprovals: string[];
  approvals: Array<{
    agent: string;
    approved: boolean;
    notes?: string;
    timestamp?: string;
  }>;
  verificationStatus?: string;
  ceoDecision:
    | null
    | { approved: boolean; notes?: string; timestamp: string };
  status: "pending" | "approved" | "rejected";
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  sender: string;
  senderName: string;
  senderColor: string;
  recipients: string[];
  type: string;
  priority: "high" | "medium" | "low";
  subject: string;
  payload: Record<string, unknown>;
  status: string;
}

interface Directive {
  id: string;
  timestamp: string;
  type: string;
  value: string;
  active: boolean;
}

interface Metrics {
  totalProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  approvalRate: number;
  avgConfidence: number;
  totalReturn: number;
  messagesProcessed: number;
  activeDirectives: number;
  verifiedProposals?: number;
  disputedProposals?: number;
  awaitingVerification?: number;
  verificationRate?: number;
}

export interface FleetData {
  running: boolean;
  agents: Agent[];
  pendingProposals: Proposal[];
  allProposals: Proposal[];
  activityLog: ActivityEntry[];
  directives: Directive[];
  metrics: Metrics;
}

export interface BrokerAccount {
  connected: boolean;
  account?: {
    portfolioValue: number;
    buyingPower: number;
    cash: number;
    equity: number;
  };
  market?: { isOpen: boolean };
  error?: string;
}

export interface FleetStreamState {
  fleet: FleetData | null;
  broker: BrokerAccount | null;
  connected: boolean;
  reconnecting: boolean;
  loading: boolean;
  /** Force a full refresh from the server */
  refresh: () => void;
}

/* ── Constants ─────────────────────────────────────────── */

const STREAM_URL = "/api/golddigger/fleet/stream";
const BROKER_URL = "/api/golddigger/broker";
const FLEET_POLL_URL = "/api/golddigger/fleet";
const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;
const BROKER_POLL_INTERVAL = 15_000;
const FALLBACK_POLL_INTERVAL = 5_000;

/* ── Hook ──────────────────────────────────────────────── */

export function useFleetStream(): FleetStreamState {
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [broker, setBroker] = useState<BrokerAccount | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const brokerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Broker polling (separate from fleet — broker has no stream) ──
  const fetchBroker = useCallback(async () => {
    try {
      const res = await fetch(BROKER_URL);
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) setBroker(data);
      }
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Fallback: poll fleet data directly ──
  const fetchFleetPoll = useCallback(async () => {
    try {
      const res = await fetch(FLEET_POLL_URL);
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setFleet(data);
          setLoading(false);
        }
      }
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Refresh function exposed to consumers ──
  const refresh = useCallback(() => {
    fetchFleetPoll();
    fetchBroker();
  }, [fetchFleetPoll, fetchBroker]);

  // ── SSE Connection Management ──
  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(STREAM_URL);
    eventSourceRef.current = es;

    // ── snapshot: Initial full state ──
    es.addEventListener("snapshot", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (mountedRef.current) {
          setFleet({
            running: true,
            agents: data.agents ?? [],
            pendingProposals: data.pendingProposals ?? [],
            allProposals: data.allProposals ?? [],
            activityLog: data.activityLog ?? [],
            directives: data.directives ?? [],
            metrics: data.metrics ?? {},
          });
          setConnected(true);
          setReconnecting(false);
          setLoading(false);

          // Reset reconnect delay on successful connection
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

          // Stop fallback polling
          if (fallbackTimerRef.current) {
            clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
        }
      } catch {
        /* parse error */
      }
    });

    // ── message: New fleet message → append to activity log ──
    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data);
        if (mountedRef.current && message) {
          setFleet((prev) => {
            if (!prev) return prev;
            const log = [...prev.activityLog, message].slice(-50);
            return { ...prev, activityLog: log };
          });
        }
      } catch {
        /* */
      }
    });

    // ── proposal: New or updated proposal ──
    es.addEventListener("proposal", (e: MessageEvent) => {
      try {
        const { proposal } = JSON.parse(e.data);
        if (mountedRef.current && proposal) {
          setFleet((prev) => {
            if (!prev) return prev;
            // Update or add proposal in allProposals
            const exists = prev.allProposals.findIndex(
              (p) => p.id === proposal.id
            );
            const allProposals =
              exists >= 0
                ? prev.allProposals.map((p) =>
                    p.id === proposal.id ? proposal : p
                  )
                : [...prev.allProposals, proposal];
            const pendingProposals = allProposals.filter(
              (p) => !p.ceoDecision
            );
            return { ...prev, allProposals, pendingProposals };
          });
        }
      } catch {
        /* */
      }
    });

    // ── decision: CEO decided on a proposal ──
    es.addEventListener("decision", (e: MessageEvent) => {
      try {
        const { proposal } = JSON.parse(e.data);
        if (mountedRef.current && proposal) {
          setFleet((prev) => {
            if (!prev) return prev;
            const allProposals = prev.allProposals.map((p) =>
              p.id === proposal.id ? proposal : p
            );
            const pendingProposals = allProposals.filter(
              (p) => !p.ceoDecision
            );
            return { ...prev, allProposals, pendingProposals };
          });
        }
      } catch {
        /* */
      }
    });

    // ── verification: Agent verified/disputed a proposal ──
    es.addEventListener("verification", (e: MessageEvent) => {
      try {
        const { proposal } = JSON.parse(e.data);
        if (mountedRef.current && proposal) {
          setFleet((prev) => {
            if (!prev) return prev;
            const allProposals = prev.allProposals.map((p) =>
              p.id === proposal.id ? proposal : p
            );
            const pendingProposals = allProposals.filter(
              (p) => !p.ceoDecision
            );
            return { ...prev, allProposals, pendingProposals };
          });
        }
      } catch {
        /* */
      }
    });

    // ── agent_status: Agent changed status ──
    es.addEventListener("agent_status", (e: MessageEvent) => {
      try {
        const { role, status } = JSON.parse(e.data);
        if (mountedRef.current && role && status) {
          setFleet((prev) => {
            if (!prev) return prev;
            const agents = prev.agents.map((a) =>
              a.role === role
                ? {
                    ...a,
                    status: status.status ?? a.status,
                    lastActive: status.lastActive ?? a.lastActive,
                    messagesProcessed:
                      status.messagesProcessed ?? a.messagesProcessed,
                    proposalsMade: status.proposalsMade ?? a.proposalsMade,
                  }
                : a
            );
            return { ...prev, agents };
          });
        }
      } catch {
        /* */
      }
    });

    // ── directive: New CEO directive ──
    es.addEventListener("directive", (e: MessageEvent) => {
      try {
        const { directive } = JSON.parse(e.data);
        if (mountedRef.current && directive) {
          setFleet((prev) => {
            if (!prev) return prev;
            const exists = prev.directives.findIndex(
              (d) => d.id === directive.id
            );
            const directives =
              exists >= 0
                ? prev.directives.map((d) =>
                    d.id === directive.id ? directive : d
                  )
                : [...prev.directives, directive];
            return { ...prev, directives };
          });
        }
      } catch {
        /* */
      }
    });

    // ── metrics: Periodic metrics + agent status refresh ──
    es.addEventListener("metrics", (e: MessageEvent) => {
      try {
        const { metrics, agents } = JSON.parse(e.data);
        if (mountedRef.current) {
          setFleet((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...(metrics ? { metrics } : {}),
              ...(agents ? { agents } : {}),
            };
          });
        }
      } catch {
        /* */
      }
    });

    // ── heartbeat: keep-alive ──
    es.addEventListener("heartbeat", () => {
      // Just confirming connection is alive — no state change needed
    });

    // ── Connection error → reconnect with backoff ──
    es.onerror = () => {
      if (!mountedRef.current) return;

      setConnected(false);
      setReconnecting(true);
      es.close();
      eventSourceRef.current = null;

      // Start fallback polling while reconnecting
      if (!fallbackTimerRef.current) {
        fallbackTimerRef.current = setInterval(
          fetchFleetPoll,
          FALLBACK_POLL_INTERVAL
        );
      }

      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(
        delay * 2,
        MAX_RECONNECT_DELAY
      );

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [fetchFleetPoll]);

  // ── Effect: Initialize connection + broker polling ──
  useEffect(() => {
    mountedRef.current = true;

    // Start SSE connection
    connect();

    // Start broker polling (broker has no streaming endpoint)
    fetchBroker();
    brokerTimerRef.current = setInterval(fetchBroker, BROKER_POLL_INTERVAL);

    return () => {
      mountedRef.current = false;

      // Cleanup SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Cleanup timers
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
      if (brokerTimerRef.current) clearInterval(brokerTimerRef.current);
    };
  }, [connect, fetchBroker]);

  return { fleet, broker, connected, reconnecting, loading, refresh };
}

export default useFleetStream;
