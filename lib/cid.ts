import type { Cid as CidString, CidLink } from "@atcute/lexicons";
import * as CID from "@atcute/cid";
import { encode } from "@atcute/cbor";
import { toBase64Pad } from "@atcute/multibase";
import type { _SHA256 } from "@noble/hashes/sha2.js";

export type Sri = `sha256-${string}`;
const errPrefix = "expected atproto blob cid to use ";
export function cidToSri(cid: CidString | CidLink): Sri {
  const parsed = typeof cid === "string"
    ? CID.fromString(cid)
    : CID.fromCidLink(cid);
  if (parsed.version !== 1) throw new Error(errPrefix + "CIDv1");
  if (parsed.codec !== CID.CODEC_RAW) {
    throw new Error(errPrefix + "`raw` multicodec");
  }
  if (parsed.digest.codec !== CID.HASH_SHA256) {
    throw new Error(errPrefix + "`sha-256` multihash");
  }
  return `sha256-${toBase64Pad(parsed.digest.contents)}`;
}
export function hashToCid(hash: _SHA256) {
  const bytes = new Uint8Array(4 + 32);
  bytes[0] = CID.CID_VERSION;
  bytes[1] = CID.CODEC_RAW;
  bytes[2] = CID.HASH_SHA256;
  bytes[3] = 32;
  hash.digestInto(new Uint8Array(bytes.buffer, bytes.byteOffset + 4, 32));
  const cid = {
    version: CID.CID_VERSION,
    codec: CID.CODEC_RAW,
    digest: {
      codec: CID.HASH_SHA256,
      contents: bytes.subarray(4, 36),
    },
    bytes: bytes,
  };
  return CID.toCidLink(cid);
}

export async function serializeRecordCid(
  record: { $type: string },
): Promise<CidLink> {
  const bytes = encode(record);

  const cid = await CID.create(0x71, bytes);
  const serialized = CID.toCidLink(cid);

  return serialized;
}
