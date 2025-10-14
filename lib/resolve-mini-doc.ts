import {
  type HandleResolver,
  XrpcHandleResolver,
} from "@atcute/identity-resolver";
import type { Did, Handle } from "@atcute/lexicons";
import type {} from "../lexicons/gen/index.ts";
import type { XRPCQueries } from "@atcute/lexicons/ambient";
import * as v from "@atcute/lexicons/validations";
import { type Client, ok as unwrap } from "@atcute/client";
import { publicDidDocResolver, publicHandleResolver } from "./resolvers.ts";

type UnionTuple = readonly v.BaseSchema<any>[];
type kType = keyof v.BaseSchema & symbol;
type UnionSchemaBase<TMembers extends UnionTuple> =
  & v.BaseSchema<unknown>
  & Partial<
    Record<
      kType,
      {
        in: InferUnionInput<TMembers>;
        out: InferUnionOutput<TMembers>;
      }
    >
  >;
type InferUnionInput<TMembers extends UnionTuple> = v.InferInput<
  TMembers[number]
>;
type InferUnionOutput<TMembers extends UnionTuple> = v.InferOutput<
  TMembers[number]
>;
interface UnionSchema<TMembers extends UnionTuple = UnionTuple>
  extends UnionSchemaBase<TMembers> {
  readonly type: "union";
  readonly members: TMembers;
}
const lazyProperty = <T>(
  obj: object,
  prop: string | number | symbol,
  value: T,
): T => {
  Object.defineProperty(obj, prop, { value });
  return value;
};
const union: <const TMembers extends UnionTuple>(
  members: TMembers,
) => UnionSchema<TMembers> = <const TMembers extends UnionTuple>(
  members: TMembers,
): UnionSchema<any> => {
  return {
    kind: "schema",
    type: "union",
    members: members,
    get "~run"() {
      const matcher = (input: unknown, flags: number) => {
        let failures: v.IssueTree[] = [];
        for (const member of members) {
          const result = member["~run"](input, flags);
          if (!result) {
            return;
          } else if (result.ok === true) {
            return result;
          } else if (result) {
            failures.push(result);
          }
        }
        return {
          ok: false,
          code: "invalid_variant",
          expected: [JSON.stringify(failures)],
        } satisfies v.IssueLeaf;
      };
      return lazyProperty(this, "~run", matcher);
    },
  };
};

type MatcherResult = undefined | v.Ok<unknown> | v.IssueTree;
type Matcher = (input: unknown, flags: number) => MatcherResult;

const isArray = Array.isArray;
const isObject = (input: unknown): input is Record<string, unknown> => {
  return typeof input === "object" && input !== null && !isArray(input);
};

const ISSUE_TYPE_OBJECT: v.IssueLeaf = {
  ok: false,
  code: "invalid_type",
  expected: "object",
};

const joinIssues = (
  left: v.IssueTree | undefined,
  right: v.IssueTree,
): v.IssueTree => {
  return left ? { ok: false, code: "join", left, right } : right;
};

const set = (
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  if (key === "__proto__") {
    Object.defineProperty(obj, key, { value });
  } else {
    obj[key] = value;
  }
};
type Key = string | number;
const prependPath = (key: Key, tree: v.IssueTree): v.IssueTree => {
  return { ok: false, code: "prepend", key, tree };
};

// #__NO_SIDE_EFFECTS__
const record = <TValue extends v.BaseSchema>(
  shape: TValue,
): v.ObjectSchema<{ [key: string]: TValue }> => {
  return {
    kind: "schema",
    type: "object",
    get shape() {
      return {};
    },
    get "~run"() {
      const matcher: Matcher = (input, flags) => {
        if (!isObject(input)) {
          return ISSUE_TYPE_OBJECT;
        }

        let issues: v.IssueTree | undefined;
        let output: Record<string, unknown> | undefined;

        for (const key of Object.getOwnPropertyNames(input)) {
          const value = input[key];

          const r = shape["~run"](value, flags);

          if (r !== undefined) {
            if (r.ok === true) {
              if (output === undefined) {
                output = { ...input };
              }

              /*#__INLINE__*/ set(output, key, r.value);
            } else {
              issues = joinIssues(issues, prependPath(key, r));

              if (flags & v.FLAG_ABORT_EARLY) {
                return issues;
              }
            }
          }
        }

        if (issues !== undefined) {
          return issues;
        }

        if (output !== undefined) {
          return { ok: true, value: output };
        }

        return undefined;
      };

      return lazyProperty(this, "~run", matcher);
    },
  };
};

