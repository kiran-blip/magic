"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type UserTier, TIER_NAV, TIER_INFO, type TierNavItem } from "@/lib/golddigger/tier";

interface TierContextValue {
  tier: UserTier;
  setTier: (tier: UserTier) => Promise<void>;
  navItems: TierNavItem[];
  tierInfo: typeof TIER_INFO[UserTier];
  loading: boolean;
}

const TierContext = createContext<TierContextValue>({
  tier: "newbie",
  setTier: async () => {},
  navItems: TIER_NAV.newbie,
  tierInfo: TIER_INFO.newbie,
  loading: true,
});

export function useTier() {
  return useContext(TierContext);
}

export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<UserTier>("newbie");
  const [loading, setLoading] = useState(true);

  // Load tier from settings on mount
  useEffect(() => {
    fetch("/api/golddigger/settings")
      .then((r) => r.json())
      .then((data) => {
        const savedTier = data.userProfile?.tier || data.userTier;
        if (savedTier && (savedTier === "newbie" || savedTier === "intermediate" || savedTier === "expert")) {
          setTierState(savedTier);
        } else if (data.userProfile?.experienceLevel) {
          // Fallback: derive from experience level
          const map: Record<string, UserTier> = {
            beginner: "newbie",
            intermediate: "intermediate",
            advanced: "expert",
          };
          setTierState(map[data.userProfile.experienceLevel] || "newbie");
        }
      })
      .catch(() => {
        // Default to newbie on error
      })
      .finally(() => setLoading(false));
  }, []);

  // Persist tier to server
  const setTier = useCallback(async (newTier: UserTier) => {
    setTierState(newTier);
    try {
      await fetch("/api/golddigger/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProfile: { tier: newTier },
          userTier: newTier,
        }),
      });
    } catch {
      // Tier change is applied locally even if server save fails
      console.warn("[TierProvider] Failed to persist tier to server");
    }
  }, []);

  return (
    <TierContext.Provider
      value={{
        tier,
        setTier,
        navItems: TIER_NAV[tier],
        tierInfo: TIER_INFO[tier],
        loading,
      }}
    >
      {children}
    </TierContext.Provider>
  );
}
