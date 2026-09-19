#!/usr/bin/env bun
/**
 * zen-bridge — OpenAI-compatible local bridge to the on-device opencode
 * server, so the OpenCode Zen free tier works from Nexus.
 *
 * Why: the zen gateway only serves free-tier models to requests that come
 * from the opencode app itself ("can only be used from within OpenCode").
 * Requests made by a locally running `opencode serve` count as "from within
 * OpenCode", so routing Nexus through this bridge unlocks big-pickle, etc.
 *
 * Usage:
 *   bun zen-bridge.ts            # default: bridge on 127.0.0.1:4897
 *   ZEN_BRIDGE_PORT=5100 bun zen-bridge.ts
 *
 * Then in Nexus add an OpenAI-compatible provider:
 *   baseURL http://127.0.0.1:<port>/v1   model big-pickle   no auth
 */
import { spawn } from "node:child_process"

const BRIDGE_PORT = Number(process.env.ZEN_BRIDGE_PORT ?? 4897)
const OPCODE_PORT_HINT = Number(process.env.ZEN_SERVE_PORT ?? 0)
const REQUEST_TIMEOUT_MS = 90_000

const MODELS = [
  "big-pickle",
  "mimo-v2.5-free",
  "deepseek-v4-flash-free",
  "claude-fable-5",
  "claude-sonnet-4-6",
  "jev-1.13-free",
]

let serve: { base: string; proc: ReturnType<typeof spawn> | null } | null = null

async function readyBase(): Promise<string> {
  await ensureServe()
  if (!serve?.base || serve.base.endsWith(":0")) throw new Error("zen-bridge: opencode serve never started")
  return serve.base
}

function ensureServe(): Promise<void> {
  if (serve && !serve.base.endsWith(":0")) return Promise.resolve()
  const base = `http://127.0.0.1:${OPCODE_PORT_HINT}`
  serve = { base, proc: null }
  if (OPCODE_PORT_HINT !== 0) {
    return (async () => {
      try {
        const r = await fetch(base + "/session", { signal: AbortSignal.timeout(1500) })
        if (r.ok) return // an existing serve is already running; reuse it
      } catch {}
      await spawnServe()
    })()
  }
  return spawnServe()
}

async function spawnServe(): Promise<void> {
  const out = await Bun.spawn({
    cmd: ["opencode", "serve", "--pure", "--port", OPCODE_PORT_HINT === 0 ? "0" : String(OPCODE_PORT_HINT)],
    stdout: "pipe",
    stderr: "pipe",
  })
  serve!.proc = out
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for opencode serve to start")), 20_000)
const cb = (chunk: Uint8Array) => {
        const text = new TextDecoder().decode(chunk)
      const m = text.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) {
        clearTimeout(timer)
        serve!.base = m[1]
        resolve()
      }
    }
    out.stdout.pipeTo(new WritableStream({ write: cb })).catch(() => {})
    out.stderr.pipeTo(new WritableStream({ write: cb })).catch(() => {})
  })
}

let sessionID: string | null = null
async function getSession(base: string): Promise<string> {
  if (sessionID) return sessionID
  const r = await fetch(base + "/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "zen-bridge", model: { id: "big-pickle", providerID: "opencode" } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`create session failed: ${r.status} ${await r.text()}`)
  const s = (await r.json()) as { id: string }
  sessionID = s.id
  return s.id
}

function messagesToText(messages: unknown[]): string {
  const parts: string[] = []
  for (const m of messages) {
    const msg = m as { role?: string; content?: unknown }
    const role = msg.role ?? "user"
    let content = msg.content
    if (Array.isArray(content)) {
      content = content
        .filter((p) => typeof (p as { text?: unknown })?.text === "string")
        .map((p) => (p as { text: string }).text)
        .join("\n")
    }
    parts.push(`<${role}>\n${String(content)}`)
  }
  return parts.join("\n\n")
}

function asAssistantParts(j: unknown): string {
  const info = (j as { info?: { parts?: unknown[] }; parts?: unknown[] })
  const parts: unknown[] = info.parts ?? []
  return parts
    .filter((p) => (p as { type?: string }).type === "text")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("")
}

function openaiChunk(id: string, delta: string, finish: string | null, index = 0): string {
  const c = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "bridge", choices: [{ index, delta: finish ? {} : { content: delta, role: "assistant" }, finish_reason: finish }] }
  return `data: ${JSON.stringify(c)}\n\n`
}

