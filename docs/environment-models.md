# Main and subagent models via environment variables

This fork adds `PI_SUBAGENT_MODEL` as a hard override for subagent launches.

## Two-model setup

Use one shell variable for the Pi main session and one for every subagent:

```bash
export PI_MAIN_MODEL="custom/glm-5.2"
export PI_SUBAGENT_MODEL="custom/glm-4.7"

pi --model "$PI_MAIN_MODEL"
```

`PI_MAIN_MODEL` is a shell-side convenience variable. Pi itself receives the main model through its normal `--model` option.

`PI_SUBAGENT_MODEL` is read by this fork of `pi-subagents`. When non-empty, it has higher priority than an agent's configured `model` and a per-step model override. It is also enforced again at the final child-launch boundary so callers that pass pre-resolved behavior cannot bypass it.

If `PI_SUBAGENT_MODEL` is unset or contains only whitespace, the upstream model-selection behavior is preserved.

## Same model for main and subagents

```bash
export PI_MAIN_MODEL="custom/glm-5.2"
export PI_SUBAGENT_MODEL="custom/glm-5.2"

pi --model "$PI_MAIN_MODEL"
```

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
