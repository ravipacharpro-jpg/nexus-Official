import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { routeModel } from "../../src/api/ModelRouter"
import { addApiKey, resetApiVaultForTests } from "../../src/api/ApiVault"

const originalHome = process.env.HOME
const homes: string[] = []

function useTemporaryHome() {
  const home = mkdtempSync(join(tmpdir(), "nexus-model-router-"))
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

describe("ModelRouter local fallback filtering", () => {
  test("excludes only implicit local fallback when local routes are disabled", () => {
    expect(routeModel("unmapped-model", { includeLocal: false })).toEqual([])
    expect(routeModel("unmapped-model")).toEqual([
      {
        alias: "unmapped-model",
        provider: "ollama",
        model: "unmapped-model",
        reason: "local/default route",
      },
    ])
  })

  test("retains an explicit Ollama route even when implicit local fallbacks are disabled", () => {
    expect(routeModel("ollama/qwen2.5-coder:3b-instruct-q4", { includeLocal: false })).toEqual([
      {
        alias: "ollama/qwen2.5-coder:3b-instruct-q4",
        provider: "ollama",
        model: "qwen2.5-coder:3b-instruct-q4",
        reason: "explicit provider/model",
      },
    ])
  })
})

describe("ModelRouter single-key policy", () => {
  test("returns only the first configured provider for an alias, no fallback chain", () => {
    useTemporaryHome()
    addApiKey("groq", "test-groq-key", "groq")
    addApiKey("openrouter", "test-openrouter-key", "openrouter")

    expect(routeModel("llama3_1", { includeLocal: false })).toEqual([
      {
        alias: "llama3_1",
        provider: "groq",
        model: "openai/gpt-oss-120b",
        reason: "preferred provider",
      },
    ])
  })

  test("returns no route for an alias when nothing is configured and local is disabled", () => {
    useTemporaryHome()

    expect(routeModel("deepseek", { includeLocal: false })).toEqual([])
    expect(routeModel("deepseek")).toEqual([
      {
        alias: "deepseek",
        provider: "ollama",
        model: "llama3",
        reason: "local fallback",
      },
    ])
  })
})
