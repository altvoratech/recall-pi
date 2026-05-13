/**
 * Pi Notify Extension
 *
 * Sends a native notification when Pi finishes a turn and is waiting for input.
 * Cascade by environment:
 * - Windows Terminal (WT_SESSION) → PowerShell toast
 * - Kitty (KITTY_WINDOW_ID) → OSC 99
 * - Known TERM_PROGRAM with OSC 777 support → OSC 777
 * - Otherwise on Linux with `notify-send` available → libnotify
 *
 * Skips notification if the turn was short (<MIN_DURATION_MS, default 5s) —
 * no point pinging for a 2-second answer the user already saw.
 */

import { execFile, execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MIN_DURATION_MS = 5_000;
const OSC777_TERM_PROGRAMS = new Set(["iTerm.app", "ghostty", "WezTerm", "rxvt-unicode"]);

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText02`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${title}')) > $null`,
		`$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('${body}')) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('Pi').Show(${toast})`,
	].join("; ");
}

function notifyOSC777(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
	process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string): void {
	execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
}

let notifySendChecked = false;
let notifySendAvailable = false;
function hasNotifySend(): boolean {
	if (notifySendChecked) return notifySendAvailable;
	notifySendChecked = true;
	try {
		execFileSync("which", ["notify-send"], { stdio: "ignore" });
		notifySendAvailable = true;
	} catch {
		notifySendAvailable = false;
	}
	return notifySendAvailable;
}

function notifyLibnotify(title: string, body: string): void {
	execFile("notify-send", ["--app-name=Pi", "--icon=utilities-terminal", title, body]);
}

function notify(title: string, body: string): void {
	if (process.env.WT_SESSION) {
		notifyWindows(title, body);
		return;
	}
	if (process.env.KITTY_WINDOW_ID) {
		notifyOSC99(title, body);
		return;
	}
	const termProgram = process.env.TERM_PROGRAM ?? "";
	if (OSC777_TERM_PROGRAMS.has(termProgram)) {
		notifyOSC777(title, body);
		return;
	}
	if (process.platform === "linux" && hasNotifySend()) {
		notifyLibnotify(title, body);
		return;
	}
	// no-op: don't spray OSC sequences into terminals that won't render them
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rs = s % 60;
	return rs ? `${m}m${rs}s` : `${m}m`;
}

export default function (pi: ExtensionAPI) {
	let agentStartAt: number | undefined;

	pi.on("agent_start", async () => {
		agentStartAt = Date.now();
	});

	pi.on("agent_end", async () => {
		const duration = agentStartAt ? Date.now() - agentStartAt : 0;
		agentStartAt = undefined;
		if (duration < MIN_DURATION_MS) return;
		notify("Pi", `Ready · ${formatDuration(duration)}`);
	});
}
