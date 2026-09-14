// Attention kernel: the genius in "genius brain". Decides what deserves to
// interrupt the user, when silence is smarter, and how much proof an action
// needs before running. Pure functions only: fully testable, no services.

export type Importance = "critical" | "important" | "routine" | "trivia"

export interface Signal {
  severity: string
  source: string
  text: string
}

const CRITICAL_HINTS = ["data loss", "security", "breach", "payment failed", "deploy failed", "quota exhausted", "unauthorized"]
const IMPORTANT_HINTS = ["failed", "error", "expired", "deadline", "reminder", "rate_limited", "invalid"]
const TRIVIA_HINTS = ["heartbeat", "tip of the day", "did you know", "survey", "promo"]

// Severity leads; text hints refine. Hints match message text only, never the
// source name, so senders like "heartbeat" can't misclassify their own mail.
// Unknown severity with alarming text escalates one step rather than staying
// silent.
export function importanceOf(signal: Signal): Importance {
  const text = signal.text.toLowerCase()
  if (signal.severity === "critical" || CRITICAL_HINTS.some((hint) => text.includes(hint))) return "critical"
  if (TRIVIA_HINTS.some((hint) => text.includes(hint))) return "trivia"
  if (signal.severity === "error" || IMPORTANT_HINTS.some((hint) => text.includes(hint))) return "important"
  return "routine"
}

export interface QuietHours {
  startHour: number
  endHour: number
}

// Overnight ranges wrap midnight (22 -> 7). Equal hours means never quiet.
export function isQuietHour(now: Date, hours: QuietHours): boolean {
  if (hours.startHour === hours.endHour) return false
  const current = now.getHours() + now.getMinutes() / 60
  if (hours.startHour < hours.endHour) return current >= hours.startHour && current < hours.endHour
  return current >= hours.startHour || current < hours.endHour
}

// Rolling interruption budget: at most `max` alerts in the past `windowMs`.
export function budgetAllows(alertsAt: number[], now: number, max: number, windowMs: number): boolean {
  return alertsAt.filter((at) => now - at < windowMs).length < max
}

export interface AttentionInput {
  signal: Signal
  now: Date
  quiet: QuietHours
  alertsAt: number[]
  maxAlerts: number
  alertWindowMs: number
}

export interface AttentionDecision {
  speak: boolean
  importance: Importance
  reason: string
}

// Genius rule: critical always interrupts, trivia never does, everything else
// respects quiet hours and the budget. Every decision carries its reason so
// the user can audit why the agent spoke or stayed silent.
export function decide(input: AttentionInput): AttentionDecision {
  const importance = importanceOf(input.signal)
  if (importance === "trivia") {
    return { speak: false, importance, reason: "trivia is logged, never announced" }
  }
  if (importance === "critical") {
    return { speak: true, importance, reason: "critical interrupts even in quiet hours" }
  }
  if (isQuietHour(input.now, input.quiet)) {
    return { speak: false, importance, reason: "quiet hours: held for the morning brief" }
  }
  if (!budgetAllows(input.alertsAt, input.now.getTime(), input.maxAlerts, input.alertWindowMs)) {
    return { speak: false, importance, reason: "interruption budget spent: held for the morning brief" }
  }
  return { speak: true, importance, reason: "worth interrupting now" }
}

export type Stakes = "high" | "low"
export type Uncertainty = "high" | "low"
export type Action = "act" | "ask" | "confirm"

// High stakes always involve the user; low stakes act silently only when the
// outcome is certain. Confirm (explicit yes) outranks ask (options) for
// irreversible high-stakes moves made under uncertainty.
export function decideAction(stakes: Stakes, uncertainty: Uncertainty): Action {
  if (stakes === "high") return uncertainty === "high" ? "confirm" : "ask"
  return uncertainty === "high" ? "ask" : "act"
}

// Battery-aware heartbeat: low battery stretches the interval so ambient
// monitoring never kills the phone it guards. Never below base, capped at 4x.
export function heartbeatIntervalMinutes(batteryPercent: number, baseMinutes: number): number {
  if (batteryPercent >= 50) return baseMinutes
  if (batteryPercent >= 20) return baseMinutes * 2
  return baseMinutes * 4
}
