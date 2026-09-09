import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { capabilitySummary, detectAgentCapabilities } from "./capabilities"

describe("agent capabilities", () => {
  test("detects Termux from environment markers", () => {
    const capabilities = detectAgentCapabilities({
      TERMUX_VERSION: "0.119",
      PREFIX: "/data/data/com.termux/files/usr",
      PATH: "",
    })

    expect(capabilities.termux).toBe(true)
    expect(capabilities.platform).toBe(process.platform)
  })

  test("reports capability names without leaking environment values", () => {
    const capabilities = detectAgentCapabilities({ PATH: "" })
    const summary = capabilitySummary(capabilities)

    expect(summary.every((item) => !item.includes("/"))).toBe(true)
    expect(summary).not.toContain("API key")
  })

  test("detects tools through PATH without a `command` lookup binary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nexus-cap-"))
    try {
      await writeFile(join(dir, "git"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
      expect(detectAgentCapabilities({ PATH: dir }).git).toBe(true)
      expect(detectAgentCapabilities({ PATH: "" }).git).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
