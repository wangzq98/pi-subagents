# Main and subagent models via startup selection

This fork adds two related behaviors:

1. `PI_SUBAGENT_MODEL` is a hard override for subagent launches.
2. A single provider + single default model in `~/.pi/agent/models.json` can act as a template for models named only at startup.

## Minimal models.json

Keep only one provider and one default/template model:

```json
{
  "providers": {
    "custom": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "$CUSTOM_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "default",
          "name": "Default",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 32768,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

The first and only model is used as the template for dynamically named models. Its API type, endpoint, reasoning/input capabilities, context window, token limit, cost, compatibility options, and related model properties are copied to startup-selected models.

## Start with a bare main model name

No provider prefix is required:

```bash
pi --model glm-5.2
```

At extension startup this fork reads `--model glm-5.2`, finds the single provider in `models.json`, and temporarily registers `glm-5.2` under that provider before Pi resolves the startup model.

The API request therefore uses:

```json
{
  "model": "glm-5.2"
}
```

You do not need to add `glm-5.2` permanently to `models.json`.

## Main + subagent models

```bash
export PI_SUBAGENT_MODEL="glm-4.7"
pi --model glm-5.2
```

Result:

```text
Main Agent      -> glm-5.2
All Subagents   -> glm-4.7
```

`PI_SUBAGENT_MODEL` has higher priority than an agent's configured `model` and a per-step model override. It is also enforced again at the final child-launch boundary.

Both the main and subagent model IDs are dynamically registered from the same default model template. Child Pi processes also run the dynamic registration path, so canonical child launch values such as `custom/glm-4.7` continue to work without requiring that model to exist permanently in `models.json`.

If `PI_SUBAGENT_MODEL` is unset or contains only whitespace, upstream subagent model-selection behavior is preserved.

## Multiple providers

The zero-prefix behavior is intentionally automatic only when `models.json` contains exactly one provider.

If you later configure multiple providers, select the dynamic provider explicitly with:

```bash
export PI_DYNAMIC_MODEL_PROVIDER="custom"
pi --model glm-5.2
```

Pi's normal `--provider custom` option also takes precedence when present.

## Template constraint

The selected provider must contain exactly one configured model. This keeps the behavior deterministic: that model is the template for arbitrary startup model IDs.

## Install this fork

```bash
pi remove npm:pi-subagents 2>/dev/null || true
pi install git:github.com/wangzq98/pi-subagents
```

## Update this fork

```bash
pi update --extension git:github.com/wangzq98/pi-subagents
```

Or update all installed Pi extensions:

```bash
pi update --extensions
```
