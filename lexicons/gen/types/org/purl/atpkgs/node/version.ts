import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _atDependencySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("org.purl.atpkgs.node.version#atDependency"),
  ),
  name: /*#__PURE__*/ v.string(),
  range: /*#__PURE__*/ v.string(),
  uri: /*#__PURE__*/ v.resourceUriString(),
});
const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.tidString(),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("org.purl.atpkgs.node.version"),
    bugs: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
    get contributors() {
      return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(personSchema));
    },
    cpu: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    ),
    get dependencies() {
      return /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.array(
          /*#__PURE__*/ v.variant([atDependencySchema, npmDependencySchema]),
        ),
      );
    },
    description: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    dist: /*#__PURE__*/ v.blob(),
    funding: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.genericUriString()),
    ),
    homepage: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
    keywords: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    ),
    legacyShasum: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.bytes(), [
      /*#__PURE__*/ v.bytesSize(20, 20),
    ]),
    license: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    name: /*#__PURE__*/ v.recordKeyString(),
    get optionalDependencies() {
      return /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.array(
          /*#__PURE__*/ v.variant([atDependencySchema, npmDependencySchema]),
        ),
      );
    },
    os: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    ),
    get peerDependencies() {
      return /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.array(
          /*#__PURE__*/ v.variant([atDependencySchema, npmDependencySchema]),
        ),
      );
    },
    get repository() {
      return /*#__PURE__*/ v.optional(repositorySchema);
    },
    version: /*#__PURE__*/ v.string(),
  }),
);
const _npmDependencySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("org.purl.atpkgs.node.version#npmDependency"),
  ),
  name: /*#__PURE__*/ v.string(),
  range: /*#__PURE__*/ v.string(),
  specifier: /*#__PURE__*/ v.string(),
});
const _personSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("org.purl.atpkgs.node.version#person"),
  ),
  did: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
  uri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
});
const _repositorySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("org.purl.atpkgs.node.version#repository"),
  ),
  directory: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  uri: /*#__PURE__*/ v.genericUriString(),
});

type atDependency$schematype = typeof _atDependencySchema;
type main$schematype = typeof _mainSchema;
type npmDependency$schematype = typeof _npmDependencySchema;
type person$schematype = typeof _personSchema;
type repository$schematype = typeof _repositorySchema;

export interface atDependencySchema extends atDependency$schematype {}
export interface mainSchema extends main$schematype {}
export interface npmDependencySchema extends npmDependency$schematype {}
export interface personSchema extends person$schematype {}
export interface repositorySchema extends repository$schematype {}

export const atDependencySchema = _atDependencySchema as atDependencySchema;
export const mainSchema = _mainSchema as mainSchema;
export const npmDependencySchema = _npmDependencySchema as npmDependencySchema;
export const personSchema = _personSchema as personSchema;
export const repositorySchema = _repositorySchema as repositorySchema;

export interface AtDependency extends v.InferInput<typeof atDependencySchema> {}
export interface Main extends v.InferInput<typeof mainSchema> {}
export interface NpmDependency
  extends v.InferInput<typeof npmDependencySchema> {}
export interface Person extends v.InferInput<typeof personSchema> {}
export interface Repository extends v.InferInput<typeof repositorySchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "org.purl.atpkgs.node.version": mainSchema;
  }
}
