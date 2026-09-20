#!/usr/bin/env bun
const homedir = process.env.HOME ?? "/data/data/com.termux/files/home"
const PORT = Number(process.env.NEXUS_ROUTER_BRIDGE_PORT ?? "4898")
const ROUTER = process.env.NEXUS_ROUTER_URL ?? "http://127.0.0.1:3000"
const ROUTER_DIR = process.env.NEXUS_ROUTER_DIR ?? `${homedir}/.nexus/router`

const MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-6",
  "gemini-2.5-flash",
  "gemini-3-6-fl",
  "deepseek-chat",
  "deepseek-reasoner",
  "grok-4.5",
  "mistral-large-latest",
  "qwen/qwen2.5-coder-32b-instruct",
  "meta-llama/llama-3.3-70b-instruct",
]

function modelsPayload() {
  return {
    object: "list",
    data: MODELS.map((id) => ({ id, object: "model", owned_by: "nexus-router" })),
  }
}

async function routerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ROUTER}/api/health`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureRouter(): Promise<boolean> {
  if (await routerHealth()) return true
  const log = `${process.env.TMPDIR ?? "/data/data/com.termux/files/usr/tmp"}/nexus-router.log`
  try {
    const sh = `/data/data/com.termux/files/usr/bin/sh`
    const script = [
      `cd "${ROUTER_DIR}" || exit 1`,
      `if [ ! -s dist/server.cjs ]; then`,
      `  ./node_modules/.bin/esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs || exit 1`,
      `fi`,
      `NODE_ENV=production setsid node dist/server.cjs >/dev/null 2>>"${log}" &`,
    ].join("\n")
    await Bun.$`${sh} -c ${script}`.quiet()
  } catch (error) {
    console.error(`[nexus-router-bridge] router spawn failed: ${error}`)
    return false
  }
  for (let i = 0; i < 24; i++) {
    if (await routerHealth()) return true
    await Bun.sleep(500)
  }
  return false
}

async function proxyChat(request: Request): Promise<Response> {
  let body: string
  try {
    body = await request.text()
  } catch {
    return new Response(JSON.stringify({ error: { message: "invalid body" } }), { status: 400, headers: { "content-type": "application/json" } })
  }
  const upstream = await fetch(`${ROUTER}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(request.headers.get("authorization") ? { authorization: request.headers.get("authorization")! } : {}),
    },
    body,
  })
  const contentType = upstream.headers.get("content-type") ?? "application/json"
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-cache",
  })
  if (contentType.includes("text/event-stream")) headers.set("connection", "keep-alive")
  return new Response(upstream.body, { status: upstream.status, headers })
}

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/v1/models") {
      return new Response(JSON.stringify(modelsPayload()), { headers: { "content-type": "application/json" } })
    }
    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const ready = await ensureRouter()
      if (!ready) {
        return new Response(
          JSON.stringify({
            error: {
              message: "nexus-router is not running and could not be started (log: $PREFIX/tmp/nexus-router.log). Run ~/.nexus/source/.nexus/scripts/setup-nexus-router.sh to install it.",
              type: "router_unavailable",
            },
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        )
      }
      return proxyChat(request)
    }
    return new Response(JSON.stringify({ error: { message: "not found", type: "invalid_request_error" } }), { status: 404, headers: { "content-type": "application/json" } })
  },
})
console.log(`[nexus-router-bridge] listening on 127.0.0.1:${PORT}, routing to ${ROUTER}`)