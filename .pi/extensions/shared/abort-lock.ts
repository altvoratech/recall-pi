export interface AbortLockState {
	active: boolean;
	reason: string | null;
	activatedAt: string | null;
}

let state: AbortLockState = {
	active: false,
	reason: null,
	activatedAt: null,
};

const listeners = new Set<(state: AbortLockState) => void>();

export function getAbortLockState(): AbortLockState {
	return { ...state };
}

export function activateAbortLock(reason?: string): AbortLockState {
	state = {
		active: true,
		reason: reason?.trim() || "manual abort",
		activatedAt: new Date().toISOString(),
	};
	for (const listener of [...listeners]) listener(getAbortLockState());
	return getAbortLockState();
}

export function clearAbortLock(): AbortLockState {
	state = {
		active: false,
		reason: null,
		activatedAt: null,
	};
	for (const listener of [...listeners]) listener(getAbortLockState());
	return getAbortLockState();
}

export function onAbortLockChange(listener: (state: AbortLockState) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
