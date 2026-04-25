export {};

declare global {
  type MarketKey = 'gmarket' | 'naver' | 'auction' | '11st' | 'ohou';

  interface Window {
    electronAPI: {
      selectExcelFile: () => Promise<string | null>;
      runPipeline: (
        filePath: string,
        marketKey: MarketKey,
      ) => Promise<{ ok: boolean; error?: string }>;
      onPipelineLog: (callback: (message: string) => void) => () => void;
    };
  }
}
