import { get, set } from "idb-keyval";
import { TarStream, UntarStream } from "@std/tar";
import { normalize } from "@std/path";
import { assert } from "@std/assert";
import { sha256 } from "@noble/hashes/sha2.js";
import { hashToCid } from "../../../lib/cid";
import type {
	OrgPurlAtpkgsNodePackage,
	OrgPurlAtpkgsNodeVersion,
} from "../../../lexicons/gen";
import { sha1 } from "@noble/hashes/legacy.js";
import { BytesWrapper } from "@atcute/cbor";
import { parse, parseRange, tryParseRange } from "@std/semver";
import type { GenericUri } from "@atcute/lexicons";
import { isDid } from "@atcute/lexicons/syntax";
import validateLicense from "validate-npm-package-license";
import validateNpmPackageName from "../../../lib/validate-npm-package-name";
import * as PackageEncoding from "../../../lib/package-encoding";
import { Title } from "../../components/Title";
import { Header } from "../../components/Header";
import { useSession } from "../..";
import "./index.css";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { ok as unwrap } from "@atcute/client";
import * as v from "@atcute/lexicons/validations";

function isCorrectlyEncodedName(spec: string) {
	return !spec.match(/[/@\s+%:]/) && spec === encodeURIComponent(spec);
}

function isValidScopedPackageName(spec: string) {
	if (spec.charAt(0) !== "@") {
		return false;
	}

	const rest = spec.slice(1).split("/");
	if (rest.length !== 2) {
		return false;
	}

	return (
		rest[0] &&
		rest[1] &&
		rest[0] === encodeURIComponent(rest[0]) &&
		rest[1] === encodeURIComponent(rest[1])
	);
}
const isEmail = (str: string) =>
	str.includes("@") && str.indexOf("@") < str.lastIndexOf(".");
function parseBugs(value: unknown): GenericUri | undefined {
	if (!value) return;
	if (typeof value === "string") {
		if (isEmail(value)) {
			return `mailto:${value}`;
		} else if (URL.canParse(value)) {
			return value as GenericUri;
		} else {
			throw new TypeError(
				`Bug string field must be url, email, or {email,url}`,
			);
		}
	} else if (typeof value === "object") {
		const valueObj = value as Record<string, unknown>;
		if (valueObj.url) {
			if (typeof valueObj.url === "string" && URL.canParse(valueObj.url)) {
				return valueObj.url as GenericUri;
			} else {
				throw new TypeError("bugs.url field must be a string url");
			}
		}
		if (valueObj.email) {
			if (typeof valueObj.email === "string" && isEmail(valueObj.email)) {
				return `mailto:${valueObj.email}`;
			} else {
				throw new TypeError("bugs.email field must be a string email");
			}
		}
	}
}

