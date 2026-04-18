import type { Page } from 'playwright';
import type { ParsedOrderRow } from '../../types/orderRow';

/**
 * 지마켓 로그인 직후·동일 세션 재사용 시 행마다 호출.
 * 송장/주문 조회 등 다음 단계를 여기에 연결하면 됨.
 */
export async function runGmarketFollowUp(
  page: Page,
  row: ParsedOrderRow,
  log: (message: string) => void,
  reusedLogin: boolean,
): Promise<void> {
  log(
    reusedLogin
      ? `  → (세션 유지) 주문번호 ${row.orderNo} 후속 처리`
      : `  → (신규 로그인) 주문번호 ${row.orderNo} 후속 처리`,
  );
  void page;
}
