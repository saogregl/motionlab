import { BrowserWindow as e, app as t } from "electron";
import n from "node:path";
import { fileURLToPath as r } from "node:url";
//#region src/main.ts
var i = n.dirname(r(import.meta.url));
function a() {
	let t = new e({
		width: 1600,
		height: 1e3,
		minWidth: 800,
		minHeight: 600,
		title: "MotionLab",
		webPreferences: {
			preload: n.join(i, "preload.js"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !0
		}
	});
	return process.env.VITE_DEV_SERVER_URL ? (t.loadURL(process.env.VITE_DEV_SERVER_URL), t.webContents.openDevTools({ mode: "bottom" })) : t.loadFile(n.join(i, "../dist-react/index.html")), t;
}
t.whenReady().then(() => {
	a(), t.on("activate", () => {
		e.getAllWindows().length === 0 && a();
	});
}), t.on("window-all-closed", () => {
	process.platform !== "darwin" && t.quit();
});
//#endregion
