import { describe, expect, test } from "bun:test"
import {
  budgetAllows,
  decide,
  decideAction,
  heartbeatIntervalMinutes,
  importanceOf,
  isQuietHour,
  type AttentionInput,
} from "../src/attention"

const base: AttentionInput = {
  signal: { severity: "error", source: "worker", text: "task failed" },
  now: new Date(2026, 8, 14, 10, 0),
  quiet: { startHour: 22, endHour: 7 },
  alertsAt: [],
  maxAlerts: 3,
  alertWindowMs: 60 * 60 * 1000,
}

describe("attention kernel", () => {
  test("severity and hints set importance", () => {
    expect(importanceOf({ severity: "critical", source: "x", text: "ok" }).valueOf()).toBe("critical")
    expect(importanceOf({ severity: "info", source: "x", text: "payment failed twice" })).toBe("critical")
    expect(importanceOf({ severity: "error", source: "worker", text: "boom" })).toBe("important")
    expect(importanceOf({ severity: "info", source: "tips", text: "tip of the day" })).toBe("trivia")
    expect(importanceOf({ severity: "info", source: "x", text: "all good" })).toBe("routine")
  })

  test("severity leads trivia hints", () => {
    expect(importanceOf({ severity: "error", source: "worker", text: "tip of the day broke" })).toBe("important")
    expect(importanceOf({ severity: "info", source: "heartbeat", text: "nothing pending" })).toBe("routine")
  })

  test("quiet hours wrap midnight", () => {
    expect(isQuietHour(new Date(2026, 8, 14, 23, 30), { startHour: 22, endHour: 7 })).toBe(true)
    expect(isQuietHour(new Date(2026, 8, 14, 6, 59), { startHour: 22, endHour: 7 })).toBe(true)
    expect(isQuietHour(new Date(2026, 8, 14, 10, 0), { startHour: 22, endHour: 7 })).toBe(false)
    expect(isQuietHour(new Date(2026, 8, 14, 10, 0), { startHour: 9, endHour: 17 })).toBe(true)
    expect(isQuietHour(new Date(2026, 8, 14, 10, 0), { startHour: 0, endHour: 0 })).toBe(false)
  })

  test("budget counts only the rolling window", () => {
    const hour = 60 * 60 * 1000
    expect(budgetAllows([1000, 2000], 3000, 3, hour)).toBe(true)
    expect(budgetAllows([1000, 2000, 2500], 3000, 3, hour)).toBe(false)
    expect(budgetAllows([1000 - hour, 2000 - hour], 3000, 2, hour)).toBe(true)
    expect(budgetAllows([9000, 2000], 3000, 2, hour)).toBe(true)
  })

  test("critical interrupts, trivia never speaks", () => {
    const critical = decide({
      ...base,
      signal: { severity: "critical", source: "x", text: "deploy failed" },
      now: new Date(2026, 8, 14, 3, 0),
    })
    expect(critical.speak).toBe(true)
    const trivia = decide({ ...base, signal: { severity: "info", source: "x", text: "tip of the day" } })
    expect(trivia.speak).toBe(false)
  })

  test("quiet hours and spent budget hold routine signals", () => {
    const night = decide({ ...base, now: new Date(2026, 8, 14, 3, 0) })
    expect(night.speak).toBe(false)
    expect(night.reason).toContain("quiet hours")
    const spent = decide({ ...base, alertsAt: [1, 2, 3].map((n) => base.now.getTime() - n * 1000) })
    expect(spent.speak).toBe(false)
    expect(spent.reason).toContain("budget")
  })

  test("daytime important signals speak with a reason", () => {
    const decision = decide(base)
    expect(decision.speak).toBe(true)
    expect(decision.reason.length).toBeGreaterThan(0)
  })

  test("stakes matrix protects irreversible moves", () => {
    expect(decideAction("high", "high")).toBe("confirm")
    expect(decideAction("high", "low")).toBe("ask")
    expect(decideAction("low", "high")).toBe("ask")
    expect(decideAction("low", "low")).toBe("act")
  })

  test("low battery stretches the heartbeat, never shrinks it", () => {
    expect(heartbeatIntervalMinutes(80, 30)).toBe(30)
    expect(heartbeatIntervalMinutes(30, 30)).toBe(60)
    expect(heartbeatIntervalMinutes(10, 30)).toBe(120)
  })
})
