import { decide, heartbeatIntervalMinutes, type QuietHours } from "./attention"

// Ambient monitor turn policy. The check itself is cheap and runs on schedule;
// a full agent turn only starts when something is actually pending. Empty
// heartbeats stay silent: monitoring must never become spam.

export interface HeartbeatInput {
  nowMs: number
  batteryPercent: number
  baseMinutes: number
  dueCount: number
  criticalCount: number
  lastRunMs?: number
  quiet: QuietHours
  alertsAt: number[]
  maxAlerts: number
  alertWindowMs: number
}

export interface HeartbeatDecision {
  run: boolean
  intervalMinutes: number
  speak: boolean
  reason: string
}

export function check(input: HeartbeatInput): HeartbeatDecision {
  const intervalMinutes = heartbeatIntervalMinutes(input.batteryPercent, input.baseMinutes)
  const now = new Date(input.nowMs)
  if (input.lastRunMs !== undefined && input.nowMs - input.lastRunMs < intervalMinutes * 60000) {
    return { run: false, intervalMinutes, speak: false, reason: "interval not elapsed" }
  }
  if (input.dueCount === 0 && input.criticalCount === 0) {
    return { run: false, intervalMinutes, speak: false, reason: "empty heartbeat" }
  }
  const signal =
    input.criticalCount > 0
      ? { severity: "critical", source: "heartbeat", text: `${input.criticalCount} critical item(s) need attention` }
      : { severity: "error", source: "heartbeat", text: `${input.dueCount} scheduled job(s) due` }
  const attention = decide({
    signal,
    now,
    quiet: input.quiet,
    alertsAt: input.alertsAt,
    maxAlerts: input.maxAlerts,
    alertWindowMs: input.alertWindowMs,
  })
  return { run: true, intervalMinutes, speak: attention.speak, reason: attention.reason }
}
