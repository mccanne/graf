/*
 * A plot window.  Port of draw.c and the event handling in xwin.c.
 *
 * The plot is drawn on one canvas.  Transient feedback (rubber bands,
 * slope lines, identify labels) is drawn on a transparent overlay canvas
 * on top of it, which replaces the XOR GC and save-under pixmaps that the
 * X11 version used.
 */

import type { BBox, DataSet, GlobalOptions, GrafAPI, PlotFlags,
    WindowInit } from "../common/types";
import { formatG, nlog10, roundUp, writeValue } from "./format.js";
import { fillMark, markFor, MARK_CX, MARK_CY, MARK_H, MARK_W }
    from "./marks.js";

const SPACE = 10;
const TICKLENGTH = 5;
const PADDING = 2;

const FG = "#000000";
const BG = "#d3d3d3";		/* X11 LightGray */
const BW_BG = "#ffffff";

/* Default color names, by set number. */
const COLORS = [
	"red", "black", "blue", "yellow",
	"cyan", "plum", "orange", "coral", "white",
];

/* Dash patterns for black & white mode, by set number. */
const DASHES: number[][] = [
	[], [1, 1], [4, 1], [2, 2], [3, 1], [1, 3], [4, 2], [4, 4], [4, 7],
];

type Mode = "identify" | "distance" | "slope" | "zoom" | "subset";

interface Drag {
	mode: Mode;
	button: number;
	pointerId: number;
	sx: number;
	sy: number;
	cx: number;
	cy: number;
	noPoints: boolean;
	moved: boolean;
}

interface Hit {
	set: DataSet;
	pt: number;
}

export class Plot {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly octx: CanvasRenderingContext2D;
	private readonly datasets: DataSet[];
	private readonly opts: GlobalOptions;
	private readonly flags: PlotFlags;
	private readonly dflags: PlotFlags[];
	private hide: number;
	private readonly bg: string;

	/* Current size of window, in CSS pixels */
	private width = 0;
	private height = 0;

	/* Local bounding box of window */
	private loX: number;
	private loY: number;
	private hiX: number;
	private hiY: number;

	/* Transform, set by transformCompute() */
	private ok = false;
	private XOrgX = 0;	/* Origin of bounding box on screen */
	private XOrgY = 0;
	private XOppX = 0;	/* Other point defining bounding box */
	private XOppY = 0;
	private UsrOrgX = 0;	/* bounding box origin in user space */
	private UsrOrgY = 0;
	private UsrOppX = 0;	/* Other point of bounding box */
	private UsrOppY = 0;
	private XUnitsPerPixel = 1;
	private YUnitsPerPixel = 1;

	private ascent = 0;
	private descent = 0;

	private drag: Drag | null = null;
	private pending = false;

	constructor(private readonly base: HTMLCanvasElement,
	    private readonly overlay: HTMLCanvasElement,
	    init: WindowInit, private readonly api: GrafAPI) {
		this.ctx = base.getContext("2d")!;
		this.octx = overlay.getContext("2d")!;
		this.datasets = init.datasets;
		this.opts = init.options;
		this.flags = init.flags;
		this.dflags = init.dflags;
		this.hide = init.hide;
		this.bg = this.opts.bw ? BW_BG : BG;
		document.body.style.background = this.bg;

		/* NewWindow(): pad the bounding box */
		let { loX, loY, hiX, hiY } = init.bbox;
		let pad: number;
		if (hiX - loX === 0) {
			pad = Math.max(0.5, Math.abs(hiX / 2));
			hiX += pad;
			loX -= pad;
		}
		if (hiY - loY === 0) {
			pad = Math.max(0.5, Math.abs(hiY / 2));
			hiY += pad;
			loY -= pad;
		}
		/* Add 10% padding to bounding box (div by 20 yields 5%) */
		pad = (hiX - loX) / 20;
		loX -= pad;
		hiX += pad;
		pad = (hiY - loY) / 20;
		loY -= pad;
		hiY += pad;
		this.loX = loX;
		this.loY = loY;
		this.hiX = hiX;
		this.hiY = hiY;

		overlay.addEventListener("pointerdown", (e) => this.onDown(e));
		overlay.addEventListener("pointermove", (e) => this.onMove(e));
		overlay.addEventListener("pointerup", (e) => this.onUp(e));
		overlay.addEventListener("pointercancel", () => this.cancel());
		overlay.addEventListener("contextmenu",
		    (e) => e.preventDefault());
		window.addEventListener("keydown", (e) => this.onKey(e));
		window.addEventListener("resize", () => this.schedule());
		this.resize();
	}

