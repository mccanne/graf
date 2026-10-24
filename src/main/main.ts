/*
 * Electron main process.  Port of main.c and the window management parts
 * of xwin.c: parses arguments, reads the data, and opens plot windows.
 * Zooming opens a new window, as in the original; the program exits when
 * the last window is closed.
 */

import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import * as fs from "fs";
import * as path from "path";

import type { BBox, DataSet, GlobalOptions, PlotFlags, WindowInit,
    ZoomRequest } from "../common/types";
import { Args, Geometry, parseArgs, USAGE, UsageError } from "./args";
import { DataReader, dataSetsBBox } from "./dataset";

const PROGNAME = "graf";
const BG_COLOR = "#d3d3d3";	/* X11 LightGray */
const BW_BG_COLOR = "#ffffff";

function die(msg: string): never {
	process.stderr.write(`${PROGNAME}: ${msg}\n`);
	app.exit(1);
	/* app.exit() doesn't return in practice, but make sure. */
	process.exit(1);
}

function usage(msg: string): never {
	if (msg !== "")
		process.stderr.write(`${PROGNAME}: ${msg}\n`);
	process.stderr.write(USAGE);
	app.exit(1);
	process.exit(1);
}

/* Command line arguments after the electron binary and app path. */
function userArgs(): string[] {
	return process.argv.slice(app.isPackaged ? 1 : 2);
}

function readData(args: Args): DataSet[] {
	const reader = new DataReader({
		logX: args.logX, logY: args.logY, names: args.names,
	});
	const read = (name: string | null, buf: Buffer) => {
		if (args.ulaw)
			reader.readUlaw(new Uint8Array(buf), name);
		else
			reader.readText(buf.toString("latin1"), name);
	};
	if (args.files.length === 0) {
		if (process.stdin.isTTY)
			usage("no input files and standard input is a terminal");
		read(null, fs.readFileSync(0));
	} else {
		for (const f of args.files) {
			let buf: Buffer;
			try {
				buf = f === "-" ? fs.readFileSync(0) :
				    fs.readFileSync(f);
			} catch (e) {
				die(`${f}: ${(e as Error).message}`);
			}
			read(f === "-" ? null : f, buf);
		}
	}
	return reader.datasets();
}

interface WindowState {
	init: WindowInit;
}

const windows = new Map<number, WindowState>();
let datasets: DataSet[] = [];
let options: GlobalOptions;
let background = BG_COLOR;

function createPlotWindow(init: WindowInit, width: number, height: number,
    x?: number, y?: number): void {
	const win = new BrowserWindow({
		width, height, x, y,
		minWidth: 100,
		minHeight: 100,
		useContentSize: true,
		title: PROGNAME,
		backgroundColor: background,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	const id = win.webContents.id;
	windows.set(id, { init });
	win.on("closed", () => windows.delete(id));
	win.once("ready-to-show", () => win.show());
	win.loadFile(path.join(app.getAppPath(), "index.html"));
}

/* Applies an X11-style geometry to the primary display. */
function placement(g: Geometry): { x?: number; y?: number } {
	if (g.x === undefined || g.y === undefined)
		return {};
	const area = screen.getPrimaryDisplay().workArea;
	const x = g.xNeg ? area.x + area.width - g.width - g.x : area.x + g.x;
	const y = g.yNeg ? area.y + area.height - g.height - g.y : area.y + g.y;
	return { x, y };
}

function cloneFlags(f: PlotFlags): PlotFlags {
	return { ...f };
}

function main() {
	let args: Args;
	try {
		args = parseArgs(userArgs());
	} catch (e) {
		if (e instanceof UsageError)
			usage(e.message);
		throw e;
	}
	datasets = readData(args);
	options = {
		bw: args.bw,
		font: args.font,
		precision: 4,
		logX: args.logX,
		logY: args.logY,
	};
	if (args.bw)
		background = BW_BG_COLOR;

	const bbox: BBox = dataSetsBBox(datasets);
	const lim = (v: number, log: boolean) =>
	    log ? (v > 0 ? Math.log10(v) : NaN) : v;
	if (args.xlim !== undefined) {
		bbox.loX = lim(args.xlim[0], args.logX);
		bbox.hiX = lim(args.xlim[1], args.logX);
	}
	if (args.ylim !== undefined) {
		bbox.loY = lim(args.ylim[0], args.logY);
		bbox.hiY = lim(args.ylim[1], args.logY);
	}
	if (!Number.isFinite(bbox.loX + bbox.hiX + bbox.loY + bbox.hiY))
		die("axis limits must be positive with log scales");

	ipcMain.handle("graf:init", (e) => {
		const st = windows.get(e.sender.id);
		if (st === undefined)
			throw new Error("unknown window");
		return st.init;
	});
	ipcMain.on("graf:zoom", (e, req: ZoomRequest) => {
		const parent = BrowserWindow.fromWebContents(e.sender);
		if (parent === null)
			return;
		const [w, h] = parent.getContentSize();
		const [px, py] = parent.getPosition();
		createPlotWindow({
			datasets,
			bbox: req.bbox,
			flags: cloneFlags(req.flags),
			dflags: req.dflags.map(cloneFlags),
			hide: req.hide,
			options,
		}, w, h, px + 24, py + 24);
	});
	ipcMain.handle("graf:writeSubset", (_e, text: string) => {
		const file = path.resolve(process.cwd(), "xgraph.tmp");
		try {
			fs.writeFileSync(file, text);
			return null;
		} catch (err) {
			return `${file}: ${(err as Error).message}`;
		}
	});
	ipcMain.on("graf:close", (e) => {
		BrowserWindow.fromWebContents(e.sender)?.close();
	});
	ipcMain.on("graf:quit", () => app.quit());

	const g = args.geometry;
	const { x, y } = placement(g);
	createPlotWindow({
		datasets,
		bbox,
		flags: cloneFlags(args.flags),
		dflags: datasets.map(() => cloneFlags(args.flags)),
		hide: 0,
		options,
	}, g.width, g.height, x, y);
}

app.on("window-all-closed", () => app.quit());

app.whenReady().then(() => {
	/* No menu bar: keystrokes all go to the plot, as under X. */
	if (process.platform !== "darwin")
		Menu.setApplicationMenu(null);
	main();
});
