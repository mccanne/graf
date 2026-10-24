#!/usr/bin/env node
/*
 * Command line launcher: runs the Electron app with our arguments, in the
 * current directory, with stdin/stdout/stderr passed through so that
 * "cmd | graf" works as it did under X.
 */

const { spawn } = require("child_process");
const path = require("path");

/* Requiring electron from node gives the path to its binary. */
const electron = require("electron");
const appDir = path.join(__dirname, "..");

const child = spawn(electron, [appDir, ...process.argv.slice(2)], {
	stdio: "inherit",
	windowsHide: false,
});
child.on("close", (code, signal) => {
	if (code === null) {
		console.error(`graf: exited with signal ${signal}`);
		process.exit(1);
	}
	process.exit(code);
});
for (const sig of ["SIGINT", "SIGTERM"])
	process.on(sig, () => child.kill(sig));
