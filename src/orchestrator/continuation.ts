import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../extension/config.ts";
import { collectGoalContinuationNotices } from "../missions/goal-driver.ts";
import { resolveMissionStoreLocation } from "../missions/store.ts";
import { listRetainedChildren } from "../runs/background/retained-children.ts";
import { SUBAGENT_CHILD_ENV } from "../runs/shared/pi-args.ts";
import { DIRS } from "../shared/types.ts";
import {
	appendAutonomousPolicy,
	isAutonomousOrchestrationEnabled,
	PI_SUBAGENT_AUTONOMOUS_ENV,
} from "./policy.ts";

export interface AutonomousContinuationNotice {
	missionId: string;
	message: string;
}

export function buildAutonomousContinuation(notices: readonly AutonomousContinuationNotice[]): string | undefined {
	if (notices.length === 0) return undefined;
	const lines = [
		"Autonomous completion gate is still open. Continue working on the active goal mission(s) instead of ending the task.",
		"Use subagents proactively where useful, prefer parallel independent investigation, resume retained children when appropriate, and gather concrete verification evidence before closing a mission.",
		"",
		...notices.flatMap((notice) => [
			`Mission ${notice.missionId}:`,
			notice.message,
			"",
		]),
		"Do not report completion until the mission is actually closed with sufficient implementation/verification evidence, or until a genuine user decision or exhausted budget prevents further progress.",
	];
	return lines.join("\n").trim();
}

export function registerAutonomousOrchestrator(pi: ExtensionAPI): void {
	if (process.env[SUBAGENT_CHILD_ENV] === "1" || !isAutonomousOrchestrationEnabled()) return;

	const config = loadConfig();
	let autonomousTurnId = 0;
	let continuationQueued = false;

	pi.on("before_agent_start", async (event) => ({
		systemPrompt: appendAutonomousPolicy(event.systemPrompt),
	}));

	pi.on("agent_start", () => {
		continuationQueued = false;
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (continuationQueued) return;
		const ownerSessionId = ctx.sessionManager.getSessionId();
		if (!ownerSessionId) return;

		autonomousTurnId += 1;
		try {
			const location = resolveMissionStoreLocation({
				projectRoot: ctx.cwd,
				...(config.missions ? { config: config.missions } : {}),
			});
			const retainedChildren = listRetainedChildren(DIRS.async, ownerSessionId);
			const notices = collectGoalContinuationNotices({
				location,
				ownerSessionId,
				retainedChildren,
				turnId: autonomousTurnId,
			});
			const content = buildAutonomousContinuation(notices);
			if (!content) return;

			continuationQueued = true;
			pi.sendMessage(
				{
					customType: "subagent-autonomous-continuation",
					content,
					display: false,
				},
				{ deliverAs: "followUp", triggerTurn: true },
			);
		} catch (error) {
			console.error(
				`Failed to evaluate autonomous goal continuation (${PI_SUBAGENT_AUTONOMOUS_ENV}=1):`,
				error,
			);
		}
	});
}
