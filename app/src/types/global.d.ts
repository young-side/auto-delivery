export {};

declare global {
  interface Window {
    electronAPI: {
      selectExcelFile: () => Promise<string | null>;
      runPipeline: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      onPipelineLog: (callback: (message: string) => void) => () => void;
    };
  }
}
