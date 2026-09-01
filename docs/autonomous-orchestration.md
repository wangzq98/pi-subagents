# Autonomous orchestration

This fork enables a lightweight autonomous orchestration policy by default for the parent Pi session.

The goal is to preserve Pi's low-context footprint while making the main agent more proactive about delegation, parallel investigation, verification, review, and continuing unfinished goal missions.

## Default behavior

Start Pi normally:

```bash
export PI_SUBAGENT_MODEL="glm-4.7"
pi --model "gpt-5.6-terra[1m]"
```

The parent system prompt receives an orchestration policy that tells it to:

- handle trivial work directly;
- create/continue goal missions for non-trivial engineering work;
- proactively use subagents instead of waiting for the user to request them;
- parallelize independent investigation;
- separate scout/research, worker, and reviewer roles;
- validate implementations with concrete evidence;
- independently review substantial changes;
- retry, redirect, or resume retained children after failures;
- avoid declaring success merely because a child returned successfully.

Child Pi processes do not receive another copy of the parent orchestrator policy.

## Hard completion gate

For goal missions, `mission.close` with the default/completed status is intercepted before the tool executes.

Completion is blocked when any of these conditions are present:

- a linked run is still queued/running/active;
- a linked run failed, errored, paused, or was cancelled;
- a workflow child is still active or failed;
- a mission decision is still open;
- an engineering/code objective has no concrete verification or review evidence.

Verification evidence can come from status/review artifacts, successful CI/deployment receipts, or a successful reviewer/QA-style run. Engineering objectives are detected conservatively from the mission objective/title/labels and implementation artifacts/runs.

`mission.close` with `failed` or `cancelled` is not blocked by this gate, so the agent can terminate a mission honestly when recovery is not possible.

## Autonomous completion continuation

The extension already tracks goal missions, budgets, active runs, and resumable children. This fork reuses that state as a continuation gate.

When the parent agent reaches `agent_end`, the orchestrator checks for active goal missions that:

- still need attention;
- have no currently active child run;
- still have token budget available.

If such a mission exists, a hidden `followUp` message is queued with `triggerTurn: true`. The parent therefore continues working instead of stopping after one pass.

The continuation message includes the existing mission driver's next-ready-action guidance, including retained-child resume hints when available. If a genuine user decision is required, the parent should surface that decision rather than inventing an irreversible choice.

The loop stops naturally when the mission is closed, paused, budget-exhausted, blocked on a genuine user decision, or otherwise no longer produces a continuation notice.

## Disable autonomous orchestration

Set:

```bash
export PI_SUBAGENT_AUTONOMOUS=0
```

or for one invocation:

```bash
PI_SUBAGENT_AUTONOMOUS=0 pi --model "gpt-5.6-terra[1m]"
```

The values `0`, `false`, `no`, and `off` disable the feature (case-insensitive). Any other value leaves it enabled.

This switch controls the autonomous parent policy, the hard goal-completion gate, and automatic goal continuation. Manual subagent calls, workflows, missions, and `PI_SUBAGENT_MODEL` continue to work normally.

## Recommended two-model setup

```bash
export PI_SUBAGENT_MODEL="glm-4.7"
pi --model "gpt-5.6-terra[1m]"
```

With the dynamic model support in this fork, the provider prefix does not need to be written on the command line when `models.json` contains one provider and one template model.
