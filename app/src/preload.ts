import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectExcelFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-excel-file'),
  runPipeline: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('run-pipeline', filePath),
  onPipelineLog: (callback: (message: string) => void): (() => void) => {
    const handler = (_event: unknown, message: string): void => {
      callback(message);
    };
    ipcRenderer.on('pipeline-log', handler);
    return () => {
      ipcRenderer.removeListener('pipeline-log', handler);
    };
  },
});
