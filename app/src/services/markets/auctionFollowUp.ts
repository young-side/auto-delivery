import type { Page } from 'playwright';
import type { ParsedOrderRow } from '../../types/orderRow';

export const AUCTION_LOGIN_URL =
  'https://signin.auction.co.kr/Authenticate/MobileLogin.aspx?url=http%3a%2f%2fwww.auction.co.kr&return_value=0&loginType=0';

const AUCTION_TRACK_PREFIX = 'https://tracking.auction.co.kr/?orderNo=';

function buildAuctionTrackingUrl(orderNoRaw: string): string {
  const orderNo = orderNoRaw.trim();
  return `${AUCTION_TRACK_PREFIX}${encodeURIComponent(orderNo)}`;
}

function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, ' ');
}

function parseCooperLine(text: string): { company: string; trackingNo: string } | null {
  const line = stripHtmlComments(text).replace(/\s+/g, ' ').trim();
  const m = line.match(/^(.+?)\s+(\d{10,14})\s*$/);
  if (!m) return null;
  return { company: m[1].trim(), trackingNo: m[2] };
}

/**
 * 옥션 로그인
 */
export async function loginAuction(page: Page, userId: string, password: string): Promise<void> {
  await page.goto(AUCTION_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const idInput = page.locator('input#typeMemberInputId');
  const pwInput = page.locator('input#typeMemberInputPassword');

  await idInput.waitFor({ state: 'visible', timeout: 15000 });
  await idInput.fill(userId);
  await pwInput.fill(password);

  const loginBtn = page.locator('button#btnLogin');
  await loginBtn.click();

  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
    /* TODO: 일부 리다이렉트에서 networkidle 미도달 가능 */
  });
}

/**
 * 로그인 세션 유지 상태에서 주문번호별 배송 추적 페이지에서 택배사·송장 추출
 */
export async function runAuctionFollowUp(
  page: Page,
  row: ParsedOrderRow,
  log: (message: string) => void,
  reusedLogin: boolean,
): Promise<{ company: string; trackingNo: string } | null> {
  log(
    reusedLogin
      ? `  → (세션 유지) 주문번호 ${row.orderNo} 처리`
      : `  → (신규 로그인) 주문번호 ${row.orderNo} 처리`,
  );

  const url = buildAuctionTrackingUrl(row.orderNo);
  log(`  → tracking 이동: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const deliveredItem = page.locator('li.list-item--delivered').first();
  const cooper = deliveredItem.locator('span.text__delivery-cooper').first();

  try {
    await deliveredItem.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    log('  → 배송완료 항목을 찾지 못했습니다. (미배송/페이지 구조 변경/권한 문제 가능)');
    return null;
  }

  const raw = await cooper.innerText().catch(() => '');
  const parsed = parseCooperLine(raw);
  if (!parsed) {
    log(`  → 배송 정보 파싱 실패: "${raw.trim().replace(/\s+/g, ' ')}"`);
    return null;
  }

  log(`  → 택배사: ${parsed.company}`);
  log(`  → 송장번호: ${parsed.trackingNo}`);
  return parsed;
}