function parsePerson(
	value: unknown,
	field: string,
): OrgPurlAtpkgsNodeVersion.Person {
	let personString;
	if (typeof value !== "string") {
		assert(typeof value === "object" && value !== null);
		const name = ("name" in value && value.name) || "";
		const u = ("url" in value && value.url) || ("web" in value && value.web) ||
			"";
		const wrappedUrl = u ? " (" + u + ")" : "";
		const e = ("email" in value && value.email) ||
			("mail" in value && value.mail) ||
			"";
		const wrappedEmail = e ? " <" + e + ">" : "";
		personString = name + wrappedEmail + wrappedUrl;
	} else {
		personString = value;
	}
	const matchedName = personString.match(/^([^(<]+)/);
	const matchedUrl = personString.match(/\(([^()]+)\)/);
	const matchedEmail = personString.match(/<([^<>]+)>/);
	const parsed: { name?: string; email?: string; url?: string } = {};
	if (matchedName?.[0].trim()) {
		parsed.name = matchedName[0].trim();
	}
	if (matchedEmail) {
		parsed.email = matchedEmail[1];
	}
	if (matchedUrl) {
		parsed.url = matchedUrl[1];
	}
	let did;
	let atUri = false;
	let didEmail = false;
	if (parsed.url?.startsWith("at://")) {
		const maybeDid = parsed.url.slice("at://".length);
		if (isDid(maybeDid)) {
			did = maybeDid;
		}
		atUri = true;
	}
	if (isDid(parsed.email)) {
		did = parsed.email;
		didEmail = true;
	}
	const uri =
		(atUri
			? undefined
			: parsed.url && URL.canParse(parsed.url)
			? (parsed.url as GenericUri)
			: undefined) ??
			(didEmail
				? undefined
				: parsed.email
				? `mailto:${parsed.email}`
				: undefined);
	if (!uri && !did) {
		throw new TypeError(
			field + " field must have an atproto did, url, or email address",
		);
	}
	return {
		did,
		uri,
	};
}

function parsePeople(
	value: unknown,
	field: string,
): OrgPurlAtpkgsNodeVersion.Person[] {
	if (!Array.isArray(value)) {
		throw new TypeError(field + " field must be an array");
	}
	return value.map((e, i) => parsePerson(e, `${field}[${i}]`));
}
function parseDependencies(
	value: unknown,
	field: string,
): (
	| (OrgPurlAtpkgsNodeVersion.AtDependency & {
		$type: "org.purl.atpkgs.node.version#atDependency";
	})
	| (OrgPurlAtpkgsNodeVersion.NpmDependency & {
		$type: "org.purl.atpkgs.node.version#npmDependency";
	})
)[] {
	if (value === null || typeof value !== "object") {
		throw new TypeError(field + " field should be Record<string, string>");
	}
	return Object.entries(value).map(
		([k, v]: [string, unknown]):
			| (OrgPurlAtpkgsNodeVersion.AtDependency & {
				$type: "org.purl.atpkgs.node.version#atDependency";
			})
			| (OrgPurlAtpkgsNodeVersion.NpmDependency & {
				$type: "org.purl.atpkgs.node.version#npmDependency";
			}) => {
			const result = validateNpmPackageName(k);
			if (!result.validForOldPackages) {
				throw new TypeError(
					field +
						" key " +
						JSON.stringify(k) +
						" is not a valid package name: " +
						result.errors.join(", "),
				);
			}
			if (typeof v !== "string") {
				throw new TypeError(
					field + "[" + JSON.stringify(k) + "] should be string",
				);
			}
			let pkg, semver;
			if (tryParseRange(v)) {
				pkg = k;
				semver = v;
			} else if (v.startsWith("npm:")) {
				const versionIndex = v.indexOf("@", 5);
				pkg = v.slice(
					"npm:".length,
					versionIndex === -1 ? Infinity : versionIndex,
				);
				const result = validateNpmPackageName(pkg);
				if (!result.validForOldPackages) {
					throw new TypeError(
						field +
							"[" +
							JSON.stringify(k) +
							"] aliases to an invalid npm package name: " +
							result.errors.join(", "),
					);
				}
				semver = versionIndex === -1 ? "*" : v.slice(versionIndex + 1);
				parseRange(semver);
			} else if (v.startsWith("jsr:")) {
				const match = v.match(/^jsr:@([^@/]+)\/([^@/]+)(@.+)?$/);
				if (!match) {
					throw new TypeError(
						field +
							"[" +
							JSON.stringify(k) +
							"] is not a valid jsr package name",
					);
				}
				pkg = "@jsr/" + match[1] + "__" + match[2];
				const result = validateNpmPackageName(pkg);
				if (!result.validForOldPackages) {
					throw new TypeError(
						field +
							"[" +
							JSON.stringify(k) +
							"] aliases to an invalid npm package name: " +
							result.errors.join(", "),
					);
				}
				semver = match[3] ?? "*";
				parseRange(semver);
			} else {
				throw new TypeError(
					field +
						"[" +
						JSON.stringify(k) +
						"] doesn't look like an npm or jsr package",
				);
			}
			if (pkg.startsWith("@atpkgs/")) {
				return {
					$type: "org.purl.atpkgs.node.version#atDependency",
					name: k,
					uri: PackageEncoding.toAtUri(pkg),
					range: semver,
				};
			}
			return {
				$type: "org.purl.atpkgs.node.version#npmDependency",
				name: k,
				specifier: pkg,
				range: semver,
			};
		},
	);
}
const BYTES_MIME = "application/octet-stream";

export async function PublishPage() {
	const tarball = await (async (): Promise<Blob> => {
		const params = new URLSearchParams(location.hash.slice(1));
		const url = params.get("tarball");
		if (url) {
			const res = await fetch(url);
			if (!res.ok) {
				throw Object.assign(new Error(res.status + ": " + (await res.text())), {
					name: "TarballFetchFailed",
				});
			}
			let base;
			const blob = await new Response(
				res
					.body!.pipeThrough(new DecompressionStream("gzip"))
					.pipeThrough(new UntarStream())
					.pipeThrough(
						new TransformStream({
							async transform(entry, controller) {
								let path = normalize(entry.path);
								base ??= path.split("/")[0];
								assert(
									!/^(\.\.)?\//.test(path),
									"package.json paths should be relative",
								);
								assert(
									path === base || path.startsWith(base + "/"),
									"package.json paths should share a common prefix",
								);
								path = path.slice(base!.length + 1);
								if (path === "package.json") {
									const obj: unknown = await new Response(
										entry.readable,
									).json();
									if (typeof obj === "object" && obj !== null) {
										const pkg = obj as Record<string, unknown>;
										if (typeof pkg.atpkgs === "object" && pkg.atpkgs !== null) {
											const overrides = pkg.atpkgs as Record<string, unknown>;
											delete pkg.atpkgs;
											for (const k in overrides) {
												if (
													typeof pkg[k] === "object" &&
													pkg[k] !== null &&
													typeof overrides[k] === "object" &&
													overrides[k] !== null
												) {
													Object.assign(pkg[k] as any, overrides[k]);
												} else {
													pkg[k] = overrides[k];
												}
											}
										}
										const blob = await new Response(
											JSON.stringify(pkg, null, 2),
										).blob();
										entry.header.size = blob.size;
										entry.readable = blob.stream();
									}
								}
								if (entry.header.typeflag === "5") {
									entry.readable?.cancel();
									controller.enqueue({
										type: "directory",
										path: path ? "package/" + path : "package",
									});
								} else {
									assert(
										entry.header.typeflag === "0",
										"tar entries should be a file or directory",
									);
									controller.enqueue({
										type: "file",
										path: path ? "package/" + path : "package",
										readable: entry.readable,
										size: entry.header.size,
									});
								}
							},
						}),
					)
					.pipeThrough(new TarStream())
					.pipeThrough(new CompressionStream("gzip")),
				{ headers: { "content-type": BYTES_MIME } },
			).blob();
			await set("publish-staged-tarball", blob);
			return blob;
		} else {
			const cached = await get("publish-staged-tarball");
			if (!cached) {
				throw Object.assign(
					new Error("run `atpkgs publish` from the cli to get started"),
					{ name: "NoStagedPublish" },
				);
			}
			return cached;
		}
	})();
	history.replaceState(null, "", location.pathname + location.search);
	let base;
	const [hashStream, tarStream] = tarball.stream().tee();
	const [{ pkg, filenames }, { cid, legacyShasum }] = await Promise.all([
		(async () => {
			let pkg: Record<string, unknown> | undefined,
				filenames: string[] = [];
			for await (
				const entry of tarStream
					.pipeThrough(new DecompressionStream("gzip"))
					.pipeThrough(new UntarStream())
			) {
				let path = normalize(entry.path);
				base ??= path.split("/")[0];
				assert(
					!/^(\.\.)?\//.test(path),
					"package.json paths should be relative",
				);
				assert(
					path === base || path.startsWith(base + "/"),
					"package.json paths should share a common prefix",
				);
				path = path.slice(base!.length + 1);
				filenames.push(path);
				if (path === "package.json") {
					const obj: unknown = await new Response(entry.readable).json();
					if (typeof obj === "object" && obj !== null) {
						pkg = obj as Record<string, unknown>;
					}
				} else {
					await entry.readable?.cancel();
				}
			}
			if (!pkg) throw new Error("expected a package.json");
			return { pkg, filenames };
		})(),
		(async () => {
			const hash = sha256.create();
			const legacyShasum = sha1.create();
			for await (const chunk of hashStream.values()) {
				hash.update(chunk);
				legacyShasum.update(chunk);
			}
			return { cid: hashToCid(hash), legacyShasum: legacyShasum.digest() };
		})(),
	]);

	if (typeof pkg.name !== "string") {
		throw new Error("name field must be a string.");
	}
	if (
		pkg.name.startsWith(".") ||
		!(isValidScopedPackageName(pkg.name) || isCorrectlyEncodedName(pkg.name)) ||
		pkg.name !== pkg.name.toLowerCase() ||
		pkg.name === "node_modules" ||
		pkg.name === "favicon.ico" ||
		pkg.name !== pkg.name.trim()
	) {
		throw new Error(
			"Invalid internal package name: " + JSON.stringify(pkg.name),
		);
	}
	if (typeof pkg.version !== "string") {
		throw new Error("version field must be a string.");
	}
	parse(pkg.version); // validate semver
	const version = pkg.version;
	let cpu: string[] | undefined;
	if (pkg.cpu) {
		if (
			!(Array.isArray(pkg.cpu) && pkg.cpu.every((e) => typeof e === "string"))
		) {
			throw new TypeError("cpu field must be an array of strings.");
		}
		cpu = pkg.cpu;
	}
	let os: string[] | undefined;
	if (pkg.os) {
		if (
			!(Array.isArray(pkg.os) && pkg.os.every((e) => typeof e === "string"))
		) {
			throw new TypeError("os field must be an array of strings.");
		}
		os = pkg.os;
	}
	let description: string | undefined;
	if (pkg.description) {
		if (typeof pkg.description !== "string") {
			throw new TypeError("description field must be an array of strings.");
		}
		description = pkg.description;
	}
	let keywords: string[] | undefined;
	if (pkg.keywords) {
		const value = typeof pkg.keywords === "string"
			? pkg.keywords.split(/,\s+/)
			: pkg.keywords;
		if (
			!(Array.isArray(value) && value.every((e) => typeof e === "string" && e))
		) {
			throw new TypeError("keywords field must be an array of strings.");
		}
		keywords = value;
	}
	let funding: GenericUri[] | undefined;
	if (pkg.funding) {
		const value = Array.isArray(pkg.funding) ? pkg.funding : [pkg.funding];
		funding = value.map((e: unknown, i) => {
			if (typeof e === "string" && URL.canParse(e)) return e as GenericUri;
			if (
				typeof e === "object" &&
				e !== null &&
				"url" in e &&
				typeof e.url === "string" &&
				URL.canParse(e.url)
			) {
				return e.url as GenericUri;
			}
			throw new Error(
				`funding[${i}] field must be string, {url: string}, or Array<string | {url: string}>.`,
			);
		});
	}
	let homepage: GenericUri | undefined;
	if (pkg.homepage) {
		if (typeof pkg.homepage !== "string") {
			throw new TypeError("homepage field must be a string url.");
		} else {
			if (!URL.canParse(pkg.homepage)) {
				throw new TypeError("homepage field must be a string url.");
			} else {
				homepage = pkg.homepage as GenericUri;
			}
		}
	}
	const license = pkg.license || pkg.licence;
	if (!license) {
		throw new TypeError("No license field.");
	} else if (
		typeof license !== "string" ||
		license.length < 1 ||
		license.trim() === ""
	) {
		throw new TypeError("license should be a valid SPDX license expression");
	} else if (!validateLicense(license).validForNewPackages) {
		throw new TypeError("license should be a valid SPDX license expression");
	}
	let repository: OrgPurlAtpkgsNodeVersion.Repository | undefined;
	if (pkg.repository) {
		const value = typeof pkg.repository === "string"
			? {
				type: "git",
				url: pkg.repository,
			}
			: pkg.repository;
		if (
			typeof value !== "object" ||
			value === null ||
			!("url" in value) ||
			typeof value.url !== "string" ||
			!URL.canParse(value.url)
		) {
			throw new TypeError("repository should be a string url or {url: string}");
		}
		let directory: string | undefined;
		if ("directory" in value && typeof value.directory === "string") {
			directory = value.directory;
		}
		repository = {
			uri: value.url as GenericUri,
			directory,
		};
	}
	const partialRecord: Omit<OrgPurlAtpkgsNodeVersion.Main, "$type" | "name"> = {
		dist: {
			$type: "blob",
			mimeType: BYTES_MIME,
			ref: cid,
			size: tarball.size,
		},
		legacyShasum: new BytesWrapper(legacyShasum),
		version: version,
		bugs: parseBugs(pkg.bugs),
		contributors: pkg.contributors
			? parsePeople(pkg.contributors, "contributors")
			: undefined,
		cpu,
		description,
		os,
		keywords,
		funding,
		homepage,
		license,
		repository,
		dependencies: pkg.dependencies
			? parseDependencies(pkg.dependencies, "dependencies")
			: undefined,
		peerDependencies: pkg.peerDependencies
			? parseDependencies(pkg.peerDependencies, "peerDependencies")
			: undefined,
		optionalDependencies: pkg.optionalDependencies
			? parseDependencies(pkg.optionalDependencies, "optionalDependencies")
			: undefined,
	};
	return (
		<PublishForm
			pkg={pkg}
			partialRecord={partialRecord}
			originalName={pkg.name + ""}
			tarball={tarball}
		/>
	);
}

function PublishForm({
	partialRecord,
	tarball,
	originalName,
	pkg,
}: {
	partialRecord: Omit<OrgPurlAtpkgsNodeVersion.Main, "$type" | "name">;
	tarball: Blob;
	originalName: string;
	pkg: unknown;
}) {
	const [publishState, setPublishState] = useState<
		| null
		| { state: "publishing" }
		| { state: "error"; error: unknown }
		| {
			state: "done";
		}
	>(null);
	const session = useSession();
	const inputRef = useRef<HTMLInputElement>(null);
	const prefixRef = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const update = () => {
			inputRef.current!.style.paddingLeft = `calc(0.5em + ${
				prefixRef.current!.getBoundingClientRect().width
			}px)`;
		};
		const observer = new ResizeObserver(update);
		observer.observe(prefixRef.current!);
		return () => observer.disconnect();
	}, []);
	const handle = session.handle ?? "handle.invalid";
	const prefix = "@" + handle + "/";
	return (
		<div class="page page-publish">
			<Title>{"Publish"}</Title>
			<Header />
			<main>
				<h1>
					{publishState?.state === "done" ? "Published" : "Publishing"}{" "}
					{originalName} v{partialRecord.version}
				</h1>
				{session.did
					? null
					: <div class="error">You must be signed in to publish packages!</div>}
				{publishState?.state === "error"
					? <div class="error">{publishState.error + ""}</div>
					: null}
				{publishState?.state === "done"
					? (
						<p>
							You're all set, check{" "}
							<a href={"/@" + session.handle}>your profile</a>!
						</p>
					)
					: (
						<form
							onSubmit={async (e) => {
								e.preventDefault();
								if (!session.did) return;
								if (publishState?.state === "publishing") return;
								setPublishState({ state: "publishing" });
								try {
									const name = inputRef.current!.value;
									const pkgResult = await (
										await session.rpc
									).get("com.atproto.repo.getRecord", {
										params: {
											collection: "org.purl.atpkgs.node.package",
											repo: session.did,
											rkey: name,
										},
									});
									const { value: packument, cid: packumentCid } = pkgResult.ok
										? (pkgResult.data as
											& Omit<typeof pkgResult.data, "value">
											& {
												value: OrgPurlAtpkgsNodePackage.Main;
											})
										: { value: undefined, cid: undefined };
									if (
										packument?.versions.find(
											(e) => e.version === partialRecord.version,
										)
									) {
										throw new Error("version already exists");
									}
									const expectedCid = v.parse(v.blob(), partialRecord.dist).ref
										.$link;
									const uploadResult = await unwrap(
										(await session.rpc).post("com.atproto.repo.uploadBlob", {
											input: tarball,
										}),
									);
									if (uploadResult.blob.ref.$link !== expectedCid) {
										throw new Error(
											"expected blob cid to be " +
												expectedCid +
												", got " +
												uploadResult.blob.ref.$link,
										);
									}
									partialRecord.dist.mimeType = uploadResult.blob.mimeType;
									const created = await unwrap(
										(await session.rpc).post("com.atproto.repo.createRecord", {
											input: {
												collection: "org.purl.atpkgs.node.version",
												repo: session.did,
												record: {
													$type: "org.purl.atpkgs.node.version",
													name,
													...partialRecord,
												} satisfies OrgPurlAtpkgsNodeVersion.Main,
											},
										}),
									);
									if (!packument) {
										await unwrap(
											(await session.rpc).post(
												"com.atproto.repo.createRecord",
												{
													input: {
														collection: "org.purl.atpkgs.node.package",
														repo: session.did,
														rkey: name,
														record: {
															$type: "org.purl.atpkgs.node.package",
															name,
															tags: [
																{
																	tag: "latest",
																	version: partialRecord.version,
																},
															],
															versions: [
																{
																	version: partialRecord.version,
																	uri: created.uri,
																	cid: {
																		$link: created.cid,
																	},
																},
															],
														} satisfies OrgPurlAtpkgsNodePackage.Main,
													},
												},
											),
										);
									} else {
										if (!packumentCid) throw new Error("expected packumentCid");
										await unwrap(
											(await session.rpc).post("com.atproto.repo.putRecord", {
												input: {
													collection: "org.purl.atpkgs.node.package",
													repo: session.did,
													rkey: name,
													record: {
														$type: "org.purl.atpkgs.node.package",
														name,
														tags:
															parse(partialRecord.version).prerelease?.length
																? packument.tags
																: [
																	{
																		tag: "latest",
																		version: partialRecord.version,
																	},
																	...packument.tags.filter(
																		(e) => e.tag !== "latest",
																	),
																],
														versions: [
															{
																version: partialRecord.version,
																uri: created.uri,
																cid: {
																	$link: created.cid,
																},
															},
															...packument.versions,
														],
													} satisfies OrgPurlAtpkgsNodePackage.Main,
													swapRecord: packumentCid,
												},
											}),
										);
									}
									setPublishState({ state: "done" });
								} catch (error) {
									setPublishState({ state: "error", error });
								}
							}}
						>
							<div class="form-row">
								<label for="publish-name">Publish as</label>
								<div class="publish-input">
									<span ref={prefixRef}>{prefix}</span>
									<input
										ref={inputRef}
										placeholder="my-package"
										type="text"
										id="publish-name"
										defaultValue={originalName.startsWith(prefix)
											? originalName.slice(prefix.length)
											: ""}
										required
									/>
								</div>
							</div>
							<button
								aria-disabled={publishState?.state === "publishing"}
								aria-label={publishState?.state === "publishing"
									? "Publishing..."
									: "Publish"}
								class={publishState?.state === "publishing"
									? "button-loading"
									: ""}
								disabled={!session.did}
							>
								Publish
							</button>
						</form>
					)}
				<br />
				<details>
					<summary>preview package.json</summary>
					<pre>{JSON.stringify(pkg, null, 2)}</pre>
				</details>
				<details>
					<summary>preview atpkgs version record</summary>
					<pre>{JSON.stringify(partialRecord, null, 2)}</pre>
				</details>
			</main>
		</div>
	);
}
