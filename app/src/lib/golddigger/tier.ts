/**
 * Gold Digger AGI — User Tier System
 *
 * Three tiers control how much of the automation the user sees:
 *   - Newbie:       Hands-off. AI manages everything. User sees simple dashboard + chat.
 *   - Intermediate: See what's happening. Trading proposals, portfolio, watchlist visible.
 *   - Expert:       Full control. Fleet management, automation rules, prediction calibration.
 *
 * The tier is stored in the user profile and drives navigation filtering,
 * feature visibility, and UI complexity across the entire app.
 */

export type UserTier = "newbie" | "intermediate" | "expert";

export interface TierNavItem {
  key: string;
  href: string;
  label: string;
  description: string;
}

/**
 * Navigation items visible at each tier.
 * Each tier is additive — higher tiers see everything below plus more.
 */
export const TIER_NAV: Record<UserTier, TierNavItem[]> = {
  newbie: [
    { key: "chat",        href: "/dashboard/gold-digger",                    label: "Ask Gold Digger", description: "Your AI investment manager" },
    { key: "investments", href: "/dashboard/gold-digger/portfolio",          label: "My Money",        description: "See how your money is doing" },
    { key: "settings",    href: "/dashboard/gold-digger/settings",           label: "Settings",        description: "Account & preferences" },
  ],
  intermediate: [
    { key: "chat",        href: "/dashboard/gold-digger",                    label: "Chat",            description: "AI financial assistant" },
    { key: "trading",     href: "/dashboard/gold-digger/trading",            label: "Trading",         description: "Proposals & orders" },
    { key: "portfolio",   href: "/dashboard/gold-digger/portfolio",          label: "Portfolio",       description: "Holdings & P&L" },
    { key: "watchlist",   href: "/dashboard/gold-digger/watchlist",          label: "Watchlist",       description: "Tracked assets" },
    { key: "predictions", href: "/dashboard/gold-digger/predictions",        label: "Predictions",     description: "AI accuracy tracking" },
    { key: "settings",    href: "/dashboard/gold-digger/settings",           label: "Settings",        description: "API keys & config" },
  ],
  expert: [
    { key: "chat",        href: "/dashboard/gold-digger",                    label: "Chat",            description: "AI financial assistant" },
    { key: "fleet",       href: "/dashboard/gold-digger/fleet",              label: "Fleet",           description: "Agent fleet control" },
    { key: "chatroom",    href: "/dashboard/gold-digger/fleet/chatroom",     label: "Chatroom",        description: "Fleet conversations" },
    { key: "trading",     href: "/dashboard/gold-digger/trading",            label: "Trading",         description: "Proposals & orders" },
    { key: "portfolio",   href: "/dashboard/gold-digger/portfolio",          label: "Portfolio",       description: "Holdings & P&L" },
    { key: "watchlist",   href: "/dashboard/gold-digger/watchlist",          label: "Watchlist",       description: "Tracked assets" },
    { key: "rules",       href: "/dashboard/gold-digger/rules",              label: "Rules",           description: "Automation rules" },
    { key: "predictions", href: "/dashboard/gold-digger/predictions",        label: "Predictions",     description: "Accuracy tracking" },
    { key: "settings",    href: "/dashboard/gold-digger/settings",           label: "Settings",        description: "API keys & config" },
  ],
};

/** Map experience level from profile to a recommended tier. */
export function experienceToTier(level?: string): UserTier {
  switch (level) {
    case "beginner":     return "newbie";
    case "intermediate": return "intermediate";
    case "advanced":     return "expert";
    default:             return "newbie";
  }
}

/** Tier display info for selectors and badges. */
export const TIER_INFO: Record<UserTier, {
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  newbie: {
    label: "Easy Mode",
    emoji: "\u{1F331}",
    tagline: "Sit back, let the AI invest for you",
    description: "Gold Digger handles everything automatically. You see a simple dashboard showing how your money is doing. Perfect if you want hands-off investing.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  intermediate: {
    label: "Balanced",
    emoji: "\u{1F4CA}",
    tagline: "See what the AI is doing, approve trades",
    description: "Watch the AI work in real-time. Review trade proposals, track your portfolio, and monitor predictions. The AI still does the heavy lifting.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  expert: {
    label: "Full Control",
    emoji: "\u{1F680}",
    tagline: "Command the entire AI fleet yourself",
    description: "Access everything: 6-agent fleet management, automation rules, inter-agent chatroom, and advanced configuration. For experienced traders who want maximum control.",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
  },
};
