import {
  type CanonicalResourceUri,
  type CidLink,
  type Did,
  parseCanonicalResourceUri,
} from "@atcute/lexicons";
import { fromAtUri, toAtUri } from "../lib/package-encoding";
import validateNpmPackageName from "../lib/validate-npm-package-name";
import { resolveMiniDoc } from "../lib/resolve-mini-doc";
import { Client, ok as unwrap, simpleFetchHandler } from "@atcute/client";
import * as v from "@atcute/lexicons/validations";
import {
  OrgPurlAtpkgsNodePackage,
  OrgPurlAtpkgsNodeVersion,
} from "../lexicons/gen";
import type { Packument, PackumentVersion } from "@npm/types";
import { fromBytes } from "@atcute/cbor";
import { parse, parseRange } from "@std/semver";
import { toBase16 } from "@atcute/multibase";
import { cidToSri, serializeRecordCid } from "../lib/cid";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
  "access-control-max-age": "7200",
};
async function getClient(repo: Did) {
  const doc = await resolveMiniDoc({ identifier: repo });
  return {
    client: new Client({
      handler: simpleFetchHandler({ service: doc.pds }),
    }),
    pds: doc.pds,
  };
}
const FAKE_DATE = "2025-01-01T00:00:00.000Z";
async function fetchPackument(pkg: string): Promise<Packument> {
  if (!pkg.startsWith("@atpkgs/")) throw 404;
  const parsed = parseCanonicalResourceUri(toAtUri(pkg));
  if (!parsed.ok) throw 404;
  const { client, pds } = await getClient(parsed.value.repo);
  const result = await client.get("com.atproto.repo.getRecord", {
    params: {
      collection: "org.purl.atpkgs.node.package",
      repo: parsed.value.repo,
      rkey: parsed.value.rkey,
    },
  });
  if (!result.ok) throw 404;
  const pkgData = v.parse(
    OrgPurlAtpkgsNodePackage.mainSchema,
    result.data.value,
  );
  const tags: {
    latest?: string | undefined;
  } & Record<string, string> = { __proto__: null as never };
  const times: {
    modified: string;
    created: string;
  } & Record<string, string> = {
    __proto__: null as never,
    created: FAKE_DATE,
    modified: FAKE_DATE,
  };
  const versions: Record<string, PackumentVersion> = {
    __proto__: null as never,
  };
  for (const tag of pkgData.tags) {
    if (tags[tag.tag]) throw new Error("package had duplicate tag");
    parse(tag.version);
    tags[tag.tag] = tag.version;
  }
  for (const version of pkgData.versions) {
    if (versions[version.version]) {
      throw new Error("package had duplicate version");
    }
    parse(version.version);
    const versionUriInfo = parseCanonicalResourceUri(version.uri);
    if (!versionUriInfo.ok) throw new Error(versionUriInfo.error);
    if (versionUriInfo.value.collection !== "org.purl.atpkgs.node.version") {
      throw new Error(
        "unexpected collection in " + JSON.stringify(version.uri),
      );
    }
    versions[version.version] = {
      ...(await fetchVersionInner(
        client,
        pds,
        pkg,
        versionUriInfo.value.repo,
        versionUriInfo.value.rkey,
        version.cid,
        version.version,
      )),
      deprecated: version.deprecated,
    };
  }
  const first = versions[tags["latest"] ?? Object.keys(versions)[0] ?? ""];
  return {
    _id: undefined as any,
    _rev: undefined as any,
    name: pkg,
    "dist-tags": tags,
    time: times,
    versions,
    bugs: first?.bugs,
    contributors: first?.contributors,
    description: first?.description,
    homepage: first?.homepage,
    keywords: first?.keywords,
    license: first?.license,
    repository: first?.repository,
  };
}
async function fetchVersionInner(
  client: Client,
  pds: string,
  pkg: string,
  repo: Did,
  rkey: string,
  cid?: CidLink,
  version?: string,
): Promise<PackumentVersion> {
  const result = await unwrap(
    client.get("com.atproto.repo.getRecord", {
      params: {
        collection: "org.purl.atpkgs.node.version",
        repo: repo,
        rkey: rkey,
      },
    }),
  );
  const realCid = await serializeRecordCid(result.value as any);
  if (cid && cid.$link !== realCid.$link) {
    throw new Error("version cid mismatch");
  }
  const record = v.parse(OrgPurlAtpkgsNodeVersion.mainSchema, result.value);
  if (version && version !== record.version) {
    throw new Error("inner version mismatch");
  }
  const deps2npm = (
    deps: OrgPurlAtpkgsNodeVersion.Main["dependencies"],
  ): Record<string, string> | undefined => {
    return deps?.length
      ? Object.fromEntries(
        deps.map((e) => {
          const s = e.$type === "org.purl.atpkgs.node.version#atDependency"
            ? "npm:" + fromAtUri(e.uri as CanonicalResourceUri)
            : e.specifier === e.name
            ? ""
            : "npm:" + e.specifier;
          parseRange(e.range);
          return [e.name, s + (s ? "@" : "") + e.range];
        }),
      )
      : undefined;
  };

  return {
    _id: undefined as any,
    _npmVersion: undefined as any,
    name: pkg,
    description: record.description,
    version: record.version,
    dist: {
      shasum: toBase16(fromBytes(record.legacyShasum)),
      integrity: cidToSri(record.dist.ref),
      signatures: [],
      tarball: new URL(
        `/xrpc/com.atproto.sync.getBlob?did=${repo}&cid=${record.dist.ref.$link}`,
        pds,
      ).href,
    },
    bugs: record.bugs ? { url: record.bugs } : undefined,
    contributors: record.contributors?.map((e) => ({
      name: "",
      url: e.uri ?? "at://" + e.uri,
    })),
    os: record.os,
    cpu: record.cpu,
    dependencies: deps2npm(record.dependencies),
    peerDependencies: deps2npm(record.peerDependencies),
    optionalDependencies: deps2npm(record.optionalDependencies),
    funding: record.funding,
    homepage: record.homepage,
    keywords: record.keywords,
    license: record.license,
    repository: record.repository
      ? { url: record.repository.uri, directory: record.repository.directory }
      : undefined,
  };
}
async function fetchVersion(pkg: string, version: string) {}

export default {
  async fetch(req: Request): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: cors,
        });
      }
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 504,
          headers: {
            ...cors,
            "content-type": "text/plain",
          },
        });
      }
      const url = new URL(req.url);
      if (url.pathname === "/") {
        return Response.json({}, { headers: cors });
      }
      const pathParts = url.pathname
        .split("/")
        .slice(1)
        .map((e) => decodeURIComponent(e));
      if (
        pathParts[0]?.startsWith("@") &&
        !pathParts[0].includes("/") &&
        pathParts[1]
      ) {
        pathParts[0] = pathParts.shift()! + "/" + pathParts[0];
      }
      const pkg = pathParts[0]!;
      if (validateNpmPackageName(pkg ?? "").validForOldPackages) {
        if (!pathParts[1]) {
          return Response.json(await fetchPackument(pkg), { headers: cors });
        } else {
          return Response.json(await fetchVersion(pkg, pathParts[1]), {
            headers: cors,
          });
        }
      }
      return Response.json(
        { error: "Not found" },
        {
          headers: cors,
          status: 404,
        },
      );
    } catch (e) {
      if (e === 404) {
        return Response.json(
          { error: "Not found" },
          {
            headers: cors,
            status: 404,
          },
        );
      }
      return Response.json(
        { error: e + "" },
        {
          headers: cors,
          status: 500,
        },
      );
    }
  },
};
