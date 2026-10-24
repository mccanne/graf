/*
 * Types shared by the main and renderer processes.
 *
 * This file must only ever be imported with `import type`: it is compiled
 * by both the CommonJS (main) and ES module (renderer) builds and has no
 * runtime content.
 *
 * Ported from flags.h / dataset.h of the LBL graph tool, which was derived
 * from the original X10 xgraph by David Harrison (UC Berkeley, 1986, 1987)
 * and extended by Van Jacobson and Steven McCanne (UCB/LBL).
 */

/* Per-dataset (and per-window) drawing attributes (struct plotflags). */
export interface PlotFlags {
	spline: boolean;	/* Draw lines with spline */
	tick: boolean;		/* Don't draw full grid (window-level) */
	mark: boolean;		/* Draw marks at points */
	bb: boolean;		/* Draw bounding box (window-level) */
	nolines: boolean;	/* Don't draw lines */
	pixmarks: boolean;	/* Draw pixel markers */
	bar: boolean;		/* Draw bar graph */
	rectangle: 0 | 1 | 2;	/* 1 = outline rectangles, 2 = filled */
	errorbar: boolean;	/* Draw error bars */
}

export interface BBox {
	loX: number;
	loY: number;
	hiX: number;
	hiY: number;
}

/* One data set (struct data_set).  Values are stored column-wise. */
export interface DataSet {
	setno: number;		/* set id number */
	name: string;		/* name of set */
	x: Float64Array;
	y: Float64Array;
	w: Float64Array;
	h: Float64Array;
	bb: BBox;		/* bounding box around data set */
}

/* Settings that are global to the program (were C globals). */
export interface GlobalOptions {
	bw: boolean;		/* black & white mode */
	font: string;		/* CSS font for labels */
	precision: number;	/* %g precision for identify/slope/distance */
	logX: boolean;
	logY: boolean;
}

/* Everything a plot window needs to draw itself. */
export interface WindowInit {
	datasets: DataSet[];
	bbox: BBox;		/* region to display, before padding */
	flags: PlotFlags;	/* window flags (tick, bb) */
	dflags: PlotFlags[];	/* per-dataset flags, indexed by setno */
	hide: number;		/* bit n set = dataset n hidden */
	options: GlobalOptions;
}

/* Request from a window to open a zoomed child window. */
export interface ZoomRequest {
	bbox: BBox;
	flags: PlotFlags;
	dflags: PlotFlags[];
	hide: number;
}

/* The API exposed to the renderer by the preload script. */
export interface GrafAPI {
	init(): Promise<WindowInit>;
	zoom(req: ZoomRequest): void;
	writeSubset(text: string): Promise<string | null>;
	close(): void;
	quit(): void;
}
