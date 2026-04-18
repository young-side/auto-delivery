import type { MarketHandlerKey } from '../types/market';

const LABEL_TO_KEY: Record<string, MarketHandlerKey> = {
  지마켓: 'gmarket',
  G마켓: 'gmarket',
  gmarket: 'gmarket',
};

export function resolveMarketKey(marketLabel: string): MarketHandlerKey | null {
  const key = marketLabel.trim();
  return LABEL_TO_KEY[key] ?? null;
}
