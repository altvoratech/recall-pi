// Pure predicates extracted from permission-gate.ts so they can be tested
// without pulling in the TUI dialog dependencies.

export function stripLeadingSudo(command: string): string {
	return command.replace(/^\s*sudo\b\s*/, "");
}

export function isUserScopedSystemd(command: string): boolean {
	return /^\s*systemctl\s+--user\b/i.test(command);
}

export function needsPrivilege(command: string): boolean {
	if (isUserScopedSystemd(command)) return false;

	const patterns = [
		/^\s*sudo\b/i,
		/\brm\s+(-rf?|--recursive)\b/i,
		/\b(chmod|chown)\b.*\b777\b/i,
		/\b(mkfs|fdisk|parted|wipefs|dd)\b/i,
		/\b(apt|apt-get|apt-cache|dpkg|dnf|yum|pacman|zypper)\b/i,
		/\b(systemctl|service|useradd|usermod|groupadd|groupdel|mount|umount)\b/i,
		/\b(tee|install|cp|mv)\b.*\s\/(etc|usr|var)\//i,
	];

	return patterns.some((p) => p.test(command));
}

export function isProtectedRecallDeletion(command: string): boolean {
	const destructivePatterns = [/\b(rm|rmdir|unlink|shred|wipe|find)\b/i, /-delete\b/i, /\btruncate\b/i];
	return command.includes(".recall") && destructivePatterns.some((p) => p.test(command));
}
