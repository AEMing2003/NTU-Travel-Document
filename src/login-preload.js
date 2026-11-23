'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopLogin', Object.freeze({
  submit: (raw) => ipcRenderer.send('desktop:magic-link-submit', String(raw).slice(0, 32768)),
  cancel: () => ipcRenderer.send('desktop:magic-link-cancel'),
  onResult: (callback) => ipcRenderer.on('desktop:magic-link-feedback', (_event, result) => callback(result)),
}));
