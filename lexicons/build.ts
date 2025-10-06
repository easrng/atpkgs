import type { LexiconDoc } from "@atcute/lexicon-doc";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { exec, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const lexicons: Record<string, LexiconDoc> = {
  "org.purl.atpkgs.node.package": {
    lexicon: 1,
    id: "org.purl.atpkgs.node.package",
    revision: 1,
    description: "a lexicon for node.js-style packages",
    defs: {
      main: {
        type: "record",
        key: "any",
        description: "list of versions for a package",
        record: {
          type: "object",
          required: ["name", "tags", "versions"],
          properties: {
            name: {
              type: "string",
              format: "record-key",
              description: "must match the record's rkey",
            },
            tags: {
              type: "array",
              items: {
                type: "ref",
                ref: "#tag",
              },
            },
            versions: {
              type: "array",
              items: {
                type: "ref",
                ref: "#version",
              },
            },
          },
        },
      },
      tag: {
        type: "object",
        required: ["tag", "version"],
        properties: {
          tag: {
            type: "string",
            format: "record-key",
            description: "name for this tag",
          },
          version: {
            type: "string",
            format: "record-key",
            description: "version from the versions list",
          },
        },
      },
      version: {
        type: "object",
        required: ["version", "uri", "cid"],
        properties: {
          version: {
            type: "string",
            format: "record-key",
            description: "must be valid semver",
          },
          uri: {
            type: "string",
            format: "at-uri",
            description: "at uri of the version",
          },
          cid: {
            type: "cid-link",
            description: "cid of the version",
          },
          deprecated: {
            type: "string",
            description: "optional deprecation message",
          },
        },
      },
    },
  },
  "org.purl.atpkgs.node.version": {
    lexicon: 1,
    id: "org.purl.atpkgs.node.version",
    revision: 1,
    description: "a lexicon for node.js-style package versions",
    defs: {
      main: {
        type: "record",
        key: "tid",
        description: "a node.js-style package version. immutable!",
        record: {
          type: "object",
          required: ["name", "version", "dist", "legacyShasum"],
          properties: {
            name: {
              type: "string",
              format: "record-key",
            },
            version: {
              type: "string",
              format: "record-key",
              description: "must be valid semver",
            },
            description: {
              type: "string",
            },
            keywords: {
              type: "array",
              items: {
                type: "string",
              },
            },
            homepage: {
              type: "string",
              format: "uri",
            },
            bugs: {
              type: "string",
              format: "uri",
            },
            license: {
              type: "string",
              description: "spdx identifier",
            },
            repository: {
              type: "ref",
              ref: "#repository",
            },
            legacyShasum: {
              type: "bytes",
              minLength: 20,
              maxLength: 20,
              description:
                "For compatibility with legacy npm implementations. Use the CID to verify, not this.",
            },
            dist: {
              type: "blob",
              description:
                "package tgz file. verify the cid when you download!",
            },
            contributors: {
              type: "array",
              items: {
                type: "ref",
                ref: "#person",
              },
            },
            funding: {
              type: "array",
              items: {
                type: "string",
                format: "uri",
              },
            },
            dependencies: {
              type: "array",
              items: {
                type: "union",
                refs: ["#atDependency", "#npmDependency"],
                closed: false,
              },
            },
            optionalDependencies: {
              type: "array",
              items: {
                type: "union",
                refs: ["#atDependency", "#npmDependency"],
                closed: false,
              },
            },
            peerDependencies: {
              type: "array",
              items: {
                type: "union",
                refs: ["#atDependency", "#npmDependency"],
                closed: false,
              },
            },
            os: {
              type: "array",
              items: {
                type: "string",
              },
            },
            cpu: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
      },
      repository: {
        type: "object",
        required: ["uri"],
        properties: {
          uri: {
            type: "string",
            format: "uri",
          },
          directory: {
            type: "string",
          },
        },
      },
      person: {
        type: "object",
        properties: {
          did: {
            type: "string",
            format: "did",
          },
          uri: {
            type: "string",
            format: "uri",
          },
        },
      },
      atDependency: {
        type: "object",
        required: ["name", "uri", "range"],
        properties: {
          name: {
            type: "string",
            format: "record-key",
            description: "local name for package",
          },
          uri: {
            type: "string",
            format: "at-uri",
            description: "at uri for a org.purl.atpkgs.node.package",
          },
          range: {
            type: "string",
            description: "must be a valid semver range",
          },
        },
      },
      npmDependency: {
        type: "object",
        required: ["name", "specifier", "range"],
        properties: {
          name: {
            type: "string",
            format: "record-key",
            description: "local name for package",
          },
          specifier: {
            type: "string",
            description: "non-atpkgs npm package specifier",
          },
          range: {
            type: "string",
            description: "must be a valid semver range",
          },
        },
      },
    },
  },
  "com.bad-example.identity.resolveMiniDoc": {
    id: "com.bad-example.identity.resolveMiniDoc",
    lexicon: 1,
    defs: {
      main: {
        type: "query",
        description:
          "Like [com.atproto.identity.resolveIdentity](https://docs.bsky.app/docs/api/com-atproto-identity-resolve-identity) but instead of the full `didDoc` it returns an atproto-relevant subset.",
        parameters: {
          type: "params",
          required: ["identifier"],
          properties: {
            identifier: {
              type: "string",
              format: "at-identifier",
              description: "Handle or DID to resolve",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["did", "handle", "pds", "signing_key"],
            properties: {
              did: {
                type: "string",
                format: "did",
                description:
                  "DID, bi-directionally verified if a handle was provided in the query.",
              },
              handle: {
                type: "string",
                format: "handle",
                description:
                  "The validated handle of the account or `handle.invalid` if the handle\ndid not bi-directionally match the DID document.",
              },
              pds: {
                type: "string",
                format: "uri",
                description: "The identity's PDS URL",
              },
              signing_key: {
                type: "string",
                description:
                  "The atproto signing key publicKeyMultibase\n\nLegacy key encoding not supported. the key is returned directly; `id`,\n`type`, and `controller` are omitted.",
              },
            },
          },
        },
      },
    },
  },
};

await mkdir(new URL("dist", import.meta.url), { recursive: true });
for (const id in lexicons) {
  assert.equal(id, lexicons[id]!.id);
  await writeFile(
    new URL("dist/" + id + ".json", import.meta.url),
    JSON.stringify(lexicons[id]),
  );
}

await new Promise((resolve, reject) => {
  const child = spawn(
    "../node_modules/.bin/lex-cli generate -c ./lex.config.js",
    {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      shell: true,
      stdio: "inherit",
    },
  );
  child.on("exit", resolve);
  child.on("error", reject);
});
