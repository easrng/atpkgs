import type { Handle } from "@atcute/lexicons";
import { isHandle } from "@atcute/lexicons/syntax";

const regex =
	/^\@(?<handle>[a-zA-Z0-9.-]{3,253})\/(?<name>(?!\.)[a-z0-9_.-]{1,255})$/;

export type PackageName = `@${Handle}/${string}`;
export const isPackageName = (input: unknown): input is PackageName => {
	if (
		typeof input !== "string" || input.length > (1 + 253 + 1 + 255) ||
		input.length < (1 + 3 + 1 + 1)
	) return false;
	const match = input.match(regex);
	if (!isHandle(match?.groups?.handle)) return false;
	return true;
};
