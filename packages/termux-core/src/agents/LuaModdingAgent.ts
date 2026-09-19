export class LuaModdingAgent {
  static async formatScript(script: string) {
    const formatted =
      script
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/\s+$/, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+$/, "") + "\n"
    return { ok: true, formatted, changed: formatted !== script, changes: ["normalized line endings and trailing whitespace"] }
  }
}
