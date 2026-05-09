import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("flowshopyDesktop", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  getBootstrapState: () => ipcRenderer.invoke("desktop:get-bootstrap-state"),
  openDataDir: () => ipcRenderer.invoke("desktop:open-data-dir"),
  onRuntimeStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:runtime-status", handler);
    return () => ipcRenderer.removeListener("desktop:runtime-status", handler);
  },
  onBootstrapState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:bootstrap-state", handler);
    return () => ipcRenderer.removeListener("desktop:bootstrap-state", handler);
  }
});
