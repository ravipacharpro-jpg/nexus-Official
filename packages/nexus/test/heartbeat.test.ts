import { describe, expect, test } from "bun:test"
import { check, batteryOf } from "../src/heartbeat"

const base = {
  nowMs: new Date(2026, 8, 14, 10, 0).getTime(),
  batteryPercent: 80,
  baseMinutes: 30,
  dueCount: 0,
  criticalCount: 0,
  quiet: { startHour: 22, endHour: 7 },
  alertsAt: [] as number[],
  maxAlerts: 3,
  alertWindowMs: 60 * 60 * 1000,
}

describe("heartbeat policy", () => {
  test("empty heartbeats stay silent", () => {
    const decision = check(base)
    expect(decision.run).toBe(false)
    expect(decision.speak).toBe(false)
    expect(decision.reason).toContain("empty")
  })

  test("due jobs start a turn that speaks in daytime", () => {
    const decision = check({ ...base, dueCount: 2 })
    expect(decision.run).toBe(true)
    expect(decision.speak).toBe(true)
  })

  test("critical items interrupt even at night", () => {
    const decision = check({
      ...base,
      criticalCount: 1,
      nowMs: new Date(2026, 8, 14, 3, 0).getTime(),
    })
    expect(decision.run).toBe(true)
    expect(decision.speak).toBe(true)
  })

  test("due jobs at night run silent for the morning brief", () => {
    const decision = check({ ...base, dueCount: 1, nowMs: new Date(2026, 8, 14, 3, 0).getTime() })
    expect(decision.run).toBe(true)
    expect(decision.speak).toBe(false)
  })

  test("respects the stretched interval", () => {
    const at = new Date(2026, 8, 14, 10, 0).getTime()
    const early = check({ ...base, dueCount: 1, lastRunMs: at - 10 * 60000 })
    expect(early.run).toBe(false)
    expect(early.reason).toContain("interval")
  })

  test("low battery stretches the interval", () => {
    const decision = check({ ...base, batteryPercent: 10 })
    expect(decision.intervalMinutes).toBe(120)
  })

  test("battery readings accept only finite numbers", () => {
    expect(batteryOf({ percentage: 55 })).toBe(55)
    expect(batteryOf({ percentage: 0 })).toBe(0)
    expect(batteryOf({ percentage: 140 })).toBe(100)
    expect(batteryOf({ percentage: -5 })).toBe(0)
    expect(batteryOf({ percentage: Number.NaN })).toBe(100)
    expect(batteryOf({ percentage: Number.POSITIVE_INFINITY })).toBe(100)
    expect(batteryOf({ percentage: "80" })).toBe(100)
    expect(batteryOf({})).toBe(100)
    expect(batteryOf(undefined)).toBe(100)
  })
})