	/*
	 * Geometry
	 */

	private schedule() {
		if (this.pending)
			return;
		this.pending = true;
		requestAnimationFrame(() => {
			this.pending = false;
			this.resize();
		});
	}

	private resize() {
		const dpr = window.devicePixelRatio || 1;
		this.width = Math.floor(window.innerWidth);
		this.height = Math.floor(window.innerHeight);
		for (const [c, ctx] of [[this.base, this.ctx],
		    [this.overlay, this.octx]] as const) {
			c.width = Math.round(this.width * dpr);
			c.height = Math.round(this.height * dpr);
			c.style.width = `${this.width}px`;
			c.style.height = `${this.height}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.font = this.opts.font;
			ctx.textBaseline = "alphabetic";
			ctx.lineWidth = 1;
		}
		const m = this.ctx.measureText("0123456789.-Mgy");
		this.ascent = Math.ceil(m.fontBoundingBoxAscent ??
		    m.actualBoundingBoxAscent);
		this.descent = Math.ceil(m.fontBoundingBoxDescent ??
		    m.actualBoundingBoxDescent);
		this.redraw();
	}

	private textWidth(s: string): number {
		return Math.ceil(this.ctx.measureText(s).width);
	}

	private get fontHeight(): number {
		return this.ascent + this.descent;
	}

	private screenX(x: number): number {
		return this.XOrgX +
		    Math.floor((x - this.UsrOrgX) / this.XUnitsPerPixel + 0.5);
	}

	private screenY(y: number): number {
		return this.XOppY -
		    Math.floor((y - this.UsrOrgY) / this.YUnitsPerPixel + 0.5);
	}

	private screenXS(x: number): number {
		return Math.floor(x / this.XUnitsPerPixel + 0.5);
	}

	private screenYS(y: number): number {
		return Math.floor(y / this.YUnitsPerPixel + 0.5);
	}

	private tranX(x: number): number {
		return (x - this.XOrgX) * this.XUnitsPerPixel + this.UsrOrgX;
	}

	private tranY(y: number): number {
		return this.UsrOppY - (y - this.XOrgY) * this.YUnitsPerPixel;
	}

	/*
	 * Figures out the transformation from user space to the window,
	 * leaving room for axis labels and the legend (TransformCompute).
	 */
	private transformCompute(): boolean {
		const maxwid = this.textWidth("0000.00") + PADDING;
		const height = this.fontHeight + PADDING;
		this.XOrgX = maxwid;
		this.XOrgY = 0;

		let maxName = 0;
		for (const p of this.datasets)
			maxName = Math.max(maxName, this.textWidth(p.name));
		this.XOppX = this.width - maxName - PADDING - MARK_W;
		this.XOppY = this.height - height - PADDING - MARK_W;
		if (this.XOrgX >= this.XOppX || this.XOrgY >= this.XOppY)
			return false;

		this.XUnitsPerPixel = (this.hiX - this.loX) /
		    (this.XOppX - this.XOrgX);
		this.YUnitsPerPixel = (this.hiY - this.loY) /
		    (this.XOppY - this.XOrgY);
		if (!(this.XUnitsPerPixel > 0) || !(this.YUnitsPerPixel > 0))
			return false;

		/* Keep the center of the bounding box in the same place. */
		const cenX = (this.loX + this.hiX) / 2;
		const cenY = (this.loY + this.hiY) / 2;
		const halfW = (this.XOppX - this.XOrgX) / 2 *
		    this.XUnitsPerPixel;
		const halfH = (this.XOppY - this.XOrgY) / 2 *
		    this.YUnitsPerPixel;
		this.UsrOrgX = cenX - halfW;
		this.UsrOrgY = cenY - halfH;
		this.UsrOppX = cenX + halfW;
		this.UsrOppY = cenY + halfH;
		return true;
	}

	/*
	 * Drawing
	 */

	private hidden(setno: number): boolean {
		return (this.hide & (1 << (setno & 31))) !== 0;
	}

	private color(setno: number): string {
		return this.opts.bw ? FG : COLORS[setno % COLORS.length];
	}

	private dash(setno: number): number[] {
		return this.opts.bw ? DASHES[setno % DASHES.length] : [];
	}

	private line(ctx: CanvasRenderingContext2D, x0: number, y0: number,
	    x1: number, y1: number) {
		ctx.moveTo(x0 + 0.5, y0 + 0.5);
		ctx.lineTo(x1 + 0.5, y1 + 0.5);
	}

	redraw() {
		const ctx = this.ctx;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = this.bg;
		ctx.fillRect(0, 0, this.base.width, this.base.height);
		ctx.restore();
		this.clearOverlay();
		this.ok = this.transformCompute();
		if (!this.ok)
			return;
		this.drawLegend();
		this.drawGridAndAxis();
		this.drawData();
	}

	/*
	 * Draws grid line labels in engineering notation, the grid lines
	 * themselves, and unit labels on the axes.
	 */
	private drawGridAndAxis() {
		const ctx = this.ctx;
		ctx.fillStyle = FG;
		ctx.strokeStyle = FG;
		ctx.setLineDash([]);

		/*
		 * Grid display powers are computed by taking the log of the
		 * largest numbers and rounding down to a multiple of 3.
		 */
		let larger = Math.max(Math.abs(this.UsrOrgX),
		    Math.abs(this.UsrOppX));
		const expX = Math.floor(nlog10(larger) / 3) * 3;
		larger = Math.max(Math.abs(this.UsrOrgY),
		    Math.abs(this.UsrOppY));
		const expY = Math.floor(nlog10(larger) / 3) * 3;

		const height = this.fontHeight;
		let w = this.textWidth("0000.00");
		if (expY !== 0 || this.opts.logY) {
			const power = this.opts.logY ? " x 10^y" :
			    ` x 10^${expY}`;
			ctx.fillText(power, w, height);
		}
		if (expX !== 0 || this.opts.logX) {
			const power = this.opts.logX ? " x 10^x" :
			    ` x 10^${expX}`;
			ctx.fillText(power, this.width - this.textWidth(power),
			    this.height - height);
		}

		ctx.beginPath();
		const yIncr = roundUp((SPACE + height) * this.YUnitsPerPixel);
		const yStart = (Math.floor(this.UsrOrgY / yIncr) + 1) * yIncr;
		for (let i = 0; i < 10000; ++i) {
			const yv = yStart + i * yIncr;
			if (!(yv < this.UsrOppY))
				break;
			const y = this.screenY(yv);
			ctx.fillText(writeValue(yv, expY), 0,
			    y + Math.trunc(this.ascent / 2));
			if (this.flags.tick) {
				this.line(ctx, this.XOrgX, y,
				    this.XOrgX + TICKLENGTH, y);
				this.line(ctx, this.XOppX - TICKLENGTH, y,
				    this.XOppX, y);
			} else
				this.line(ctx, this.XOrgX, y, this.XOppX, y);
		}

		const xIncr = roundUp((SPACE + w) * this.XUnitsPerPixel);
		const xStart = (Math.floor(this.UsrOrgX / xIncr) + 1) * xIncr;
		w = Math.trunc(w / 2);
		const ly = this.height - PADDING;
		for (let i = 0; i < 10000; ++i) {
			const xv = xStart + i * xIncr;
			if (!(xv < this.UsrOppX))
				break;
			const x = this.screenX(xv);
			ctx.fillText(writeValue(xv, expX), x - w, ly);
			if (this.flags.tick) {
				this.line(ctx, x, this.XOrgY,
				    x, this.XOrgY + TICKLENGTH);
				this.line(ctx, x, this.XOppY - TICKLENGTH,
				    x, this.XOppY);
			} else
				this.line(ctx, x, this.XOrgY, x, this.XOppY);
		}
		if (this.flags.bb) {
			ctx.rect(this.XOrgX + 0.5, this.XOrgY + 0.5,
			    this.XOppX - this.XOrgX, this.XOppY - this.XOrgY);
		}
		ctx.stroke();
	}

	private drawData() {
		const ctx = this.ctx;
		ctx.save();
		ctx.beginPath();
		ctx.rect(this.XOrgX, this.XOrgY,
		    this.XOppX - this.XOrgX + 1, this.XOppY - this.XOrgY + 1);
		ctx.clip();
		for (const p of this.datasets)
			if (!this.hidden(p.setno))
				this.drawSet(p);
		ctx.restore();
	}

	private drawSet(p: DataSet) {
		const ctx = this.ctx;
		const f = this.dflags[p.setno];
		const n = p.x.length;
		const { loX, loY, hiX, hiY } = this;
		const color = this.color(p.setno);
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.setLineDash(this.dash(p.setno));

		/* Marks, at points that are within the window */
		if (f.mark && !f.pixmarks) {
			const m = markFor(p.setno);
			for (let i = 0; i < n; ++i) {
				const x = p.x[i], y = p.y[i];
				if (x < loX || x > hiX || y < loY || y > hiY)
					continue;
				fillMark(ctx, m, this.screenX(x) - MARK_CX,
				    this.screenY(y) - MARK_CY);
			}
		}

		/* Bars, error bars and rectangles; culled on x only */
		if (f.bar || f.errorbar || f.rectangle) {
			const y0 = this.screenY(0);
			const rects = new Path2D();
			ctx.beginPath();
			for (let i = 0; i < n; ++i) {
				const x = p.x[i], w = p.w[i];
				if (x + w < loX || x - w > hiX)
					continue;
				const y = p.y[i], h = p.h[i];
				const sx = this.screenX(x);
				const sy = this.screenY(y);
				if (f.bar)
					this.line(ctx, sx, y0, sx, sy);
				if (f.errorbar) {
					this.line(ctx,
					    this.screenX(x - w / 2), sy,
					    this.screenX(x + w / 2), sy);
					this.line(ctx,
					    sx, this.screenY(y - h / 2),
					    sx, this.screenY(y + h / 2));
				}
				if (f.rectangle) {
					const rw = this.screenXS(w);
					const rh = this.screenYS(h);
					rects.rect(sx + 0.5, sy - rh + 0.5,
					    rw, rh);
				}
			}
			ctx.stroke();
			if (f.rectangle > 1)
				ctx.fill(rects);
			if (f.rectangle)
				ctx.stroke(rects);
		}

		if (!f.nolines)
			this.drawLines(p, f.spline);
		else if (f.mark && f.pixmarks) {
			for (let i = 0; i < n; ++i)
				ctx.fillRect(this.screenX(p.x[i]),
				    this.screenY(p.y[i]), 1, 1);
		}
	}

	/*
	 * Draws the connecting lines, skipping segments that can't be
	 * visible.  Runs of visible segments are drawn as polylines or,
	 * with the spline flag, as smoothed curves through the points.
	 */
	private drawLines(p: DataSet, spline: boolean) {
		const ctx = this.ctx;
		const n = p.x.length;
		const { loX, loY, hiX, hiY } = this;
		let run: number[] = [];

		ctx.beginPath();
		const flush = () => {
			if (run.length >= 4)
				this.tracePath(run, spline);
			run = [];
		};
		for (let i = 0; i + 1 < n; ++i) {
			const xa = p.x[i], ya = p.y[i];
			const xb = p.x[i + 1], yb = p.y[i + 1];
			const visible = !(Math.max(xa, xb) < loX ||
			    Math.min(xa, xb) > hiX ||
			    Math.max(ya, yb) < loY || Math.min(ya, yb) > hiY);
			if (!visible) {
				flush();
				continue;
			}
			if (run.length === 0)
				run.push(this.screenX(xa) + 0.5,
				    this.screenY(ya) + 0.5);
			run.push(this.screenX(xb) + 0.5,
			    this.screenY(yb) + 0.5);
		}
		flush();
		ctx.stroke();
	}

	/* pts is a flat [x0, y0, x1, y1, ...] list. */
	private tracePath(pts: number[], spline: boolean) {
		const ctx = this.ctx;
		const k = pts.length / 2;
		ctx.moveTo(pts[0], pts[1]);
		if (!spline || k < 3) {
			for (let j = 1; j < k; ++j)
				ctx.lineTo(pts[2 * j], pts[2 * j + 1]);
			return;
		}
		/* quadratic curves through midpoints, using points as
		   control points */
		for (let j = 1; j < k - 1; ++j) {
			const mx = (pts[2 * j] + pts[2 * j + 2]) / 2;
			const my = (pts[2 * j + 1] + pts[2 * j + 3]) / 2;
			ctx.quadraticCurveTo(pts[2 * j], pts[2 * j + 1], mx, my);
		}
		ctx.lineTo(pts[2 * k - 2], pts[2 * k - 1]);
	}

	/* Draws a legend of the data sets to the right of the plot. */
	private drawLegend() {
		const ctx = this.ctx;
		const height = this.fontHeight;
		const x0 = this.XOppX + PADDING + MARK_W;
		let spot = this.XOrgY + height + PADDING;
		let maxstr = "";

		ctx.setLineDash([]);
		for (const p of this.datasets) {
			if (p.name.length > maxstr.length)
				maxstr = p.name;
			ctx.fillStyle = FG;
			ctx.fillText(p.name, x0, spot + 2);
			ctx.fillStyle = this.color(p.setno);
			fillMark(ctx, markFor(p.setno), x0 - MARK_W,
			    spot - MARK_H);
			spot += 2 * height + PADDING;
		}

		/* second pass draws the lines over the text */
		spot = this.XOrgY + PADDING;
		const x1 = x0 + this.textWidth(maxstr) + PADDING;
		for (const p of this.datasets) {
			ctx.beginPath();
			ctx.strokeStyle = this.color(p.setno);
			ctx.setLineDash(this.dash(p.setno));
			this.line(ctx, x0, spot, x1, spot);
			ctx.stroke();
			spot += 2 * height + PADDING;
		}
		ctx.setLineDash([]);
	}

	/*
	 * Mouse interaction
	 */

	private clearOverlay() {
		const c = this.overlay;
		this.octx.save();
		this.octx.setTransform(1, 0, 0, 1, 0, 0);
		this.octx.clearRect(0, 0, c.width, c.height);
		this.octx.restore();
	}

	/* Text on a background-filled box (XDrawImageString). */
	private imageString(s: string, x: number, y: number) {
		const ctx = this.octx;
		ctx.fillStyle = this.bg;
		ctx.fillRect(x, y, this.textWidth(s), this.fontHeight);
		ctx.fillStyle = FG;
		ctx.fillText(s, x, y + this.ascent);
	}

	private closestPoint(ux: number, uy: number): Hit | null {
		const xthresh = 8 * this.XUnitsPerPixel;
		const ythresh = 8 * this.YUnitsPerPixel;
		let mdist = 4 * (xthresh * xthresh + ythresh * ythresh);
		let hit: Hit | null = null;

		for (const p of this.datasets) {
			if (this.hidden(p.setno))
				continue;
			for (let i = 0; i < p.x.length; ++i) {
				const dx = p.x[i] - ux, dy = p.y[i] - uy;
				if (Math.abs(dx) < xthresh &&
				    Math.abs(dy) < ythresh) {
					const d = dx * dx + dy * dy;
					if (d < mdist) {
						mdist = d;
						hit = { set: p, pt: i };
					}
				}
			}
		}
		return hit;
	}

	private identifyLabel(ux: number, uy: number,
	    noPoints: boolean): string {
		const prec = this.opts.precision;
		const hit = noPoints ? null : this.closestPoint(ux, uy);
		if (hit === null)
			return `(${formatG(ux, prec)}, ${formatG(uy, prec)})`;
		const x = formatG(hit.set.x[hit.pt], prec);
		const y = formatG(hit.set.y[hit.pt], prec);
		if (this.datasets.length > 1)
			return `${hit.set.setno}-${hit.pt}: (${x}, ${y})`;
		return `${hit.pt}: (${x}, ${y})`;
	}

	private slopeLabel(dx: number, dy: number): string {
		const sxy = this.YUnitsPerPixel / this.XUnitsPerPixel;
		return dx !== 0 ?
		    formatG(dy / dx * sxy, this.opts.precision) : "-inf-";
	}

	private onDown(e: PointerEvent) {
		if (this.drag !== null || !this.ok)
			return;
		let mode: Mode;
		let noPoints = false;
		if (e.button === 0) {
			if (e.metaKey)
				mode = e.shiftKey ? "subset" : "zoom";
			else if (e.altKey)
				mode = "slope";
			else if (e.shiftKey) {
				mode = "identify";
				noPoints = e.ctrlKey;
			} else
				mode = "distance";
		} else if (e.button === 1)
			mode = "slope";
		else if (e.button === 2)
			mode = e.shiftKey ? "subset" : "zoom";
		else
			return;

		e.preventDefault();
		this.overlay.setPointerCapture(e.pointerId);
		const x = Math.floor(e.offsetX), y = Math.floor(e.offsetY);
		this.drag = {
			mode, button: e.button, pointerId: e.pointerId,
			sx: x, sy: y, cx: x, cy: y, noPoints, moved: false,
		};
		this.update();
	}

	private onMove(e: PointerEvent) {
		const d = this.drag;
		if (d === null || e.pointerId !== d.pointerId)
			return;
		d.cx = Math.floor(e.offsetX);
		d.cy = Math.floor(e.offsetY);
		d.moved = true;
		this.update();
	}

	private onUp(e: PointerEvent) {
		const d = this.drag;
		if (d === null || e.pointerId !== d.pointerId ||
		    e.button !== d.button)
			return;
		this.drag = null;
		this.clearOverlay();
		if (d.mode === "zoom" || d.mode === "subset") {
			const b = this.rubberBox(d);
			if (b === null)
				return;
			if (d.mode === "zoom")
				this.api.zoom({
					bbox: b, flags: this.flags,
					dflags: this.dflags, hide: this.hide,
				});
			else
				this.writeSubset(b);
		}
	}

	private cancel() {
		this.drag = null;
		this.clearOverlay();
	}

	/* Redraws the overlay for the drag in progress. */
	private update() {
		const d = this.drag!;
		const ctx = this.octx;
		this.clearOverlay();
		ctx.strokeStyle = FG;
		ctx.setLineDash([]);
		ctx.beginPath();
		switch (d.mode) {
		case "identify":
			this.updateIdentify(d);
			break;
		case "slope":
			this.updateSlope(d);
			break;
		case "distance":
			this.updateDistance(d);
			break;
		case "zoom":
		case "subset":
			ctx.rect(Math.min(d.sx, d.cx) + 0.5,
			    Math.min(d.sy, d.cy) + 0.5,
			    Math.abs(d.cx - d.sx), Math.abs(d.cy - d.sy));
			break;
		}
		ctx.stroke();
	}

	/* Label centered below the cursor, until the button is released. */
	private updateIdentify(d: Drag) {
		const s = this.identifyLabel(this.tranX(d.sx), this.tranY(d.sy),
		    d.noPoints);
		this.imageString(s, d.sx - Math.trunc(this.textWidth(s) / 2),
		    d.sy + Math.trunc(this.fontHeight / 2));
	}

	private updateSlope(d: Drag) {
		const { sx, sy, cx, cy } = d;
		this.line(this.octx, sx, sy, cx, cy);
		if (Math.abs(cx - sx) < 16 && Math.abs(cy - sy) < 16)
			return;
		const s = this.slopeLabel(cx - sx, sy - cy);
		this.imageString(s, cx - Math.trunc(this.textWidth(s) / 2),
		    cy + Math.trunc(this.fontHeight / 2));
	}

	/*
	 * Draws a right triangle from the start point to the cursor and
	 * labels its legs with dx and dy (and the number of points between
	 * the ends, if both are on the same data set) and its hypotenuse
	 * with the slope.  Before the first motion, identifies the point
	 * under the cursor.
	 */
	private updateDistance(d: Drag) {
		const ctx = this.octx;
		const { sx, sy, cx, cy } = d;
		const prec = this.opts.precision;
		const h = this.fontHeight;

		if (!d.moved) {
			this.updateIdentify(d);
			return;
		}
		this.line(ctx, sx, sy, cx, sy);
		this.line(ctx, cx, sy, cx, cy);
		this.line(ctx, cx, cy, sx, sy);

		if (Math.abs(cx - sx) >= 16) {
			const h1 = this.closestPoint(this.tranX(sx),
			    this.tranY(sy));
			const h2 = this.closestPoint(this.tranX(cx),
			    this.tranY(cy));
			const npts = h1 !== null && h2 !== null &&
			    h1.set === h2.set ? String(h2.pt - h1.pt) : "";
			const s = formatG((cx - sx) * this.XUnitsPerPixel, prec);
			const w = Math.max(this.textWidth(s),
			    npts ? this.textWidth(npts) : 0);
			const lx = Math.trunc((sx + cx - w) / 2);
			const ly = sy + Math.trunc(h / 2);
			this.imageString(s, lx, ly);
			if (npts)
				this.imageString(npts, lx, ly + h);
		}
		if (Math.abs(cy - sy) >= 16) {
			const s = formatG((sy - cy) * this.YUnitsPerPixel, prec);
			const w = this.textWidth(s);
			const lx = sx < cx ? cx + 8 : cx - w;
			this.imageString(s, lx, Math.trunc((sy + cy - h) / 2));
		}
		if (Math.abs(cx - sx) >= 16 && Math.abs(cy - sy) >= 16) {
			const s = this.slopeLabel(cx - sx, sy - cy);
			const w = this.textWidth(s);
			const mid = Math.trunc((sx + cx) / 2);
			const lx = sx < cx ? mid - w : mid + 8;
			this.imageString(s, lx, Math.trunc((sy + cy - h) / 2));
		}
	}

	private rubberBox(d: Drag): BBox | null {
		if (d.sx === d.cx || d.sy === d.cy)
			return null;
		let loX = this.tranX(d.sx), hiX = this.tranX(d.cx);
		let loY = this.tranY(d.sy), hiY = this.tranY(d.cy);
		if (loX > hiX)
			[loX, hiX] = [hiX, loX];
		if (loY > hiY)
			[loY, hiY] = [hiY, loY];
		return { loX, loY, hiX, hiY };
	}

	/* Writes the points in the box, from all sets, to xgraph.tmp. */
	private async writeSubset(b: BBox) {
		let out = "";
		for (const p of this.datasets) {
			let first = true;
			for (let i = 0; i < p.x.length; ++i) {
				const x = p.x[i], y = p.y[i];
				if (b.loX <= x && x <= b.hiX &&
				    b.loY <= y && y <= b.hiY) {
					if (first && out !== "")
						out += "\n";
					first = false;
					out += `${formatG(x, 6)}\t` +
					    `${formatG(y, 6)}\n`;
				}
			}
		}
		const err = await this.api.writeSubset(out);
		if (err !== null)
			window.alert(err);
	}

	/*
	 * Keyboard commands (DoKeyPress)
	 */

	/* Flags of the first visible set, which the toggles act on. */
	private getDflags(): PlotFlags {
		for (const p of this.datasets)
			if (!this.hidden(p.setno))
				return { ...this.dflags[p.setno] };
		return { ...this.dflags[0] };
	}

	private setDflags(f: PlotFlags) {
		for (const p of this.datasets)
			if (!this.hidden(p.setno))
				this.dflags[p.setno] = { ...f };
	}

	private onKey(e: KeyboardEvent) {
		const k = e.key;
		if (e.ctrlKey && !e.metaKey && !e.altKey) {
			switch (k.toLowerCase()) {
			case "c":
				this.api.quit();
				break;
			case "d":
				this.api.close();
				break;
			case "l":
				this.redraw();
				break;
			default:
				return;
			}
			e.preventDefault();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey)
			return;

		const f = this.getDflags();
		switch (k) {
		case "q":
		case "Q":
			this.api.close();
			return;
		case "g": case "G":
		case "t": case "T":
			this.flags.tick = !this.flags.tick;
			break;
		case "b": case "B":
			this.flags.bb = !this.flags.bb;
			break;
		case "l": case "L":
			f.nolines = !f.nolines;
			this.setDflags(f);
			break;
		case "m": case "M":
			f.mark = !f.mark;
			this.setDflags(f);
			break;
		case "p": case "P":
			f.pixmarks = !f.pixmarks;
			this.setDflags(f);
			break;
		case "h": case "H":
			f.bar = !f.bar;
			this.setDflags(f);
			break;
		case "s": case "S":
			f.spline = !f.spline;
			this.setDflags(f);
			break;
		case "r": case "R":
			f.rectangle = f.rectangle ? 0 : 1;
			this.setDflags(f);
			break;
		case "f": case "F":
			f.rectangle = f.rectangle === 2 ? 0 : 2;
			this.setDflags(f);
			break;
		case "e": case "E":
			f.errorbar = !f.errorbar;
			this.setDflags(f);
			break;
		default:
			if (k.length === 1 && k >= "0" && k <= "9") {
				this.hide ^= 1 << Number(k);
				break;
			}
			return;
		}
		e.preventDefault();
		this.redraw();
	}
}
