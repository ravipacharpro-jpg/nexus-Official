# Edge AI Router with Nexus

Nexus can connect to [Edge AI Router](https://edge-ai-router.vercel.app/) through its built-in OpenAI-compatible custom-provider flow. The router exposes one endpoint, `/api/v1/chat/completions`, and requires the per-user API key created by the router account.

## Configure through the Nexus UI

1. Open **Settings → Providers → Add custom provider**.
2. Use these values:
   - **Provider ID:** `edge-router`
   - **Display name:** `Edge AI Router`
   - **Base URL:** `https://edge-ai-router.vercel.app/api/v1`
   - **API key:** the key issued by Edge AI Router after creating or logging into an account
3. Add the model IDs that are enabled by the router account. Common Gemini IDs are shown below; use the exact IDs exposed by the router deployment:
   - `gemini-2.5-flash`
   - `gemini-2.5-pro`
4. Save the provider and select the model from Nexus's model picker.

The API key is stored in Nexus's provider authentication store; it is not committed to the repository or placed in the provider URL.

## Configuration example

The equivalent Nexus configuration is:

```jsonc
{
  "provider": {
    "edge-router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Edge AI Router",
      "options": {
        "baseURL": "https://edge-ai-router.vercel.app/api/v1"
      },
      "models": {
        "gemini-2.5-flash": {
          "name": "Gemini 2.5 Flash",
          "variants": [
            { "id": "low", "body": { "reasoning_effort": "low" } },
            { "id": "medium", "body": { "reasoning_effort": "medium" } },
            { "id": "high", "body": { "reasoning_effort": "high" } }
          ]
        },
        "gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro",
          "variants": [
            { "id": "low", "body": { "reasoning_effort": "low" } },
            { "id": "medium", "body": { "reasoning_effort": "medium" } },
            { "id": "high", "body": { "reasoning_effort": "high" } }
          ]
        }
      }
    }
  }
}
```

Add the router-issued key through Nexus authentication rather than adding an `apiKey` to this file. If a particular router model does not accept `reasoning_effort`, remove the variants for that model or use the parameter name documented by that router deployment.

## Selecting low, medium, or high

After the provider is connected, choose a model in the normal Nexus model picker. For a model with the configuration above, use Nexus's **model variant** action to cycle through `low`, `medium`, `high`, and the default mode. The selected variant is sent as an OpenAI-compatible request-body override; the model ID itself remains unchanged.

## Connectivity check

A request without the router-issued key should return HTTP `401`. That is expected and confirms that the deployed endpoint is reachable and protected. A valid Nexus request must include the key saved for provider ID `edge-router`.

```bash
curl -i https://edge-ai-router.vercel.app/api/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_EDGE_ROUTER_KEY' \
  --data '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"ping"}]}'
```

Do not commit `YOUR_EDGE_ROUTER_KEY` or any real API key.
