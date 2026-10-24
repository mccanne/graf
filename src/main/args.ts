/*
 * Command line parsing.  Port of main() in main.c.
 */

import type { PlotFlags } from "../common/types";

export const DEFAULT_FONT = "bold 12px Helvetica, Arial, sans-serif";

export function defaultFlags(): PlotFlags {
	return {
		spline: false, tick: false, mark: false, bb: false,
		nolines: false, pixmarks: false, bar: false,
		rectangle: 0, errorbar: false,
	};
}

export interface Geometry {
	width: number;
	height: number;
	x?: number;		/* negative: offset from the right edge */
	y?: number;		/* negative: offset from the bottom edge */
	xNeg?: boolean;
	yNeg?: boolean;
}

export interface Args {
	flags: PlotFlags;
	bw: boolean;
	font: string;
	geometry: Geometry;
	ulaw: boolean;
	logX: boolean;
	logY: boolean;
	names: string[];
	xlim?: [number, number];
	ylim?: [number, number];
	files: string[];
}

export class UsageError extends Error {}

export const USAGE = `\
usage: graf [-f font] [-x x1,x2] [-y y1,y2] [-g geometry] [-N name]
            [-BbceMmnoprRstu] [-l x] [-l y] [ file ... ]

-b    Forces black and white (same as -M)
-B    Draw bar graph
-c    Ignored (X11 off-screen pixmap control)
-e    Draw error bars at each point
-f    Label font, as a CSS font ("bold 12px Helvetica") or an
      X11 font name (-*-helvetica-bold-r-*-*-12-*)
-g    Window geometry, e.g. 600x512 or 800x600+100+50
-l x  Logarithmic scale for X axis
-l y  Logarithmic scale for Y axis
-m    Mark each data point with large dot
-n    Don't draw lines (scatter plot)
-N    Set label (may be repeated, one per data set)
-o    Draws bounding box around data
-p    If -m, mark each point with a pixel instead
-r    Draw rectangle at each point
-R    Draw filled rectangle at each point
-s    Draw smoothed (spline) curves
-t    Draw tick marks instead of full grid
-u    Input files are mu-law encoded
-x    X axis limits
-y    Y axis limits

With no files, data is read from standard input.

Mouse:
  left drag              measure distance (dx, dy, slope)
  shift-left             identify nearest point (ctrl: just coordinates)
  middle or alt-left     measure slope
  right or cmd-left      zoom into rubber-banded region (new window)
  shift-right            write points in region to xgraph.tmp
Keys:
  g/t grid/ticks  l lines  m marks  p pixel marks  h bars  b bounding box
  s spline  r rectangles  f filled rectangles  e error bars
  0-9 toggle data set  ^L redraw  q or ^D close window  ^C quit
`;

/* Options that take an argument (from the getopt string). */
const WITH_ARG = new Set(["x", "y", "N", "d", "f", "g", "l"]);

function parseLimits(s: string): [number, number] {
	const m = s.split(",");
	if (m.length !== 2)
		throw new UsageError(`bad limits "${s}"`);
	const lo = Number(m[0]), hi = Number(m[1]);
	if (m[0].trim() === "" || m[1].trim() === "" ||
	    !Number.isFinite(lo) || !Number.isFinite(hi))
		throw new UsageError(`bad limits "${s}"`);
	return [lo, hi];
}

/* Parses an X11 geometry string: [=][WxH][{+-}X{+-}Y]. */
export function parseGeometry(s: string): Geometry {
	const m = /^=?(?:(\d+)[xX](\d+))?(?:([+-])(\d+)([+-])(\d+))?$/.exec(s);
	if (m === null)
		throw new UsageError(`bad geometry "${s}"`);
	const MINDIM = 100;
	const g: Geometry = {
		width: Math.max(MINDIM, m[1] ? parseInt(m[1], 10) : 600),
		height: Math.max(MINDIM, m[2] ? parseInt(m[2], 10) : 512),
	};
	if (m[3] !== undefined) {
		g.x = parseInt(m[4], 10);
		g.xNeg = m[3] === "-";
		g.y = parseInt(m[6], 10);
		g.yNeg = m[5] === "-";
	}
	return g;
}

/*
 * Accepts either a CSS font or an X11 logical font description like
 * "-*-helvetica-bold-r-*-*-12-*" and returns a CSS font string.
 */
export function cssFont(s: string): string {
	if (!s.startsWith("-"))
		return s;
	const f = s.split("-");
	/* f[0] is "", then foundry, family, weight, slant, setwidth,
	   addstyle, pixelsize, ... */
	const family = f[2] && f[2] !== "*" ? f[2] : "Helvetica";
	const weight = f[3] && f[3] !== "*" ? f[3] : "normal";
	const slant = f[4] === "i" ? "italic " : f[4] === "o" ? "oblique " : "";
	const px = f[7] && /^\d+$/.test(f[7]) ? f[7] : "12";
	const generic = /courier|fixed|mono|lucidatypewriter/i.test(family) ?
	    "monospace" : "sans-serif";
	return `${slant}${weight} ${px}px "${family}", ${generic}`;
}

export function parseArgs(argv: string[]): Args {
	const a: Args = {
		flags: defaultFlags(),
		bw: false,
		font: DEFAULT_FONT,
		geometry: { width: 600, height: 512 },
		ulaw: false,
		logX: false,
		logY: false,
		names: [],
		files: [],
	};
	let i = 0;
	for (; i < argv.length; ++i) {
		const arg = argv[i];
		if (arg === "--") {
			++i;
			break;
		}
		/* Skip Chromium/Electron switches like --no-sandbox. */
		if (arg.startsWith("--"))
			continue;
		if (!arg.startsWith("-") || arg === "-") {
			a.files.push(arg);
			continue;
		}
		for (let k = 1; k < arg.length; ++k) {
			const op = arg[k];
			let optarg = "";
			if (WITH_ARG.has(op)) {
				if (k + 1 < arg.length)
					optarg = arg.slice(k + 1);
				else if (i + 1 < argv.length)
					optarg = argv[++i];
				else
					throw new UsageError(
					    `option -${op} requires an argument`);
				k = arg.length;
			}
			switch (op) {
			case "c": break;
			case "e": a.flags.errorbar = true; break;
			case "r": a.flags.rectangle = 1; break;
			case "R": a.flags.rectangle = 2; break;
			case "s": a.flags.spline = true; break;
			case "t": a.flags.tick = true; break;
			case "m": a.flags.mark = true; break;
			case "b":
			case "M": a.bw = true; break;
			case "n": a.flags.nolines = true; break;
			case "N": a.names.push(optarg); break;
			case "o": a.flags.bb = true; break;
			case "B": a.flags.bar = true; break;
			case "p": a.flags.pixmarks = true; break;
			case "d": break;
			case "f": a.font = cssFont(optarg); break;
			case "g": a.geometry = parseGeometry(optarg); break;
			case "u": a.ulaw = true; break;
			case "l":
				if (optarg === "x")
					a.logX = true;
				else if (optarg === "y")
					a.logY = true;
				else
					throw new UsageError(
					    `-l takes "x" or "y"`);
				break;
			case "x": a.xlim = parseLimits(optarg); break;
			case "y": a.ylim = parseLimits(optarg); break;
			case "v":
			case "h":
				throw new UsageError("");
			default:
				throw new UsageError(`unknown option -${op}`);
			}
		}
	}
	for (; i < argv.length; ++i)
		a.files.push(argv[i]);
	return a;
}