const didDoc = v.object({
  id: v.didString(),
  alsoKnownAs: v.array(v.string()),
  service: v.array(
    v.object({
      id: v.string(),
      type: union([v.string(), v.array(v.string())]),
      serviceEndpoint: union([
        v.string(),
        record(v.string()),
        v.array(union([v.string(), record(v.string())])),
      ]),
    }),
  ),
  verificationMethod: v.array(
    v.object({
      id: v.string(),
      type: v.string(),
      controller: v.string(),
      publicKeyMultibase: v.optional(v.string()),
      publicKeyJwk: v.optional(v.unknown()),
    }),
  ),
});

export type MiniDoc = v.InferXRPCBodyInput<
  XRPCQueries["com.bad-example.identity.resolveMiniDoc"]["output"]
>;

function parseDidDoc(unverifiedDoc: unknown, did: Did) {
  const doc = v.parse(didDoc, unverifiedDoc);
  // must use the first valid handle
  let unverified_handle: Handle | undefined;
  for (const aka of doc.alsoKnownAs) {
    if (!aka.startsWith("at://")) continue;
    try {
      unverified_handle = v.parse(v.handleString(), aka.slice("at://".length));
    } catch {
      continue;
    }
    break;
  }
  if (!unverified_handle) {
    throw new Error("no valid atproto handles in `alsoKnownAs`");
  }
  const pds_id = "#atproto_pds";
  const pds_full_id = did + pds_id;
  const service = doc.service.find(
    (s) =>
      (s.id === pds_id || s.id === pds_full_id) &&
      s.type === "AtprotoPersonalDataServer",
  );
  const pds = v.parse(v.genericUriString(), service?.serviceEndpoint);
  const key_id = "#atproto";
  const key_full_id = did + key_id;
  const key = doc.verificationMethod.find(
    (s) =>
      (s.id === key_id || s.id === key_full_id) &&
      s.type === "Multikey" &&
      s.controller === did &&
      s.publicKeyMultibase,
  );
  const signing_key = v.parse(v.string(), key?.publicKeyMultibase);
  return { unverified_handle, signing_key, pds };
}

const handleResolverFromClientCache = new WeakMap();
const handleResolverFromClient = (client?: Client): HandleResolver => {
  if (!client) return publicHandleResolver;
  const cached = handleResolverFromClientCache.get(client);
  if (cached) return cached;
  const pdsFetch = (info: URL | RequestInfo, init?: RequestInit) => {
    const r = new Request(info, init);
    const u = new URL(r.url);
    return client.handler(u.href.slice(u.origin.length), {
      body: r.body,
      cache: r.cache,
      credentials: r.credentials,
      headers: r.headers,
      integrity: r.integrity,
      keepalive: r.keepalive,
      method: r.method,
      mode: r.mode,
      redirect: r.redirect,
      referrer: r.referrer,
      referrerPolicy: r.referrerPolicy,
      signal: r.signal,
    });
  };
  const handleResolver = new XrpcHandleResolver({
    serviceUrl: "https://pds.invalid",
    fetch: pdsFetch,
  });
  handleResolverFromClientCache.set(client, handleResolver);
  return handleResolver;
};

export async function resolveMiniDoc(
  {
    identifier,
  }: v.InferInput<
    XRPCQueries["com.bad-example.identity.resolveMiniDoc"]["params"]
  >,
  client?: Client,
): Promise<
  v.InferXRPCBodyInput<
    XRPCQueries["com.bad-example.identity.resolveMiniDoc"]["output"]
  >
> {
  const handleResolver = handleResolverFromClient(client);
  const didDocResolver =
    /*pdsFetch
		? new XrpcDidDocumentResolver({
			serviceUrl: "https://pds.invalid",
			fetch: pdsFetch,
		})
		:*/
    publicDidDocResolver;
  const did = identifier.startsWith("did:")
    ? (identifier as Did)
    : await handleResolver.resolve(identifier as Handle);
  const info = parseDidDoc(await didDocResolver.resolve(did as any), did);
  const handleDid = await handleResolver.resolve(
    info.unverified_handle as Handle,
  );
  return {
    did,
    handle: handleDid === did ? info.unverified_handle : "handle.invalid",
    pds: info.pds,
    signing_key: info.signing_key,
  };
}
