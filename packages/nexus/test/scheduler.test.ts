import { describe, expect, test, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  addJob,
  describeJob,
  dueJobs,
  loadStore,
  markRun,
  nextRun,
  parseCron,
  removeJob,
  saveStore,
} from "../src/scheduler"

const dirs: string[] = []
function tmpdirNew() {
  const dir = mkdtempSync(join(tmpdir(), "nexus-scheduler-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe("cron parser", () => {
  test("accepts stars, lists, ranges, and steps", () => {
    expect(parseCron("* * * * *")).toBeDefined()
    expect(parseCron("0 9 * * 1-5")).toBeDefined()
    expect(parseCron("*/15 8-18 * * *")).toBeDefined()
    expect(parseCron("0,30 9,17 1,15 * *")).toBeDefined()
  })

  test("rejects malformed expressions", () => {
    expect(parseCron("* * * *")).toBeUndefined()
    expect(parseCron("* * * * * *")).toBeUndefined()
    expect(parseCron("61 * * * *")).toBeUndefined()
    expect(parseCron("*/0 * * * *")).toBeUndefined()
    expect(parseCron("9-8 * * * *")).toBeUndefined()
    expect(parseCron("nope * * * *")).toBeUndefined()
  })

  test("next run is strictly after now", () => {
    const cron = parseCron("0 9 * * *")!
    // 2026-09-14 08:00 local -> next 09:00 same day.
    const morning = new Date(2026, 8, 14, 8, 0).getTime()
    const next = nextRun(cron, morning)!
    const date = new Date(next)
    expect(date.getHours()).toBe(9)
    expect(date.getMinutes()).toBe(0)
    // Exactly at 09:00 -> next day 09:00.
    const atNine = new Date(2026, 8, 14, 9, 0).getTime()
    expect(new Date(nextRun(cron, atNine)!).getDate()).toBe(15)
  })

  test("weekday restriction skips weekends", () => {
    const cron = parseCron("0 9 * * 1-5")!
    // 2026-09-18 is a Friday 10:00 -> next Monday 09:00 (Sep 21).
    const friday = new Date(2026, 8, 18, 10, 0).getTime()
    const next = new Date(nextRun(cron, friday)!)
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(21)
  })
})

describe("scheduler store", () => {
  test("round-trips jobs through disk", () => {
    const dir = tmpdirNew()
    const store = addJob({ jobs: [] }, { id: "a", kind: "once", at: 123, instructions: "say hi" }, 100)
    saveStore(store, dir)
    const loaded = loadStore(dir)
    expect(loaded.jobs).toHaveLength(1)
    expect(loaded.jobs[0].createdAt).toBe(100)
    expect(loaded.jobs[0].runs).toBe(0)
  })

  test("skips corrupt stores and removes by id", () => {
    const dir = tmpdirNew()
    expect(loadStore(dir).jobs).toEqual([])
    const store = addJob({ jobs: [] }, { id: "a", kind: "once", instructions: "x" })
    const removed = removeJob(store, "missing")
    expect(removed.removed).toBe(false)
    expect(removeJob(store, "a").removed).toBe(true)
    expect(removeJob(store, "a").store.jobs).toHaveLength(0)
  })

  test("one-shots fire once, crons fire per window", () => {
    const now = new Date(2026, 8, 14, 10, 0).getTime()
    let store = addJob({ jobs: [] }, { id: "once", kind: "once", at: now - 1000, instructions: "remind" }, now - 2000)
    store = addJob(store, { id: "daily", kind: "cron", expr: "0 9 * * *", instructions: "brief" }, now - 7200000)
    const due = dueJobs(store, now).map((item) => item.job.id)
    expect(due).toContain("once")
    expect(due).toContain("daily")
    const after = markRun(markRun(store, "once", now), "daily", now)
    expect(dueJobs(after, now)).toHaveLength(0)
    expect(after.jobs.find((job) => job.id === "once")?.runs).toBe(1)
  })

  test("describe fits one line per job", () => {
    const store = addJob({ jobs: [] }, { id: "a", kind: "cron", expr: "0 9 * * *", instructions: "brief me" })
    expect(describeJob(store.jobs[0])).toContain("a [cron 0 9 * * *]")
  })
})
