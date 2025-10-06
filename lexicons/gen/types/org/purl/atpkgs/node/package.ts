import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.string(),
	/*#__PURE__*/ v.object({
		$type: /*#__PURE__*/ v.literal("org.purl.atpkgs.node.package"),
		name: /*#__PURE__*/ v.recordKeyString(),
		get tags() {
			return /*#__PURE__*/ v.array(tagSchema);
		},
		get versions() {
			return /*#__PURE__*/ v.array(versionSchema);
		},
	}),
);
const _tagSchema = /*#__PURE__*/ v.object({
	$type: /*#__PURE__*/ v.optional(
		/*#__PURE__*/ v.literal("org.purl.atpkgs.node.package#tag"),
	),
	tag: /*#__PURE__*/ v.recordKeyString(),
	version: /*#__PURE__*/ v.string(),
});
const _versionSchema = /*#__PURE__*/ v.object({
	$type: /*#__PURE__*/ v.optional(
		/*#__PURE__*/ v.literal("org.purl.atpkgs.node.package#version"),
	),
	cid: /*#__PURE__*/ v.cidLink(),
	deprecated: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
	uri: /*#__PURE__*/ v.resourceUriString(),
	version: /*#__PURE__*/ v.string(),
});

type main$schematype = typeof _mainSchema;
type tag$schematype = typeof _tagSchema;
type version$schematype = typeof _versionSchema;

export interface mainSchema extends main$schematype {}
export interface tagSchema extends tag$schematype {}
export interface versionSchema extends version$schematype {}

export const mainSchema = _mainSchema as mainSchema;
export const tagSchema = _tagSchema as tagSchema;
export const versionSchema = _versionSchema as versionSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}
export interface Tag extends v.InferInput<typeof tagSchema> {}
export interface Version extends v.InferInput<typeof versionSchema> {}

declare module "@atcute/lexicons/ambient" {
	interface Records {
		"org.purl.atpkgs.node.package": mainSchema;
	}
}
