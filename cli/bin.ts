#!/usr/bin/env node
import assert from "assert";
import { execSync, spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdtemp, readdir, rm, stat } from "fs/promises";
import { createServer } from "http";
import { tmpdir } from "os";
import { detect } from "package-manager-detector/detect";
import { join } from "path";
import { createInterface } from "readline";
import { duplexPair } from "stream";
import { pipeline } from "stream/promises";
import { parseArgs, promisify, styleText } from "util";
import wrapAnsi from "wrap-ansi";
import pkg from "./package.json" with { type: "json" };
import * as v from "@atcute/lexicons/validations";
import { fromAtUri } from "../lib/package-encoding";
import { resolveMiniDoc } from "../lib/resolve-mini-doc";
import { Client, ok as unwrap, simpleFetchHandler } from "@atcute/client";
import { OrgPurlAtpkgsNodePackage } from "../lexicons/gen";
import type { CanonicalResourceUri } from "@atcute/lexicons";

const atpkgsURL = new URL("https://atpkgs.easrng.net/");
{
  const { ATPKGS_URL } = process.env;
  if (ATPKGS_URL) {
    try {
      const origin = new URL(ATPKGS_URL);
      if (origin.href !== origin.origin + "/") throw new Error();
      if (
        origin.protocol !==
          (origin.hostname === "127.0.0.1" ? "http:" : "https:")
      ) {
        throw new Error();
      }
      atpkgsURL.protocol = origin.protocol;
      atpkgsURL.host = origin.host;
    } catch {
      console.error(
        "$ATPKGS_WEB is set to %o, which is not a valid origin",
        ATPKGS_URL,
      );
      process.exit(1);
    }
  }
}
function quote(s: string) {
  if (s === "") return `''`;
  if (!/[^%+,-.\/:=@_0-9A-Za-z]/.test(s)) return s;
  return `'` + s.replace(/'/g, `'"'`) + `'`;
}

function run(
  command: string,
  args: readonly string[],
  silent?: boolean | undefined,
) {
  let buf = "";
  let write: (_: string) => void = silent
    ? (str) => {
      buf += str;
    }
    : (str) => process.stderr.write(str);
  return new Promise<void>((resolve, reject) => {
    const env: Record<string, string> = {
      ...process.env,
      COREPACK_ENABLE_STRICT: "0",
    };
    const colorDepth = process.stderr.getColorDepth();
    if (colorDepth > 256) {
      env.FORCE_COLOR = "3";
    } else if (colorDepth > 16) {
      env.FORCE_COLOR = "2";
    } else if (colorDepth > 2) {
      env.FORCE_COLOR = "1";
    }
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    const [left, right] = duplexPair();
    child.stdout?.pipe(left);
    child.stderr?.pipe(left);
    const isTTY = !silent && process.stderr.isTTY;
    const rl = createInterface({
      input: right,
      crlfDelay: Infinity,
    });
    let eol = isTTY ? "\n" + styleText("dim", "╰──┄") + "\x1bM\r\x1b[K" : "";
    write(styleText("dim", "╭──┄"));
    const line = (text: string) => {
      for (
        const line of isTTY
          ? wrapAnsi(text, process.stderr.getWindowSize()[0] - 4, {
            hard: true,
          }).split("\n")
          : [text]
      ) {
        write(
          "\n" +
            eol +
            styleText("dim", "│") +
            " " +
            line.replace(/\u001b\[(2K|1G)/g, ""),
        );
      }
    };
    line(styleText("dim", "$ " + [command, ...args].map(quote).join(" ")));
    rl.on("line", line);

    child.on(
      "close",
      (code) =>
        code
          ? reject(new Error("command exited with non-zero code " + code))
          : resolve(),
    );
    child.on("error", reject);
  })
    .then(
      () => {
        write("\n" + styleText("dim", "╰──┄") + "\n");
      },
      (err) => {
        write("\n" + styleText("dim", "╰──┄") + "\n");
        process.stdout.write(buf);
        throw err;
      },
    );
}
function isYarnBerry() {
  const version = execSync("yarn --version", {
    encoding: "utf-8",
    env: { ...process.env, COREPACK_ENABLE_STRICT: "0" },
  });
  if (!version) {
    return false;
  }
  if (version.startsWith("1.")) {
    return false;
  }
  return true;
}
async function add() {
  process.stderr.write("- adding...\n");
  const [packages] = await Promise.all([
    Promise.all(
      params.positionals.map(async (e) => {
        const match = e.match(/^@([^@/]+)\/([^@/]+)(@.+)?$/);
        if (!match) throw new Error("invalid package name " + e);
        const identifier = v.parse(v.handleString(), match[1]);
        const name = v.parse(v.recordKeyString(), match[2]);
        let version = match[3] ?? "";
        const { did, pds } = await resolveMiniDoc({ identifier });
        const url: CanonicalResourceUri =
          `at://${did}/org.purl.atpkgs.node.package/${name}`;
        if (pm.agent === "yarn@berry" && !version) {
          const { value } = await unwrap(
            new Client({
              handler: simpleFetchHandler({ service: pds }),
            }).get("com.atproto.repo.getRecord", {
              params: {
                collection: "org.purl.atpkgs.node.package",
                repo: did,
                rkey: name,
              },
            }),
          );
          const packageInfo = v.parse(
            OrgPurlAtpkgsNodePackage.mainSchema,
            value,
          );
          const latest = packageInfo.tags.find((e) =>
            e.tag === "latest"
          )?.version ??
            "*";
          if (latest) {
            version = `@^${latest}`;
          }
        }
        const npmified = fromAtUri(url);
        return `@${identifier}/${name}@npm:${npmified}${version ?? ""}`;
      }),
    ),
    (async () => {
      const registry = new URL(
        await (await fetch(atpkgsURL + ".well-known/atpkgs-registry")).text(),
      ).href;
      /** @type {string[]} */
      const args = [];
      let command = pm.name;
      switch (pm.agent) {
        case "yarn@berry":
          args.push(
            "config",
            "set",
            "npmScopes.atpkgs.npmRegistryServer",
            registry,
          );
          break;
        case "yarn":
        case "bun":
        case "pnpm":
        case "npm":
          command = "npm";
          args.push(
            "config",
            "set",
            "--location=project",
            "@atpkgs:registry",
            registry,
          );
          break;
        default:
          throw new Error(
            "unsupported package manager " +
              pm.agent +
              ". use a flag? (see --help)",
          );
      }
      await run(command, args, true);
    })(),
  ]);
  /** @type {string[]} */
  const args = [];
  let command = pm.name;
  switch (pm.name) {
    case "yarn":
      args.push(
        "add",
        ...(params.values["save-optional"] ? ["-O"] : []),
        ...(params.values["save-dev"] ? ["-D"] : []),
        ...packages,
      );
      break;
    case "pnpm":
    case "npm":
      args.push(
        "install",
        ...(params.values["save-optional"] ? ["-O"] : []),
        ...(params.values["save-dev"] ? ["-D"] : []),
        ...packages,
      );
      break;
    case "bun":
      args.push(
        "install",
        ...(params.values["save-optional"] ? ["--optional"] : []),
        ...(params.values["save-dev"] ? ["--dev"] : []),
        ...packages,
      );
      break;
    default:
      throw new Error(
        "unsupported package manager " +
          pm.agent +
          ". use a flag? (see --help)",
      );
  }
  try {
    await run(command, args);
    process.stderr.write(
      (process.stderr.isTTY ? "\r\x1b[K" : "") +
        styleText("green", "✔") +
        " " +
        "done!\n",
    );
  } catch (e) {
    process.stderr.write(
      (process.stderr.isTTY ? "\r\x1b[K" : "") +
        styleText("red", "✖") +
        " " +
        e +
        "\n",
    );
  }
}
async function publish() {
  const tmpDir = await mkdtemp(join(tmpdir(), "atpkgs-"));
  const pack = join(tmpDir, "pack.tgz");
  /** @type {string[]} */
  const args = [];
  let command = pm.name;
  try {
    switch (pm.name) {
      case "yarn":
        args.push("pack", "-o", pack, "--filename", pack);
        break;
      case "deno":
        command = "npm";
      case "pnpm":
      case "npm":
        args.push("pack", "--pack-destination", tmpDir);
        break;
      case "bun":
        args.push("pm", "pack", "--destination", tmpDir);
        break;
      default:
        /** @type {never} */
        const _ = pm.name;
        throw new Error("unsupported package manager " + pm.agent);
    }
    process.stderr.write("- packing...\n");
    await run(command, args);
    const [outPath] = await readdir(tmpDir);
    if (!outPath) {
      throw new Error(
        `failed to pack: ${command} did not write to output directory`,
      );
    }
    const tarball = join(tmpDir, outPath);

    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
      "access-control-expose-headers": "*",
      "access-control-max-age": "7200",
    };
    const serverPromise = new Promise(async (resolve, reject) => {
      try {
        await Promise.resolve();
        const token = crypto.randomUUID();
        const server = createServer(async (req, res) => {
          try {
            const url = new URL(req.url ?? "", "http://localhost:" + port);
            if (url.searchParams.get("token") !== token) {
              res.writeHead(403, "Unauthorized", {
                ...cors,
              });
              res.write("Unauthorized");
              res.end();
              return;
            }
            const method = (req.method ?? "GET").toUpperCase();
            if (method === "OPTIONS") {
              res.writeHead(204, "", {
                ...cors,
              });
              res.end();
              return;
            }
            if (method !== "GET") {
              res.writeHead(405, "Method Not Allowed", {
                ...cors,
              });
              res.write("Method Not Allowed");
              res.end();
              return;
            }
            if (method === "GET" && url.pathname === "/tarball") {
              const size = (await stat(tarball)).size;
              const stream = createReadStream(tarball);
              res.writeHead(200, "OK", {
                ...cors,
                "content-type": "application/octet-stream",
                "content-length": size,
              });
              await pipeline(stream, res);
              resolve(undefined);
              return;
            }
            res.writeHead(404, "Not Found", {
              ...cors,
            });
            res.write("Not Found");
            res.end();
            return;
          } catch (e) {
            if (!res.closed) {
              if (!res.headersSent) {
                res.writeHead(500, "Server Error", {
                  ...cors,
                });
                res.write("Server Error");
              }
              res.end();
            }
            console.error(e);
          }
        });
        server.unref();
        server.listen(0);
        serverPromise
          .finally(() => {
            server.closeAllConnections();
            server.close();
          })
          .catch(() => {});
        await new Promise((resolve) => server.once("listening", resolve));
        const addr = server.address();
        assert(addr && typeof addr === "object");
        const port = addr.port;
        const url = atpkgsURL +
          "publish#tarball=" +
          encodeURIComponent(`http://localhost:${port}/tarball?token=${token}`);
        process.stderr.write("- opening browser...\n");
        await run(
          process.platform === "win32"
            ? "explorer"
            : process.platform === "darwin"
            ? "open"
            : "xdg-open",
          [url],
        );
        const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        const spin = () => {
          const current = spinner.shift() ?? "";
          spinner.push(current);
          return current;
        };
        process.stderr.write(
          process.stderr.isTTY
            ? spin() + " waiting for publish page to get tarball..."
            : "waiting for publish page to get tarball...\n",
        );
        let checkTimer: null | number = null;
        serverPromise
          .finally(() => {
            if (checkTimer) clearTimeout(checkTimer);
          })
          .catch(() => {});
        const getConnections = promisify(server.getConnections.bind(server));
        let lastConnection = Date.now();
        const scheduleCheck = () => {
          checkTimer = Number(
            setTimeout(async () => {
              checkTimer = null;
              try {
                if (process.stderr.isTTY) {
                  process.stderr.write("\x1b7\r" + spin() + "\x1b8");
                }
                const connections = await getConnections();
                if (connections) {
                  lastConnection = Date.now();
                } else if (Date.now() - lastConnection > 1000 * 60 * 5) {
                  reject(
                    new Error(
                      "timed out waiting for publish page to get tarball",
                    ),
                  );
                  return;
                }
                scheduleCheck();
              } catch (e) {
                reject(e);
              }
            }, 100),
          );
        };
        scheduleCheck();
      } catch (e) {
        reject(e);
      }
    });
    try {
      await serverPromise;

      process.stderr.write(
        (process.stderr.isTTY ? "\r\x1b[K" : "") +
          styleText("green", "✔") +
          " " +
          "done!\n",
      );
    } catch (e) {
      process.stderr.write(
        (process.stderr.isTTY ? "\r\x1b[K" : "") +
          styleText("red", "✖") +
          " " +
          e +
          "\n",
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

const params = parseArgs({
  options: {
    "save-dev": {
      type: "boolean",
      short: "D",
    },
    "save-optional": {
      type: "boolean",
      short: "O",
    },
    npm: {
      type: "boolean",
    },
    yarn: {
      type: "boolean",
    },
    pnpm: {
      type: "boolean",
    },
    bun: {
      type: "boolean",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
  allowPositionals: true,
  allowNegative: false,
});
/** @type {NonNullable<Awaited<ReturnType<typeof detect>>>} */
const pm = params.values.npm
  ? { agent: "npm", name: "npm" }
  : params.values.yarn
  ? isYarnBerry()
    ? { agent: "yarn@berry", name: "yarn" }
    : { agent: "yarn", name: "yarn" }
  : params.values.pnpm
  ? { agent: "pnpm", name: "pnpm" }
  : params.values.bun
  ? { agent: "bun", name: "bun" }
  : ((await detect()) ?? { agent: "npm", name: "npm" });
const subCommand = params.positionals.shift();
const help = params.values.help;
let promise;
try {
  if (subCommand === "publish" && !help) {
    promise = publish();
  } else if (
    (subCommand === "add" || subCommand === "i" || subCommand === "install") &&
    !help
  ) {
    if (params.positionals.length < 1) {
      throw new Error("expected package names");
    }
    promise = add();
  } else if (subCommand && !help) {
    throw new Error("unknown subcommand " + subCommand);
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
if (promise) {
  await promise;
} else {
  console.error(
    `atpkgs cli v${pkg.version}\n\n` +
      `Commands:\n` +
      `  ${
        styleText("green", "atpkgs add <package>")
      }   Install a package from atpkgs\n` +
      `  ${
        styleText("green", "atpkgs publish")
      }         Publish a package to atpkgs\n` +
      "\n" +
      `Options:\n` +
      `  ${
        styleText("green", "-D, --save-dev")
      }         Package will be added to devDependencies\n` +
      `  ${
        styleText("green", "-O, --save-optional")
      }    Package will be added to optionalDependencies\n` +
      `  ${
        styleText("green", "--npm")
      }                  Use npm to install and pack packages\n` +
      `  ${
        styleText("green", "--yarn")
      }                 Use yarn to install and pack packages\n` +
      `  ${
        styleText("green", "--pnpm")
      }                 Use pnpm to install and pack packages\n` +
      `  ${
        styleText("green", "--bun")
      }                  Use bun to install and pack packages\n` +
      `  ${
        styleText("green", "-h, --help")
      }             Show this help text\n` +
      "\n" +
      `Environment variables:\n` +
      `  ${
        styleText("green", "ATPKGS_URL")
      }             Use a different AppView URL`,
  );
}
