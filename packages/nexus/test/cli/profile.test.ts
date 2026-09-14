import { describe, expect, test } from "bun:test"
import { dumpRuntimeProfile } from "../../src/cli/cmd/profile"
import { RUNTIME_PROFILES } from "../../src/runtime/task-profile"

describe("profile runtime dump", () => {
  test("returns a JSON-serializable composition summary", () => {
    const dump = dumpRuntimeProfile()
    expect(RUNTIME_PROFILES[dump.profile]).toBeDefined()
    expect(dump.reason.length).toBeGreaterThan(0)
    expect(dump.runtime.platform).toBe(process.platform)
    expect(dump.skillPromptBudgetChars).toBeGreaterThan(0)
    expect(dump.vault.maxKeysPerProvider).toBeGreaterThanOrEqual(0)
    expect(() => JSON.stringify(dump)).not.toThrow()
  })

  test("explicit override wins with a flag reason", () => {
    const dump = dumpRuntimeProfile("headless")
    expect(dump.profile).toBe("headless")
    expect(dump.reason).toContain("--profile")
  })

  test("env override is reported", () => {
    process.env.NEXUS_PROFILE = "web"
    try {
      const dump = dumpRuntimeProfile()
      expect(dump.profile).toBe("web")
      expect(dump.reason).toContain("NEXUS_PROFILE")
    } finally {
      delete process.env.NEXUS_PROFILE
    }
  })
})
