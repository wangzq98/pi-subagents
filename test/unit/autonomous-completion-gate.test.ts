import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MissionRecord } from "../../src/missions/types.ts";
import { evaluateMissionCompletionGate } from "../../src/orchestrator/completion-gate.ts";

function mission(overrides: Partial<MissionRecord> = {}): MissionRecord {
	return {
		schemaVersion: 1,
		id: "mission-1",
		title: "Implement API change",
		objective: "Implement API change",
		goal: { status: "active" },
		budget: { tokens: 50000 },
		status: "active",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		runs: [],
		workflowChildren: [],
		decisions: [],
		artifacts: [],
		receipts: [],
		...overrides,
	};
}

describe("autonomous mission completion gate", () => {
	it("requires verification evidence for engineering work", () => {
		const result = evaluateMissionCompletionGate(mission());
		assert.equal(result.complete, false);
		assert.match(result.blockers.join("\n"), /verification\/review evidence/i);
	});

	it("accepts concrete test evidence", () => {
		const result = evaluateMissionCompletionGate(mission({
			artifacts: [{ kind: "status", path: "artifacts/test.log", description: "npm test passed" }],
		}));
		assert.deepEqual(result, { complete: true, blockers: [] });
	});

	it("blocks active and failed child runs", () => {
		const result = evaluateMissionCompletionGate(mission({
			runs: [
				{ runId: "run-active", mode: "single", status: "running", agent: "worker" },
				{ runId: "run-failed", mode: "single", status: "failed", agent: "reviewer" },
			],
			artifacts: [{ kind: "status", path: "test.log", description: "tests passed" }],
		}));
		assert.equal(result.complete, false);
		assert.match(result.blockers.join("\n"), /run-active.*running/i);
		assert.match(result.blockers.join("\n"), /run-failed.*failed/i);
	});

	it("blocks unresolved decisions", () => {
		const result = evaluateMissionCompletionGate(mission({
			decisions: [{
				id: "decision-1",
				status: "open",
				title: "Choose migration strategy",
				createdAt: "2026-09-01T00:00:00.000Z",
			}],
			artifacts: [{ kind: "status", path: "test.log", description: "validation passed" }],
		}));
		assert.equal(result.complete, false);
		assert.match(result.blockers.join("\n"), /open mission decision/i);
	});

	it("does not require engineering verification for a pure research mission", () => {
		const result = evaluateMissionCompletionGate(mission({
			title: "Research alternatives",
			objective: "Compare three architectural approaches and summarize tradeoffs",
		}));
		assert.deepEqual(result, { complete: true, blockers: [] });
	});
});
