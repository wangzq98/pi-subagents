import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildDynamicModelPlan,
	PI_DYNAMIC_MODEL_PROVIDER_ENV,
	readStartupOption,
	stripModelsJsonComments,
} from "../../src/extension/dynamic-model-provider.ts";

const singleProviderConfig = {
	providers: {
		custom: {
			baseUrl: "https://api.example.com/v1",
			api: "openai-completions",
			models: [
				{
					id: "default",
					name: "Default",
					reasoning: true,
					input: ["text", "image"] as Array<"text" | "image">,
					contextWindow: 200000,
					maxTokens: 32768,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				},
			],
		},
	},
};

describe("dynamic startup model provider", () => {
	it("reads Pi startup --model and --provider options", () => {
		const argv = ["--model", "glm-5.2", "--provider", "custom"];
		assert.equal(readStartupOption(argv, "--model"), "glm-5.2");
		assert.equal(readStartupOption(argv, "--provider"), "custom");
	});

	it("registers bare main and subagent model ids from one default template", () => {
		const plan = buildDynamicModelPlan(singleProviderConfig, "glm-5.2", "glm-4.7");
		assert.equal(plan?.providerId, "custom");
		assert.deepEqual(plan?.models.map((model) => model.id), ["default", "glm-5.2", "glm-4.7"]);
		const main = plan?.models.find((model) => model.id === "glm-5.2");
		assert.equal(main?.reasoning, true);
		assert.equal(main?.contextWindow, 200000);
		assert.equal(main?.maxTokens, 32768);
	});

	it("strips the selected provider prefix when a child receives a canonical model id", () => {
		const plan = buildDynamicModelPlan(singleProviderConfig, "custom/glm-5.2", "custom/glm-4.7");
		assert.deepEqual(plan?.models.map((model) => model.id), ["default", "glm-5.2", "glm-4.7"]);
	});

	it("deduplicates the configured default and requested models", () => {
		const plan = buildDynamicModelPlan(singleProviderConfig, "default", "default");
		assert.deepEqual(plan?.models.map((model) => model.id), ["default"]);
	});

	it("ignores inherit as a dynamic subagent model", () => {
		const plan = buildDynamicModelPlan(singleProviderConfig, "glm-5.2", "inherit");
		assert.deepEqual(plan?.models.map((model) => model.id), ["default", "glm-5.2"]);
	});

	it("requires an explicit provider override when models.json contains multiple providers", () => {
		const config = {
			providers: {
				custom: singleProviderConfig.providers.custom,
				other: singleProviderConfig.providers.custom,
			},
		};
		assert.throws(
			() => buildDynamicModelPlan(config, "glm-5.2", undefined),
			new RegExp(PI_DYNAMIC_MODEL_PROVIDER_ENV),
		);
		const plan = buildDynamicModelPlan(config, "glm-5.2", undefined, "custom");
		assert.equal(plan?.providerId, "custom");
	});

	it("requires exactly one configured template model", () => {
		const config = {
			providers: {
				custom: {
					...singleProviderConfig.providers.custom,
					models: [
						...singleProviderConfig.providers.custom.models,
						{ ...singleProviderConfig.providers.custom.models[0], id: "second" },
					],
				},
			},
		};
		assert.throws(
			() => buildDynamicModelPlan(config, "glm-5.2", undefined),
			/exactly one template model/,
		);
	});

	it("parses the same comments and trailing commas accepted by Pi models.json", () => {
		const raw = `{
			// provider config
			"providers": {
				"custom": {
					"models": [{ "id": "default", }],
				},
			},
		}`;
		const parsed = JSON.parse(stripModelsJsonComments(raw));
		assert.equal(parsed.providers.custom.models[0].id, "default");
	});
});
