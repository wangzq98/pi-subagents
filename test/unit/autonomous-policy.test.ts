import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	appendAutonomousPolicy,
	AUTONOMOUS_ORCHESTRATION_POLICY,
	isAutonomousOrchestrationEnabled,
} from "../../src/orchestrator/policy.ts";

describe("autonomous orchestration policy", () => {
	it("is enabled by default", () => {
		assert.equal(isAutonomousOrchestrationEnabled(undefined), true);
	});

	it("accepts common false values", () => {
		for (const value of ["0", "false", "FALSE", "no", "off", " Off "]) {
			assert.equal(isAutonomousOrchestrationEnabled(value), false, value);
		}
	});

	it("keeps other values enabled", () => {
		for (const value of ["1", "true", "yes", "on", ""]) {
			assert.equal(isAutonomousOrchestrationEnabled(value), true, value);
		}
	});

	it("injects the policy once", () => {
		const original = "Base system prompt";
		const once = appendAutonomousPolicy(original);
		const twice = appendAutonomousPolicy(once);
		assert.match(once, /Autonomous subagent orchestration/);
		assert.match(once, /proactively/i);
		assert.match(once, /verification evidence/i);
		assert.equal(twice, once);
		assert.ok(AUTONOMOUS_ORCHESTRATION_POLICY.includes("mission.create"));
	});
});
