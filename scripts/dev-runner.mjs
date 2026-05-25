import { spawn } from "node:child_process";
import process from "node:process";

const children = [];

const start = (name, command, args) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
  });

  children.push(child);
};

const shutdown = (exitCode = 0) => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("server", process.execPath, ["./node_modules/tsx/dist/cli.mjs", "server/index.ts"]);
start("client", process.execPath, ["./node_modules/vite/bin/vite.js"]);
