import { existsSync, readFileSync } from "node:fs"
import type { Argv } from "yargs"
import { Global } from "@nexus-ai/core/global"
import { distillNew, lessonsPath } from "../../lessons"
import { cmd } from "./cmd"

const LessonsListCommand = cmd({
  command: "list",
  describe: "print distilled lessons from the failure museum",
  builder: (yargs: Argv) => yargs.option("json", { type: "boolean", default: false }),
  handler: async (args: { json?: boolean }) => {
    const file = lessonsPath(Global.Path.state)
    if (!existsSync(file)) {
      console.log(args.json ? "[]" : "Museum is empty. Run `nexus lessons distill` after incidents occur.")
      return
    }
    if (args.json) {
      console.log(JSON.stringify({ file, content: readFileSync(file, "utf8") }))
      return
    }
    console.log(readFileSync(file, "utf8"))
  },
})

const LessonsDistillCommand = cmd({
  command: "distill",
  describe: "distill new lessons from incident files into LESSONS.md",
  builder: (yargs: Argv) => yargs.option("json", { type: "boolean", default: false }),
  handler: async (args: { json?: boolean }) => {
    const result = distillNew(Global.Path.state)
    if (args.json) {
      console.log(JSON.stringify({ added: result.added, lessons: result.lessons }, null, 2))
      return
    }
    console.log(result.added === 0 ? "No new lessons." : `Distilled ${result.added} lesson(s) into LESSONS.md.`)
    for (const lesson of result.lessons) console.log(`- [${lesson.severity}] ${lesson.text}`)
  },
})

export const LessonsCommand = cmd({
  command: "lessons",
  describe: "failure museum: distill and review lessons from past incidents",
  builder: (yargs: Argv) => yargs.command(LessonsListCommand).command(LessonsDistillCommand).demandCommand(),
  handler: () => undefined,
})
