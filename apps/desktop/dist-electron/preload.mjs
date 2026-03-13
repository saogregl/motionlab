"use strict";const e=require("electron");e.contextBridge.exposeInMainWorld("motionlab",{platform:process.platform,getEngineEndpoint:async()=>null});
