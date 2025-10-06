import { defineLexiconConfig } from "@atcute/lex-cli";

export default defineLexiconConfig({
  files: ["dist/*.json"],
  outdir: "gen",
});
