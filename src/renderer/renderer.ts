/*
 * Renderer entry point: fetches this window's data from the main process
 * and starts a plot.
 */

import type { GrafAPI } from "../common/types";
import { Plot } from "./plot.js";

declare global {
	interface Window {
		graf: GrafAPI;
	}
}

async function start() {
	const init = await window.graf.init();
	const base = document.getElementById("plot") as HTMLCanvasElement;
	const overlay = document.getElementById("overlay") as HTMLCanvasElement;
	new Plot(base, overlay, init, window.graf);
}

start().catch((e) => console.error(e));
