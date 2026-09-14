import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { Argv } from "yargs"
import { parse } from "jsonc-parser"
import { Global } from "@nexus-ai/core/global"
import { denyRules, suggestLines, applyCorrections } from "../../corrections"
import { cmd } from "./cmd"

function configPermission(): unknown {
  for (const file of ["nexus.jsonc", "nexus.json", "config.json"]) {
    const full = path.join(Global.Path.config, file)
    if (!existsSync(full)) continue
    try {
      const data: unknown = parse(readFileSync(full, "utf8"))
      if (data && typeof data === "object" && "permission" in data) return data.permission
      continue
    } catch {
      continue
    }
  }
  return undefined
}

const StandingSuggestCommand = cmd({
  command: "suggest",
  describe: "draft standing orders from your past permission denials",
  builder: (yargs: Argv) =>
    yargs
      .option("json", { type: "boolean", default: false })
      .option("apply", { type: "boolean", default: false, describe: "append suggestions to this project's standing orders" }),
  handler: async (args: { json?: boolean; apply?: boolean }) => {
    const lines = suggestLines(denyRules(configPermission()))
    if (args.apply) {
      const dir = path.join(process.cwd(), ".nexus")
      const file = path.join(dir, "standing-orders.md")
      mkdirSync(dir, { recursive: true })
      const previous = existsSync(file) ? readFileSync(file, "utf8") : "# Standing Orders\n\n"
      const result = applyCorrections(previous, lines)
      if (result.added > 0) writeFileSync(file, result.text)
      if (args.json) {
        console.log(JSON.stringify({ applied: result.added, skipped: lines.length - result.added }, null, 2))
        return
      }
      console.log(
        result.added === 0
          ? "Already saved. Nothing new to append."
          : `Appended ${result.added} correction(s) to ${file}. Review and edit freely.`,
      )
      return
    }
    if (args.json) {
      console.log(JSON.stringify(lines, null, 2))
      return
    }
    if (lines.length === 0) {
      console.log("No denials recorded. Deny a tool once and its lesson shows up here.")
      return
    }
    console.log("Suggested standing orders (re-run with --apply to save):")
    for (const line of lines) console.log(`- ${line}`)
  },
})

const StandingListCommand = cmd({
  command: "list",
  describe: "show active standing order files",
  builder: (yargs: Argv) => yargs.option("json", { type: "boolean", default: false }),
  handler: async (args: { json?: boolean }) => {
    const home = process.env.NEXUS_TEST_HOME ?? homedir()
    const files = [
      path.join(process.cwd(), ".nexus", "standing-orders.md"),
      path.join(home, ".nexus", "standing-orders.md"),
    ]
    const found = files.filter((file) => existsSync(file))
    if (args.json) {
      console.log(JSON.stringify(found.map((file) => ({ file, content: readFileSync(file, "utf8") })), null, 2))
      return
    }
    if (found.length === 0) {
      console.log("No standing orders files. Create .nexus/standing-orders.md in a project to set permanent instructions.")
      return
    }
    for (const file of found) console.log(`--- ${file} ---\n${readFileSync(file, "utf8")}`)
  },
})

export const StandingCommand = cmd({
  command: "standing",
  describe: "permanent instructions injected into every session",
  builder: (yargs: Argv) => yargs.command(StandingSuggestCommand).command(StandingListCommand).demandCommand(),
  handler: () => undefined,
})
