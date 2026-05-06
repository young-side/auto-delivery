import type { Page } from 'playwright';
import type { ParsedOrderRow } from '../../types/orderRow';
import { waitForResume } from '../userResume';

/** 로그인 후, 주문목록 페이지로 이동하는 URL */
const ELEVENST_LOGIN_URL =
  'https://login.11st.co.kr/auth/v2/login?isPopup=false&returnURL=' +
  encodeURIComponent('https://buy.11st.co.kr/my11st/order/OrderList.tmall');
const ELEVENST_TRACE_BASE = 'https://buy.11st.co.kr/delivery/trace.tmall?dlvNo=';
const ELEVENST_ORDER_LIST_URL = 'https://buy.11st.co.kr/my11st/order/OrderList.tmall';

function parseOrderDateFromOrderNo(orderNoRaw: string): string | null {
  const orderNo = orderNoRaw.trim();
  const m = orderNo.match(/^(\d{8})\d+$/);
  return m ? m[1] : null;
}

function parseYYYYMMDD(yyyymmdd: string): Date | null {
  const m = yyyymmdd.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  // 날짜가 말이 안 되면 Date가 보정되므로 역검증
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatYYYYMMDD(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function addDays(dt: Date, days: number): Date {
  const copy = new Date(dt.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * 주문번호 앞 8자리(YYYYMMDD)를 기준으로 조회 기간을 설정해 주문 목록 페이지 URL 생성.
 *
 * 가정(요청 예시 기반):
 * - shDateFrom = 주문일 - 3일
 * - shDateTo   = 주문일 + 1일
 */
export function buildElevenstOrderListUrl(params: { pageNumber: number; orderNo: string }): string {
  const orderDateStr = parseOrderDateFromOrderNo(params.orderNo);
  const orderDate = orderDateStr ? parseYYYYMMDD(orderDateStr) : null;
  if (!orderDate) {
    // 날짜 파싱이 실패해도 페이지는 열리도록 기본값(오늘~오늘)
    const today = new Date();
    const qp = new URLSearchParams({
      currpageNo: '',
      pageNumber: String(params.pageNumber),
      pageNumberPendingDone: '1',
      pageNumberPendingFail: '1',
      shDateFrom: formatYYYYMMDD(today),
      shDateTo: formatYYYYMMDD(today),
      shPrdNm: '',
      shOrdprdStat: '',
      type: 'orderList2nd',
      ver: '02',
      nDate: '',
    });
    return `${ELEVENST_ORDER_LIST_URL}?${qp.toString()}`;
  }

  const shDateFrom = formatYYYYMMDD(addDays(orderDate, -3));
  const shDateTo = formatYYYYMMDD(addDays(orderDate, 1));

  const qp = new URLSearchParams({
    currpageNo: '',
    pageNumber: String(params.pageNumber),
    pageNumberPendingDone: '1',
    pageNumberPendingFail: '1',
    shDateFrom,
    shDateTo,
    shPrdNm: '',
    shOrdprdStat: '',
    type: 'orderList2nd',
    ver: '02',
    nDate: '',
  });
  return `${ELEVENST_ORDER_LIST_URL}?${qp.toString()}`;
}

export function buildElevenstTraceUrl(dlvNo: string): string {
  return `${ELEVENST_TRACE_BASE}${encodeURIComponent(dlvNo.trim())}`;
}

async function findDlvNoOnOrderListPage(page: Page, orderNo: string): Promise<string> {
  const btn = page.locator(`a[ord-no="${orderNo}"]`, { hasText: '배송조회' }).first();
  const visible = await btn
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return '';

  const href = (await btn.getAttribute('href').catch((): string | null => null)) ?? '';
  const m = href.match(/goDeliveryTracking\('(\d+)'/);
  return m?.[1] ?? '';
}

/**
 * 목록 HTML에서 해당 주문번호(ord-no)가 있는 **배송조회** 행의 dlvNo만 추출 (AHK `ParseDlvNoFromListPage` 포팅).
 */
export function parseDlvNoFromListPage(html: string, orderNumRaw: string): string {
  const orderNum = orderNumRaw.trim();
  if (!html || !orderNum) return '';

  // ord-no="주문번호"가 달린 <a> 중 텍스트가 "배송조회"인 버튼만 골라서
  // href="javascript:goDeliveryTracking('dlvNo', ...)"에서 dlvNo를 추출한다.
  const re =
    new RegExp(
      `<a[^>]*\\bord-no=["']${orderNum}["'][^>]*\\bhref=["']\\s*javascript:\\s*goDeliveryTracking\\('(?<dlvNo>\\d+)'[^"']*["'][^>]*>\\s*배송조회\\s*<\\/a>`,
      'i',
    );

  const m = html.match(re);
  return m?.groups?.dlvNo ?? '';
}

/**
 * 배송추적 페이지 HTML에서 택배사·송장번호 추출
 */
export async function readCourierFromTracePage(
  page: Page,
  log: (message: string) => void,
): Promise<{ company: string; trackingNo: string } | null> {
  const deliveryInfo = page.locator('div.delivery_info').first();
  try {
    await deliveryInfo.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    log('  → 배송 정보 영역(.delivery_info)을 찾지 못했습니다. (셀렉터 변경 필요)');
    return null;
  }

  const companyDd = deliveryInfo
    .locator('div.field', { has: deliveryInfo.locator('dt', { hasText: '택배사' }) })
    .first()
    .locator('dd')
    .first();

  const trackingDd = deliveryInfo
    .locator('div.field', { has: deliveryInfo.locator('dt', { hasText: '송장번호' }) })
    .first()
    .locator('dd')
    .first();

  const companyRaw = (await companyDd.innerText().catch(() => '')).trim();
  const trackingNo = (await trackingDd.innerText().catch(() => '')).trim();

  // dd 내에 전화번호 span.num 같은 부가 텍스트가 섞일 수 있어 제거
  const company = companyRaw.replace(/\s+/g, ' ').replace(/\s*\d{2,4}-\d{3,4}-\d{4}\s*/g, ' ').trim();

  if (!company && !trackingNo) return null;
  return { company, trackingNo };
}

/**
 * 11번가 로그인
 */
export async function loginElevenst(
  page: Page,
  userId: string,
  password: string,
  log: (message: string) => void,
): Promise<void> {
  await page.goto(ELEVENST_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 캡챠가 뜨면 사용자가 직접 처리할 수 있게 일시정지한다.
  // reCAPTCHA anchor는 iframe 안에 있을 수 있으므로 frameLocator로 탐색.
  const captchaAnchor = page
    .frameLocator('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]')
    .locator('#rc-anchor-container')
    .first();

  const idLocator = page.locator('input#memId');
  const pwLocator = page.locator('input#memPwd');

  await idLocator.waitFor({ state: 'visible', timeout: 20000 });
  await idLocator.fill(userId);
  await pwLocator.fill(password);

  // 1) 클릭 전 캡챠 감지/대기 (페이지 진입 시 이미 노출되는 케이스)
  const captchaVisibleBefore = await captchaAnchor
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (captchaVisibleBefore) {
    log('  → 캡챠 진행 후, F8 을 눌러서 이어서 진행');
    await waitForResume('captcha');
  }

  const submit = page.locator('button#loginButton');
  await submit.click();

  // 2) 클릭 후 캡챠 감지/대기 (로그인 시도 후 노출되는 케이스)
  const captchaVisibleAfter = await captchaAnchor
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (captchaVisibleAfter) {
    log('  → 캡챠 진행 후, F8 을 눌러서 이어서 진행');
    await waitForResume('captcha');
  }

  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
    /* TODO: 일부 리다이렉트에서 networkidle 미도달 가능 */
  });
}

/**
 * 로그인 세션 유지 상태에서 주문번호로 목록 페이지를 순회해 dlvNo를 찾은 뒤 배송추적 페이지에서 택배사·송장 추출.
 */
export async function runElevenstFollowUp(
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

  const orderNo = row.orderNo.trim();
  let dlvNo = '';

  for (let p = 1; ; p++) {
    const listUrl = buildElevenstOrderListUrl({ pageNumber: p, orderNo });
    log(`  → 주문내역 ${p} 페이지 이동`);
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {
      /* TODO: 일부 리다이렉트에서 networkidle 미도달 가능 */
    });

    const empty = await page
      .locator('text=최근 주문/배송 조회 내역이 없습니다.')
      .first()
      .isVisible()
      .catch(() => false);
    if (empty) {
      log('  → 최근 주문/배송 조회 내역이 없어 조회를 중단합니다.');
      break;
    }

    dlvNo = await findDlvNoOnOrderListPage(page, orderNo);
    if (dlvNo) {
      log(`  → dlvNo: ${dlvNo}`);
      break;
    }
  }

  if (!dlvNo) {
    log(`  → 주문번호 ${orderNo}에 대한 배송조회(dlvNo)를 찾지 못했습니다.`);
    return null;
  }

  const traceUrl = buildElevenstTraceUrl(dlvNo);
  await page.goto(traceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const parsed = await readCourierFromTracePage(page, log);
  if (!parsed || (!parsed.company && !parsed.trackingNo)) {
    log('  → 배송추적 페이지에서 택배사·송장 파싱 실패 (마크업 변경 가능)');
    return null;
  }

  log(`  → 택배사: ${parsed.company}`);
  log(`  → 송장번호: ${parsed.trackingNo}`);
  return parsed;
}