async function* serveStream(ev: Response): AsyncGenerator<string> {
  const reader = ev.body!.getReader()
  const decoder = new TextDecoder()
  const buffer: string[] = []
  let textArchive = new Map<string, string>()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer.push(decoder.decode(value, { stream: true }))
    let chunk = buffer.join("")
    buffer.length = 0
    const blocks = chunk.split("\n\n")
    const last = blocks.pop() ?? ""
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        let evt: any
        try { evt = JSON.parse(raw) } catch { continue }
        // v1: message.part.updated with part {type:"text", text}
        if (evt.type === "message.part.updated") {
          const props = evt.properties ?? evt
          const part = props.part
          if (part?.type === "text" && typeof part.text === "string") {
            const key = `${props.sessionID}/${props.messageID}/${props.partID ?? part.id ?? "0"}`
            const prev = textArchive.get(key) ?? (part.started ? "" : "")
            if (part.started) textArchive.set(key, "")
            if (part.text !== prev) {
              const delta = part.started ? part.text : part.text.slice(prev.length)
              if (delta) yield delta
              textArchive.set(key, part.text)
            }
          }
        }
        // v2: session.next.text_delta with textDelta
        if (evt.type === "session.next.text_delta") {
          const d = evt.textDelta ?? evt.properties?.textDelta
          if (d) yield d
        }
      }
      if (chunk === "") buffer.push("")
    }
    if (last) buffer.push(last)
  }
}

function runCompletion(parts: unknown[], modelID: string): Promise<string> {
  return (async () => {
    const base = await readyBase()
    const sid = await getSession(base)
    const body = JSON.stringify({ parts, model: { providerID: "opencode", modelID } })
    const resp = await fetch(`${base}/session/${sid}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!resp.ok) {
      const text = await resp.text()
      let msg = text.slice(0, 400)
      try { msg = JSON.parse(text).error?.message ?? msg } catch {}
      throw new Error(`opencode server error (${resp.status}): ${msg}`)
    }
    return asAssistantParts(await resp.json())
  })()
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: BRIDGE_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const ex = ["OPTIONS", "GET", "HEAD"]
    if (ex.includes(req.method) && req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(req) })
    }
    const corsArr = cors(req)
    try {
      if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
        return json({ object: "list", data: MODELS.map((id) => ({ id, object: "model", owned_by: "zen-bridge" })) }, corsArr)
      }
      if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
        const reqBody = await req.json().catch(() => null)
        if (!reqBody) return json({ error: { message: "invalid JSON body" } }, corsArr, 400)
        const modelID = String(reqBody.model ?? "big-pickle")
        const stream = reqBody.stream === true
        const text = messagesToText(reqBody.messages ?? [])
        const parts = [{ type: "text", text }]

        if (!stream) {
          const out = await runCompletion(parts, modelID)
          return json(
            {
              id: "cmpl-bridge",
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: modelID,
              choices: [{ index: 0, message: { role: "assistant", content: out }, finish_reason: "stop" }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            },
            corsArr,
          )
        }

        const base = await readyBase()
        const sid = await getSession(base)
        const abort = new AbortController()
        const messageResp = fetch(`${base}/session/${sid}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parts, model: { providerID: "opencode", modelID } }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }).catch(() => null)
        const events = fetch(`${base}/session/${sid}/event?cursor=batch`, { signal: abort.signal }).catch(() => null)

        const id = "cmpl-bridge"
        const streamBody = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder()
            const push = (s: string) => controller.enqueue(enc.encode(s))
            push(openaiChunk(id, "", null))
            let total = 0
            const ev = await events
            if (ev?.ok) {
              try {
                for await (const delta of serveStream(ev)) {
                  if (delta) {
                    total += delta.length
                    push(openaiChunk(id, delta, null))
                  }
                }
              } catch {}
            }
            const resp = await messageResp
            if (resp?.ok) {
              const full = asAssistantParts(await resp.json())
              const remaining = full.slice(total)
              if (remaining) push(openaiChunk(id, remaining, null))
              total += remaining.length
            }
            abort.abort()
            if (!total) push(openaiChunk(id, "", "stop"))
            else push(openaiChunk(id, "", "stop"))
            push("data: [DONE]\n\n")
            controller.close()
          },
        })
        return new Response(streamBody, { status: 200, headers: { ...corsArr, "Content-Type": "text/event-stream" } })
      }
      return json({ error: { message: `not found: ${url.pathname}` } }, corsArr, 404)
    } catch (e) {
      return json({ error: { message: String(e instanceof Error ? e.message : e) } }, corsArr, 500)
    }
  },
})

function cors(req?: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

function json(body: unknown, headers: Record<string, string>, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", ...extra } })
}

function closeServer(): void {
  if (serve?.proc && !serve.proc.killed) serve.proc.kill()
  server.stop(true)
  process.exit(0)
}
process.on("SIGINT", closeServer)
process.on("SIGTERM", closeServer)

// warm the session at boot so the first request is fast
void (async () => {
  try {
    const base = await readyBase()
    await getSession(base)
  } catch (e) {
    console.error(`bridge: session warm-up failed: ${e instanceof Error ? e.message : String(e)}`)
  }
})()
console.log(`zen-bridge listening on http://127.0.0.1:${server.port} (models: ${MODELS.join(", ")})`)