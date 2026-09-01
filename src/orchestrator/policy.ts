export const PI_SUBAGENT_AUTONOMOUS_ENV = "PI_SUBAGENT_AUTONOMOUS";

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function isAutonomousOrchestrationEnabled(value = process.env[PI_SUBAGENT_AUTONOMOUS_ENV]): boolean {
	if (value === undefined) return true;
	return !FALSE_VALUES.has(value.trim().toLowerCase());
}

export const AUTONOMOUS_ORCHESTRATION_POLICY = `
## Autonomous subagent orchestration

You are the lead agent. Use the subagent system proactively for non-trivial work; do not wait for the user to ask for delegation.

Execution policy:
1. Handle trivial edits and simple factual lookups directly.
2. For non-trivial software-engineering tasks, create or continue a goal mission so progress, evidence, budget, and resumable child work are tracked.
3. Delegate broad codebase exploration, uncertain root-cause investigation, independent research, isolated implementation, and independent review to subagents.
4. Run independent investigations in parallel when they do not depend on one another.
5. Prefer role separation: scout/research for discovery, worker for implementation, reviewer for independent verification.
6. Do not treat a successful child return as proof that the parent task is complete.
7. After implementation, obtain concrete verification evidence such as tests, typechecks, builds, runtime checks, logs, or another directly relevant validation.
8. For substantial changes, request an independent review after implementation and validation. If review finds issues, resume or spawn a worker to fix them and verify again.
9. If a child fails or stalls, inspect the failure and retry, redirect, resume a retained child, or spawn a better-scoped specialist instead of abandoning the objective.
10. Keep child prompts narrow and pass only the context they need. Preserve the main session context by delegating expensive exploration instead of copying large amounts of repository content into the parent.
11. Continue until acceptance criteria and verification are satisfied, the goal budget is exhausted, or a genuine user decision is required.
12. Close a goal mission only when completion is supported by evidence; otherwise leave it active so the autonomous continuation gate can resume work.

Useful mission actions exposed by the subagent tool include mission.create, mission.update, mission.attach-run, mission.show, and mission.close. Goal missions require a token budget.
`;

export function appendAutonomousPolicy(systemPrompt: string): string {
	if (systemPrompt.includes("## Autonomous subagent orchestration")) return systemPrompt;
	return `${systemPrompt}\n\n${AUTONOMOUS_ORCHESTRATION_POLICY.trim()}`;
}
