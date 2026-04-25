import type { MarketHandlerKey } from '../types/market';

const LABEL_TO_KEY: Record<string, MarketHandlerKey> = {
  지마켓: 'gmarket',
  G마켓: 'gmarket',
  gmarket: 'gmarket',
  네이버: 'naver',
  naver: 'naver',
  옥션: 'auction',
  auction: 'auction',
  '11번가': '11st',
  '11st': '11st',
  오늘의집: 'ohou',
  ohou: 'ohou',
};

export function resolveMarketKey(marketLabel: string): MarketHandlerKey | null {
  const key = marketLabel.trim();
  return LABEL_TO_KEY[key] ?? null;
}
