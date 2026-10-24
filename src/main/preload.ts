/*
 * Preload script: exposes a narrow API to the (sandboxed) renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

import type { GrafAPI, ZoomRequest } from "../common/types";

const api: GrafAPI = {
	init: () => ipcRenderer.invoke("graf:init"),
	zoom: (req: ZoomRequest) => ipcRenderer.send("graf:zoom", req),
	writeSubset: (text: string) =>
	    ipcRenderer.invoke("graf:writeSubset", text),
	close: () => ipcRenderer.send("graf:close"),
	quit: () => ipcRenderer.send("graf:quit"),
};

contextBridge.exposeInMainWorld("graf", api);
