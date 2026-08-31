import * as fs from "node:fs";
import * as path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PI_SUBAGENT_MODEL_ENV } from "../runs/shared/child-launch-plan.ts";
import { getAgentDir } from "../shared/utils.ts";

export const PI_DYNAMIC_MODEL_PROVIDER_ENV = "PI_DYNAMIC_MODEL_PROVIDER";

interface ModelsJsonModel {
	id: string;
	name?: string;
	api?: string;
	baseUrl?: string;
	reasoning?: boolean;
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
	input?: Array<"text" | "image">;
	cost?: Model<Api>["cost"];
	contextWindow?: number;
	maxTokens?: number;
	samplingParams?: Record<string, unknown>;
	headers?: Record<string, string>;
	compat?: Model<Api>["compat"];
}

interface ModelsJsonProvider {
	api?: string;
	baseUrl?: string;
	compat?: Model<Api>["compat"];
	models?: ModelsJsonModel[];
}

interface ModelsJson {
	providers?: Record<string, ModelsJsonProvider>;
}

export interface DynamicModelDefinition {
	id: string;
	name: string;
	api?: Api;
	baseUrl?: string;
	reasoning: boolean;
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
	input: Array<"text" | "image">;
	cost: Model<Api>["cost"];
	contextWindow: number;
	maxTokens: number;
	samplingParams?: Record<string, unknown>;
	headers?: Record<string, string>;
	compat?: Model<Api>["compat"];
}

export interface DynamicModelPlan {
	providerId: string;
	models: DynamicModelDefinition[];
}

/** Keep parsing compatible with Pi's models.json behavior: // comments and trailing commas are allowed. */
export function stripModelsJsonComments(input: string): string {
	return input
		.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => (match[0] === '"' ? match : ""))
		.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail) => tail ?? (match[0] === '"' ? match : ""));
}

export function readStartupOption(argv: readonly string[], option: "--model" | "--provider"): string | undefined {
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] !== option) continue;
		const value = argv[index + 1]?.trim();
		return value || undefined;
	}
	return undefined;
}

function normalizeRequestedModel(value: string | undefined, providerId: string): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed || trimmed === "inherit") return undefined;
	const prefix = `${providerId}/`;
	return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) || undefined : trimmed;
}

function mergeCompat(
	providerCompat: Model<Api>["compat"] | undefined,
	modelCompat: Model<Api>["compat"] | undefined,
): Model<Api>["compat"] | undefined {
	if (!providerCompat) return modelCompat;
	if (!modelCompat) return providerCompat;
	const merged = { ...providerCompat, ...modelCompat } as NonNullable<Model<Api>["compat"]>;
	const providerRecord = providerCompat as Record<string, unknown>;
	const modelRecord = modelCompat as Record<string, unknown>;
	const mergedRecord = merged as Record<string, unknown>;
	for (const key of ["openRouterRouting", "vercelGatewayRouting", "chatTemplateKwargs", "chatTemplateArgs"] as const) {
		const left = providerRecord[key];
		const right = modelRecord[key];
		if ((typeof left === "object" && left !== null) || (typeof right === "object" && right !== null)) {
			mergedRecord[key] = { ...(left as object | undefined), ...(right as object | undefined) };
		}
	}
	return merged;
}

function toDynamicModelDefinition(
	modelId: string,
	template: ModelsJsonModel,
	provider: ModelsJsonProvider,
): DynamicModelDefinition {
	return {
		id: modelId,
		name: modelId === template.id ? (template.name ?? template.id) : modelId,
		...(template.api ?? provider.api ? { api: (template.api ?? provider.api) as Api } : {}),
		...(template.baseUrl ?? provider.baseUrl ? { baseUrl: template.baseUrl ?? provider.baseUrl } : {}),
		reasoning: template.reasoning ?? false,
		...(template.thinkingLevelMap ? { thinkingLevelMap: template.thinkingLevelMap } : {}),
		input: template.input ? [...template.input] : ["text"],
		cost: template.cost ? { ...template.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: template.contextWindow ?? 128000,
		maxTokens: template.maxTokens ?? 16384,
		...(template.samplingParams ? { samplingParams: { ...template.samplingParams } } : {}),
		...(template.headers ? { headers: { ...template.headers } } : {}),
		...(mergeCompat(provider.compat, template.compat)
			? { compat: mergeCompat(provider.compat, template.compat) }
			: {}),
	};
}

export function buildDynamicModelPlan(
	config: ModelsJson,
	mainModel: string | undefined,
	subagentModel: string | undefined,
	providerOverride?: string,
): DynamicModelPlan | undefined {
	if (!mainModel?.trim() && !subagentModel?.trim()) return undefined;

	const providers = config.providers ?? {};
	const configuredProviderId = providerOverride?.trim();
	let providerId: string;
	let provider: ModelsJsonProvider | undefined;

	if (configuredProviderId) {
		providerId = configuredProviderId;
		provider = providers[providerId];
		if (!provider) {
			throw new Error(`${PI_DYNAMIC_MODEL_PROVIDER_ENV} points to unknown provider '${providerId}' in models.json.`);
		}
	} else {
		const entries = Object.entries(providers);
		if (entries.length !== 1) {
			throw new Error(
				`Dynamic startup models require exactly one provider in models.json; found ${entries.length}. `
				+ `Set ${PI_DYNAMIC_MODEL_PROVIDER_ENV} when multiple providers are configured.`,
			);
		}
		[providerId, provider] = entries[0]!;
	}

	const configuredModels = provider.models ?? [];
	if (configuredModels.length !== 1) {
		throw new Error(
			`Dynamic startup models require exactly one template model for provider '${providerId}'; found ${configuredModels.length}.`,
		);
	}
	const template = configuredModels[0]!;
	const modelIds = new Set<string>([template.id]);
	for (const requested of [mainModel, subagentModel]) {
		const normalized = normalizeRequestedModel(requested, providerId);
		if (normalized) modelIds.add(normalized);
	}

	return {
		providerId,
		models: [...modelIds].map((modelId) => toDynamicModelDefinition(modelId, template, provider)),
	};
}

export function registerStartupDynamicModels(pi: ExtensionAPI): void {
	const argv = process.argv.slice(2);
	const mainModel = readStartupOption(argv, "--model");
	const subagentModel = process.env[PI_SUBAGENT_MODEL_ENV];
	if (!mainModel && !subagentModel?.trim()) return;

	const configPath = path.join(getAgentDir(), "models.json");
	let raw: string;
	try {
		raw = fs.readFileSync(configPath, "utf-8");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to read models.json for dynamic startup model registration: ${reason}`);
	}

	let config: ModelsJson;
	try {
		config = JSON.parse(stripModelsJsonComments(raw)) as ModelsJson;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to parse models.json for dynamic startup model registration: ${reason}`);
	}

	const cliProvider = readStartupOption(argv, "--provider");
	const providerOverride = cliProvider ?? process.env[PI_DYNAMIC_MODEL_PROVIDER_ENV];
	const plan = buildDynamicModelPlan(config, mainModel, subagentModel, providerOverride);
	if (!plan) return;
	pi.registerProvider(plan.providerId, { models: plan.models });
}
