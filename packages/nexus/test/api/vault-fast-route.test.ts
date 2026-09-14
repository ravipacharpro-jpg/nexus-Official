import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  addApiKey,
  apiVaultPublicRows,
  availableApiKeys,
  recordApiKeyLatency,
  resetApiVaultForTests,
  updateApiKeyStatus,
} from "../../src/api/ApiVault"
import { RotationEngine } from "../../src/provider/rotation"

const originalHome = process.env.HOME
const homes: string[] = []

function useTemporaryHome() {
  const home = mkdtempSync(join(tmpdir(), "nexus-vault-fast-route-"))
  homes.push(home)
  process.env.HOME = home
  resetApiVaultForTests()
  return home
}

afterEach(() => {
  resetApiVaultForTests()
  process.env.HOME = originalHome
  while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true })
})

describe("API Vault Fast Route health evidence", () => {
  test("single-key policy: adding a key replaces the previous one, exhausted key signals manual switch", () => {
    useTemporaryHome()
    const first = "test-groq-key-one"
    const second = "test-groq-key-two"
    addApiKey("groq", first, "first")
    addApiKey("groq", second, "second")

    // One model = one API: only the latest key is kept, no rotation pool.
    expect(availableApiKeys("groq").map((entry) => entry.key)).toEqual([second])

    updateApiKeyStatus("groq", second, "rate_limited")

    // No healthy key left: engine yields nothing, user switches manually.
    expect(new RotationEngine({ groq: [second] }).next("groq")).toBeUndefined()

    const row = apiVaultPublicRows().find((item) => item.provider === "groq")?.keys[0]
    expect(row?.lastFailure).toBe("rate_limited")
    expect(row?.cooldownUntil).toBeDefined()
  })

  test("keeps a single key per provider instead of an application-capped list", () => {
    useTemporaryHome()
    for (let index = 0; index < 25; index++) {
      addApiKey("groq", `test-groq-key-${index}`, `key-${index}`)
    }

    expect(availableApiKeys("groq").map((entry) => entry.key)).toEqual(["test-groq-key-24"])
    expect(apiVaultPublicRows().find((item) => item.provider === "groq")?.keys).toHaveLength(1)
  })

  test("keeps only rounded latency evidence in public vault rows", () => {
    useTemporaryHome()
    const key = "test-groq-key-latency"
    addApiKey("groq", key, "latency")

    recordApiKeyLatency("groq", key, 123.6)

    const row = apiVaultPublicRows().find((item) => item.provider === "groq")?.keys[0]
    expect(row?.lastLatencyMs).toBe(124)
    expect(row?.key).not.toContain(key)
  })
})
