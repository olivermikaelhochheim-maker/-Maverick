import type { RoutingMode, Settings, Tier } from "../settings";

export interface RouteDecision {
  tier: Tier;
  model: string;
  reason: string;
}

// Signals that a message needs real reasoning rather than a quick reply.
const COMPLEX = /\b(strateg|plan|analy[sz]|decid|decision|pricing|price|revenue|profit|margin|invest|compare|trade-?off|forecast|scenario|budget|hire|hiring|risk|why|evaluate|prioriti[sz]e|review|negotiat|framework)\w*/i;

/**
 * Pick a model tier. Transparent rules, not magic:
 *  - "Think deeper" on a message           -> deep
 *  - a fixed mode in Settings              -> that tier
 *  - auto: long or analytical messages     -> standard, otherwise fast
 *  - soft budget limit reached             -> fast, whatever was chosen
 */
export function routeMessage(
  text: string,
  settings: Settings,
  opts: { deep?: boolean; softLimitReached?: boolean } = {},
): RouteDecision {
  const models = settings.routing.models;
  let tier: Tier;
  let reason: string;
  const mode: RoutingMode = settings.routing.mode;

  if (opts.deep) {
    tier = "deep";
    reason = "You asked me to think deeper";
  } else if (mode !== "auto") {
    tier = mode;
    reason = `Settings fix the model tier to ${mode}`;
  } else if (text.length > 600) {
    tier = "standard";
    reason = "Long message, so the standard model";
  } else if (COMPLEX.test(text)) {
    tier = "standard";
    reason = "Analytical question, so the standard model";
  } else {
    tier = "fast";
    reason = "Quick exchange, so the fast model";
  }

  if (opts.softLimitReached && tier !== "fast") {
    return { tier: "fast", model: models.fast, reason: "Soft budget limit reached, so the fast model to save cost" };
  }
  return { tier, model: models[tier], reason };
}
