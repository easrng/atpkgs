import * as v from "@atcute/lexicons/validations";
import { Header } from "../../components/Header";
import {
  type GenericUri,
  type Handle,
  type InferOutput,
  parseCanonicalResourceUri,
  parseResourceUri,
} from "@atcute/lexicons";
import { type MiniDoc, resolveMiniDoc } from "../../../lib/resolve-mini-doc";
import { Client, ok as unwrap, simpleFetchHandler } from "@atcute/client";
import { AppBskyActorProfile } from "@atcute/bluesky";
import fallbackAvatar from "../../assets/fallback-avatar.svg?url";
import type {} from "@atcute/atproto";
import "./style.css";
import { Title } from "../../components/Title";
import { CircleUserRound, Globe, Tag } from "lucide-preact";
import type { SessionData } from "../..";
import {
  OrgPurlAtpkgsNodePackage,
  OrgPurlAtpkgsNodeVersion,
} from "../../../lexicons/gen";
import { parse } from "@std/semver";
import { serializeRecordCid } from "../../../lib/cid";

const ProfilePageInner = ({
  doc,
  avatarUri,
  displayName,
  pronouns,
  website,
  packages,
}: {
  doc: MiniDoc;
  originalHandle: Handle;
  avatarUri: string;
  displayName: string | undefined;
  pronouns: string | undefined;
  website: GenericUri | undefined;
  packages: {
    package: OrgPurlAtpkgsNodePackage.Main;
    version?: OrgPurlAtpkgsNodeVersion.Main;
  }[];
}) => {
  return (
    <div class="page page-profile">
      <Title>{`@${doc.handle}'s packages`}</Title>
      <Header searchValue={"@" + doc.handle} />
      <main>
        <div class="user-info">
          <img src={avatarUri} class="avatar" alt="" />
          <div class="user-info-text">
            <h2>@{doc.handle}'s packages</h2>
            {displayName && (
              <div class="display-name">
                <CircleUserRound /> {displayName}
              </div>
            )}
            {pronouns && (
              <div class="pronouns">
                <Tag /> {pronouns}
              </div>
            )}
            {website && (
              <div class="website">
                <Globe /> <a href={website}>{website}</a>
              </div>
            )}
          </div>
        </div>
        {packages.length
          ? (
            <ul class="user-packages">
              {packages.map((e, i) => (
                <li key={e.package.name}>
                  <h3>
                    @{doc.handle}/{e.package.name}
                    {e.version
                      ? (
                        <>
                          {" "}
                          <span class="version">{e.version.version}</span>
                        </>
                      )
                      : (
                        ""
                      )}
                  </h3>
                  <pre class="install-command">
									npx atpkgs add @{doc.handle}/{e.package.name}
                  </pre>
                  {e.version?.description
                    ? <p>{e.version?.description}</p>
                    : null}
                </li>
              ))}
            </ul>
          )
          : (
            <div class="user-packages-blankslate">
              {displayName ?? doc.handle} hasn't published any packages yet
            </div>
          )}
      </main>
    </div>
  );
};

export const ProfilePage = async ({
  handle,
  $session,
  $route,
}: {
  handle: Handle;
  $session: SessionData;
  $route: (url: string, replace: boolean) => void;
}) => {
  const doc = await resolveMiniDoc({ identifier: handle }, await $session.rpc);
  if (doc.handle !== handle) {
    $route("/@" + doc.handle, true);
  }
  const client = new Client({
    handler: simpleFetchHandler({ service: doc.pds }),
  });
  const [profileResponse, packagesResponse] = await Promise.all([
    client.get("com.atproto.repo.getRecord", {
      params: {
        repo: doc.did,
        collection: "app.bsky.actor.profile",
        rkey: "self",
      },
    }),
    unwrap(
      client.get("com.atproto.repo.listRecords", {
        params: {
          collection: "org.purl.atpkgs.node.package",
          repo: doc.did,
          // TODO: pagination
          limit: 100,
        },
      }),
    ),
  ]);
  const profile: Pick<
    InferOutput<AppBskyActorProfile.mainSchema>,
    "avatar" | "displayName" | "pronouns" | "website"
  > = profileResponse.ok
    ? v.parse(AppBskyActorProfile.mainSchema, profileResponse.data.value)
    : {};
  const packages = await Promise.all(
    packagesResponse.records.map(async (e) => {
      let version;
      const parsed = parseResourceUri(e.uri);
      if (!parsed.ok) throw new Error(parsed.error);
      const pkg = v.parse(OrgPurlAtpkgsNodePackage.mainSchema, e.value);
      if (pkg.name !== parsed.value.rkey) {
        throw new Error("package name must match rkey");
      }
      const first = pkg.tags.find((e) => e.tag === "latest")?.version ??
        pkg.versions[0]?.version;
      const firstO = pkg.versions.find((v) => v.version === first);
      if (firstO) {
        parse(firstO.version);
        const versionUriInfo = parseCanonicalResourceUri(firstO.uri);
        if (!versionUriInfo.ok) throw new Error(versionUriInfo.error);
        if (
          versionUriInfo.value.collection !== "org.purl.atpkgs.node.version"
        ) {
          throw new Error(
            "unexpected collection in " + JSON.stringify(firstO.uri),
          );
        }
        const result = await unwrap(
          client.get("com.atproto.repo.getRecord", {
            params: {
              collection: "org.purl.atpkgs.node.version",
              repo: versionUriInfo.value.repo,
              rkey: versionUriInfo.value.rkey,
            },
          }),
        );
        const realCid = await serializeRecordCid(result.value as any);
        if (firstO.cid && firstO.cid.$link !== realCid.$link) {
          throw new Error("version cid mismatch");
        }
        const record = v.parse(
          OrgPurlAtpkgsNodeVersion.mainSchema,
          result.value,
        );
        if (firstO.version !== record.version) {
          throw new Error("inner version mismatch");
        }
        version = record;
      }
      return { package: pkg, version };
    }),
  );
  const avatarCid = profile.avatar?.ref.$link;
  return (
    <ProfilePageInner
      avatarUri={avatarCid
        ? doc.pds +
          `/xrpc/com.atproto.sync.getBlob?did=${doc.did}&cid=${avatarCid}`
        : fallbackAvatar}
      displayName={profile.displayName}
      doc={doc}
      originalHandle={handle}
      pronouns={profile.pronouns}
      website={profile.website}
      packages={packages}
    />
  );
};
