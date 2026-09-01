import * as fs from "node:fs";
import * as path from "node:path";
import type { MissionRecord, MissionRunLink } from "../missions/types.ts";

const ACTIVE_STATUSES = new Set(["queued", "running", "active"]);
const FAILED_STATUSES = new Set(["failed", "error", "paused", "cancelled"]);
const SUCCESS_STATUSES = new Set(["completed", "succeeded", "success", "passed", "done"]);
const ENGINEERING_OBJECTIVE = /\b(fix|bug|implement|implementation|feature|refactor|code|coding|api|backend|frontend|service|server|client|database|migration|test|build|compile|typecheck|lint|deploy|configuration|config)\b/i;
const VERIFICATION_EVIDENCE = /\b(test|tests|tested|typecheck|type-check|build|compile|lint|verify|verified|verification|validate|validation|runtime|smoke|ci|check|logs?)\b/i;
const REVIEW_AGENT = /\b(review|reviewer|critic|audit|qa)\b/i;
const WORKER_AGENT = /\b(worker|implement|coder|developer|fix|builder)\b/i;

export interface CompletionGateResult {
	complete: boolean;
	blockers: string[];
}

function runStatus(run: MissionRunLink): string | undefined {
	if (!run.asyncDir) return run.status;
	const statusPath = path.join(run.asyncDir, "status.json");
	try {
		if (!fs.existsSync(statusPath)) return run.status;
		const parsed = JSON.parse(fs.readFileSync(statusPath, "utf-8")) as { state?: unknown };
		return typeof parsed.state === "string" && parsed.state.trim() ? parsed.state : run.status;
	} catch {
		return run.status;
	}
}

function requiresVerification(record: MissionRecord): boolean {
	if (ENGINEERING_OBJECTIVE.test(`${record.title}\n${record.objective}\n${record.labels?.join(" ") ?? ""}`)) return true;
	if (record.artifacts.some((artifact) => artifact.kind === "patch")) return true;
	return record.runs.some((run) => WORKER_AGENT.test(run.agent ?? ""));
}

function hasVerificationEvidence(record: MissionRecord): boolean {
	if (record.artifacts.some((artifact) => {
		if (artifact.kind === "review") return true;
		return artifact.kind === "status" && VERIFICATION_EVIDENCE.test(`${artifact.path} ${artifact.description ?? ""}`);
	})) return true;
	if (record.receipts.some((receipt) => (receipt.kind === "ci" || receipt.kind === "deployment") && receipt.status === "succeeded")) return true;
	return record.runs.some((run) => {
		const status = runStatus(run);
		return REVIEW_AGENT.test(run.agent ?? "") && status !== undefined && SUCCESS_STATUSES.has(status);
	});
}

export function evaluateMissionCompletionGate(record: MissionRecord): CompletionGateResult {
	const blockers: string[] = [];

	for (const run of record.runs) {
		const status = runStatus(run);
		if (status && ACTIVE_STATUSES.has(status)) blockers.push(`Run ${run.runId} is still ${status}.`);
		else if (status && FAILED_STATUSES.has(status)) blockers.push(`Run ${run.runId} ended as ${status}; recover or explicitly close the mission as failed/cancelled.`);
	}

	for (const child of record.workflowChildren) {
		if (ACTIVE_STATUSES.has(child.status)) blockers.push(`Workflow child ${child.key} is still ${child.status}.`);
		else if (FAILED_STATUSES.has(child.status)) blockers.push(`Workflow child ${child.key} ended as ${child.status}.`);
	}

	const openDecisions = record.decisions.filter((decision) => decision.status === "open");
	if (openDecisions.length > 0) {
		blockers.push(`Resolve ${openDecisions.length} open mission decision${openDecisions.length === 1 ? "" : "s"} before completion.`);
	}

	if (requiresVerification(record) && !hasVerificationEvidence(record)) {
		blockers.push("No concrete verification/review evidence is attached. Run relevant tests/checks or an independent review and attach the evidence before completion.");
	}

	return { complete: blockers.length === 0, blockers };
}
