import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const GLOBAL_SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");

export function readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
	try {
		if (!fs.existsSync(filePath)) return undefined;
		return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
	// Merge b over a (project overrides global). Arrays are replaced, not concatenated.
	const out: Record<string, unknown> = { ...a };
	for (const [k, v] of Object.entries(b)) {
		const prev = out[k];
		if (isPlainObject(prev) && isPlainObject(v)) out[k] = deepMerge(prev, v);
		else out[k] = v;
	}
	return out;
}

export function readGlobalSettings(): Record<string, unknown> {
	return readJsonIfExists(GLOBAL_SETTINGS_PATH) ?? {};
}

export function readProjectSettings(cwd: string): { path: string | null; settings: Record<string, unknown> } {
	const projectPath = findNearestProjectSettings(cwd);
	const projectSettings = projectPath ? readJsonIfExists(projectPath) ?? {} : {};
	return { path: projectPath, settings: projectSettings };
}

export function readSettings(cwd?: string): { settings: Record<string, unknown>; sources: { globalPath: string; projectPath: string | null } } {
	const effectiveCwd = cwd && cwd.trim() ? cwd : process.cwd();
	const globalSettings = readGlobalSettings();
	const project = readProjectSettings(effectiveCwd);
	return {
		settings: deepMerge(globalSettings, project.settings),
		sources: { globalPath: GLOBAL_SETTINGS_PATH, projectPath: project.path },
	};
}

export function findNearestProjectSettings(cwd: string): string | null {
	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, ".pi", "settings.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
