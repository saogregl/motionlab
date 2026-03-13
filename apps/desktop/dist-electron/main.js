import { app as o, BrowserWindow as r } from "electron";
import t from "node:path";
import { fileURLToPath as a } from "node:url";
const n = t.dirname(a(import.meta.url));
function i() {
  const e = new r({
    width: 1600,
    height: 1e3,
    minWidth: 800,
    minHeight: 600,
    title: "MotionLab",
    webPreferences: {
      preload: t.join(n, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    }
  });
  return process.env.VITE_DEV_SERVER_URL ? (e.loadURL(process.env.VITE_DEV_SERVER_URL), e.webContents.openDevTools({ mode: "bottom" })) : e.loadFile(t.join(n, "../dist-react/index.html")), e;
}
o.whenReady().then(() => {
  i(), o.on("activate", () => {
    r.getAllWindows().length === 0 && i();
  });
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && o.quit();
});
