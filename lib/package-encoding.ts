import { fromBase32, toBase32 } from "@atcute/multibase";
import {
  type CanonicalResourceUri,
  parseCanonicalResourceUri,
} from "@atcute/lexicons";
import { isDid, isRecordKey } from "@atcute/lexicons/syntax";
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export function encode(str: string) {
  let literal = true;
  let out = "";
  let buffer = "";
  const flushLiteral = () => {
    literal = false;
    out += buffer;
    buffer = "";
  };
  const flushEncoded = () => {
    literal = true;
    if (buffer !== buffer.toWellFormed()) {
      throw new TypeError("invalid unicode in input");
    }
    out += "_" + toBase32(encoder.encode(buffer));
    buffer = "_";
  };
  for (const char of str) {
    if (char === "/") {
      if (!literal) {
        flushEncoded();
        buffer = "__";
      } else if (buffer === "_") {
        buffer = "__";
      } else {
        buffer += "__";
      }
    } else {
      if (/^[a-z0-9.-]$/.test(char)) {
        if (!literal) {
          flushEncoded();
        }
      } else {
        if (literal) {
          flushLiteral();
        }
      }
      buffer += char;
    }
  }
  if (buffer) {
    if (literal) {
      flushLiteral();
    } else {
      flushEncoded();
    }
  }
  return out;
}

export function decode(str: string) {
  let literal = true;
  let maybeSlash = false;
  let out = [""];
  for (const char of str) {
    if (char == "_") {
      if (maybeSlash) {
        if (!literal) {
          literal = true;
          out.pop();
        }
        out[out.length - 1] += "/";
        maybeSlash = false;
      } else {
        literal = !literal;
        out.push("");
        maybeSlash = true;
      }
    } else {
      maybeSlash = false;
      if (literal) {
        if (!/^[a-z0-9.-]$/.test(char)) {
          throw new TypeError("invalid character in literal: " + char);
        }
      }
      out[out.length - 1] += char;
    }
  }
  if (out.at(-1) === "") {
    throw new TypeError("noncanonical encoding");
  }
  return out.map((e, i) => {
    if (!(i % 2)) return e;
    const encoded = decoder.decode(fromBase32(e));
    if (/[/a-z0-9.-]/.test(encoded)) {
      throw new TypeError("noncanonical encoding");
    }
    return encoded;
  }).join(
    "",
  );
}

export function toAtUri(pkg: string): CanonicalResourceUri {
  const errPrefix = "invalid atpkgs package name " + JSON.stringify(pkg) + ": ";
  if (!pkg.startsWith("@atpkgs/did")) {
    throw new TypeError(
      errPrefix + "should start with @atpkgs/did",
    );
  }
  const { length, 0: didMethod, 1: didBody, 2: rkey } = decode(
    pkg.slice("@atpkgs/did".length),
  )
    .split(
      "/",
    );
  const did = `did:${didMethod}:${didBody}`;
  if (length !== 3) {
    throw new TypeError(
      errPrefix + "encoded name should have 3 parts",
    );
  }
  if (!isDid(did)) {
    throw new TypeError(
      errPrefix + "invalid did " + JSON.stringify(did),
    );
  }
  if (
    !isRecordKey(rkey)
  ) {
    throw new TypeError(
      errPrefix + "invalid rkey " + JSON.stringify(did),
    );
  }
  return `at://${did}/org.purl.atpkgs.node.package/${rkey}`;
}

export function fromAtUri(uri: CanonicalResourceUri) {
  const parsed = parseCanonicalResourceUri(uri);
  if (!parsed.ok) {
    throw new TypeError(parsed.error);
  }
  if (parsed.value.fragment !== undefined) {
    throw new TypeError("unexpected fragment");
  }
  if (parsed.value.collection !== "org.purl.atpkgs.node.package") {
    throw new TypeError(
      "expected collection to be org.purl.atpkgs.node.package",
    );
  }
  return "@atpkgs/did" +
    encode(
      parsed.value.repo.replace(/^did:([^:]+):/, "$1/") + "/" +
        parsed.value.rkey,
    );
}

/*
import { assertEquals } from "@std/assert";

while (true) {
	let orig,
		encoded,
		decoded;
	try {
		orig = [...crypto.getRandomValues(new Uint8Array(10))].map((e) =>
			"abcdefghijklmnopqrstuvwxyz0123456789.:_-"[e % 40]
		).join("");
		const decoded = decode(orig);
		assertEquals(orig, encode(decoded));
		orig = String.fromCharCode(
			...crypto.getRandomValues(new Uint8Array(10)),
		);
		encoded = encode(orig);
		decoded = decode(encoded);
		assertEquals(orig, decoded);
	} catch (err) {
		if (
			/invalid character in literal|invalid base string|unexpected end of data|noncanonical encoding|encoded data was not valid/
				.test(err + "")
		) continue;
		console.error({ err, orig, encoded, decoded });
	}
}
*/
