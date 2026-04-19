import type { Page } from 'playwright';
import type { ParsedOrderRow } from '../../types/orderRow';

const GMARKET_LOGIN_URL = 'https://signinssl.gmarket.co.kr/login/login';
const GMARKET_TRACK_BASE = 'https://tracking.gmarket.co.kr/track/';
const GMARKET_TRACK_SUFFIX = '?trackingType=DELIVERY&charset=ko';

function buildGmarketTrackingUrl(orderNoRaw: string): string {
  const orderNo = orderNoRaw.trim();
  return `${GMARKET_TRACK_BASE}${encodeURIComponent(orderNo)}${GMARKET_TRACK_SUFFIX}`;
}

function parseCompanyAndTrackingNo(text: string): { company: string; trackingNo: string } | null {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const m = trimmed.match(/^(.+)\s+(\d{8,})$/);
  if (!m) return null;
  return { company: m[1].trim(), trackingNo: m[2] };
}

/**
 * 지마켓 로그인
 */
export async function loginGmarket(page: Page, userId: string, password: string): Promise<void> {
  await page.goto(GMARKET_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const idLocator = page.locator('input#typeMemberInputId');
  const pwLocator = page.locator('input#typeMemberInputPassword');

  await idLocator.waitFor({ state: 'visible', timeout: 15000 });
  await idLocator.fill(userId);
  await pwLocator.fill(password);

  const submit = page.locator('button#btn_memberLogin');
  await submit.click();

  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
    /* 일부 리다이렉트에서 networkidle 미도달 가능 */
  });
}

/**
 * 지마켓 로그인 직후·동일 세션 재사용 시 행마다 호출.
 * 송장/주문 조회 등 다음 단계를 여기에 연결하면 됨.
 */
export async function runGmarketFollowUp(
  page: Page,
  row: ParsedOrderRow,
  log: (message: string) => void,
  reusedLogin: boolean,
): Promise<{ company: string; trackingNo: string } | null> {
  log(
    reusedLogin
      ? `  → (세션 유지) 주문번호 ${row.orderNo} 후속 처리`
      : `  → (신규 로그인) 주문번호 ${row.orderNo} 후속 처리`,
  );

  const url = buildGmarketTrackingUrl(row.orderNo);
  log(`  → tracking 이동: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const deliveredItem = page.locator('li.list-item--delivered').first();
  const addressLine = deliveredItem.locator('span.text__delivery-address').last();

  try {
    await deliveredItem.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    log('  → 배송완료 항목을 찾지 못했습니다. (미배송/페이지 구조 변경/권한 문제 가능)');
    return null;
  }

  const line = (await addressLine.innerText().catch(() => '')).trim();
  if (!line) {
    log('  → 배송 정보 텍스트를 찾지 못했습니다. (셀렉터 변경 필요)');
    return null;
  }

  const parsed = parseCompanyAndTrackingNo(line);
  if (!parsed) {
    log(`  → 배송 정보 파싱 실패: "${line}"`);
    return null;
  }

  log(`  → 택배사: ${parsed.company}`);
  log(`  → 송장번호: ${parsed.trackingNo}`);
  return { company: parsed.company, trackingNo: parsed.trackingNo };
}
