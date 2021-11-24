// This file provides the `recheck agent` wrapper implementation.

import { spawn } from "child_process";
import { debuglog } from "util";

import type { ChildProcess } from "child_process";

import type { Config, Diagnostics } from "..";

const debug = debuglog("recheck-agent");

/** A mapping from a supported platform (OS) name to the corresponding package name component. */
const osNames: Record<string, string> = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

/** A mapping from a supported architecture (CPU) name to the corresponding package name component. */
const cpuNames: Record<string, string> = {
  x64: "x64",
};

/** Returns a `recheck` CLI path if possible. */
const getCLIPath = (): string | null => {
  // If `RECHECK_PATH` environment variable is set, then it returns this immediately.
  const RECHECK_PATH = process.env["RECHECK_PATH"] || null; // `||` is intentional for ignoring an empty string.
  if (RECHECK_PATH !== null) {
    return RECHECK_PATH;
  }

  // Fetches `os` and `cpu` name. If it is not supported, then it returns `null`.
  const os = osNames[process.platform];
  const cpu = cpuNames[process.arch];
  const isWin32 = os === "windows";
  if (!os || !cpu) {
    return null;
  }

  try {
    // Constructs a package name with a binary file name, and resolves this.
    // If it is succeeded, we expect that the result path is `recheck` CLI.
    const bin = isWin32 ? "recheck.exe" : "recheck";
    const pkg = `recheck-${os}-${cpu}/${bin}`;
    const path = require.resolve(pkg);
    return path;
  } catch (err: any) {
    if (err && err.code == "MODULE_NOT_FOUND") {
      return null;
    }

    throw err;
  }
};

/** Ref is a pair of promise `resolve`/`reject` functions. */
type Ref = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
};

/**
 * Agent is a shallow `recheck agent` command wrapper.
 * It is JSON-RPC client via `child` process's stdio.
 */
class Agent {
  /** A child process of `recheck agent`. */
  private readonly child: ChildProcess;

  /** The next request ID number. */
  private id: number;

  /** A mapping from request ID to corresponding promise reference. */
  private readonly refs: Map<number, Ref>;

  constructor(child: ChildProcess) {
    this.child = child;
    this.id = 0;
    this.refs = new Map();
    this.handle();
  }

  /** Sends a request to `recheck agent` process. */
  public request(
    method: string,
    params: any
  ): { id: number; promise: Promise<any> } {
    const id = this.id++;
    const promise = new Promise((resolve, reject) => {
      const object = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };
      const text = JSON.stringify(object) + "\n";
      debug("Send a request: %s", text);
      this.child.stdin!.write(text);
      this.refs.set(id, { resolve, reject });
    });
    return { id, promise };
  }

  /** Sends a notification to `recheck agent` process. */
  public notify(method: string, params: any): Promise<void> {
    return new Promise((resolve) => {
      const object = {
        jsonrpc: "2.0",
        method,
        params,
      };
      const text = JSON.stringify(object) + "\n";
      debug("Send a notification: %s", text);
      this.child.stdin!.write(text);
      resolve();
    });
  }

  /** Sets up response handlers to `recheck agent` process. */
  private handle() {
    // Holds the remaining last line of the response.
    let remainingLastLine = "";

    const handleLine = (line: string) => {
      if (line === "") {
        return;
      }

      debug("Handle a response line: %s", line);
      const { id, result } = JSON.parse(line);
      const ref = this.refs.get(id) ?? null;
      if (ref === null) {
        debug("A promise reference is missing: %s", id);
        return;
      }

      ref.resolve(result);
      this.refs.delete(id);
    };

    this.child.stdout!.on("data", (data) => {
      const text = data.toString("utf-8");
      const lines = text.split("\n");

      const firstLine = lines.shift() ?? "";
      const lastLine = lines.pop() ?? "";

      handleLine(remainingLastLine + firstLine);
      for (const line of lines) {
        handleLine(line);
      }

      remainingLastLine = lastLine;
    });
  }
}

/** The running agent. */
let agent: Agent | null = null;

/** Returns running agent if possible, or it returns `null`. */
export function ensureAgent(): Agent | null {
  if (agent !== null) {
    debug("Running agent is found.");
    return agent;
  }

  const cli = getCLIPath();
  debug("`recheck` CLI path: %s", cli);
  if (cli === null) {
    return null;
  }

  // TODO: Handle failures on process spawning.
  debug("Run `%s agent`.", cli);
  const child = spawn(cli, ["agent"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "inherit"],
  });

  agent = new Agent(child);
  return agent;
}

export async function check(
  source: string,
  flags: string,
  config: Config = {}
): Promise<Diagnostics> {
  const signal = config.signal ?? null;
  if (signal) {
    delete config.signal;
  }

  const agent = ensureAgent();
  if (agent === null) {
    throw new Error("`recheck` command is missing.");
  }

  const { id, promise } = agent.request("check", { source, flags, config });
  signal?.addEventListener("abort", () => {
    agent.notify("cancel", { id });
  });

  return await promise;
}
