import type { MarketHandlerKey } from './market';

export interface ParsedOrderRow {
  /** 시트 상의 실제 행 번호 (헤더 다음부터 2, 3, …) */
  excelRow: number;
  password: string;
  marketLabel: string;
  marketKey: MarketHandlerKey | null;
  userId: string;
  orderNo: string;
}
