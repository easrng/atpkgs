import type { Cid as CidString, CidLink } from "@atcute/lexicons";
import * as CID from "@atcute/cid";
import { toBase64Pad } from "@atcute/multibase";

export type Sri = `sha256-${string}`;
const errPrefix = "expected atproto blob cid to use ";
export function cidToSri(cid: CidString | CidLink): Sri {
	const parsed = typeof cid === "string"
		? CID.fromString(cid)
		: CID.fromCidLink(cid);
	if (parsed.version !== 1) throw new Error(errPrefix + "CIDv1");
	if (parsed.codec !== 0x55) {
		throw new Error(errPrefix + "`raw` multicodec");
	}
	if (parsed.digest.codec !== 0x12) {
		throw new Error(errPrefix + "`sha-256` multihash");
	}
	return `sha256-${toBase64Pad(parsed.digest.contents)}`;
}
