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

export function readGlobalSettings(): Record<string, unknown> {
	return readJsonIfExists(GLOBAL_SETTINGS_PATH) ?? {};
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
