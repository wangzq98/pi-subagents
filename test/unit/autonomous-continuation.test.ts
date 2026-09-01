import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAutonomousContinuation } from "../../src/orchestrator/continuation.ts";

describe("autonomous continuation", () => {
	it("does not queue a turn when there are no incomplete goal missions", () => {
		assert.equal(buildAutonomousContinuation([]), undefined);
	});

	it("builds a completion-gate follow-up for incomplete missions", () => {
		const content = buildAutonomousContinuation([
			{
				missionId: "mission-1",
				message: "Goal mission needs attention: Fix API\nNext ready action: Resume retained child run-1",
			},
		]);
		assert.ok(content);
		assert.match(content, /completion gate is still open/i);
		assert.match(content, /Mission mission-1:/);
		assert.match(content, /Resume retained child run-1/);
		assert.match(content, /verification evidence/i);
	});

	it("includes every incomplete mission in one follow-up", () => {
		const content = buildAutonomousContinuation([
			{ missionId: "a", message: "Continue A" },
			{ missionId: "b", message: "Continue B" },
		]);
		assert.ok(content);
		assert.match(content, /Mission a:/);
		assert.match(content, /Mission b:/);
	});
});
