/**
 * Preload スクリプト - IPC境界の定義
 * 
 * 責務: レンダラプロセスへ安全なAPI公開（contextBridge経由）
 * セキュリティ設計: メインプロセスの機能を限定的に公開し、レンダラの権限を最小化
 * 
 * 公開API:
 * - saveSchedule: スケジュール保存（現状はメモリ内処理のみ、将来的にファイル/DB保存拡張可）
 * - sendNotification: デスクトップ通知送信
 * - detectObjects: YOLOv11物体検知（メインプロセスで実行）
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSchedule: (schedule) => ipcRenderer.invoke('save-schedule', schedule),
  sendNotification: (data) => ipcRenderer.invoke('send-notification', data),
  detectObjects: (imageDataUrl) => ipcRenderer.invoke('detect-objects', imageDataUrl),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window')
});
