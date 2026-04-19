import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import type { ParsedOrderRow } from '../types/orderRow';
import { loginGmarket, runGmarketFollowUp } from './markets/gmarketFollowUp';
import { parseOrderRowsFromFile, writeCourierToExcel } from './orderExcel';

export type LogFn = (message: string) => void;

/** 연속 행에서 동일 지마켓 계정이면 컨텍스트 재사용 */
type ActiveGmarketSession = {
  userId: string;
  password: string;
  context: BrowserContext;
  page: Page;
};

function isSameGmarketAccount(
  row: ParsedOrderRow,
  session: ActiveGmarketSession | null,
): boolean {
  return (
    !!session &&
    row.marketKey === 'gmarket' &&
    row.password.length > 0 &&
    session.userId === row.userId &&
    session.password === row.password
  );
}

async function handleGmarketRow(
  browser: Browser,
  filePath: string,
  row: ParsedOrderRow,
  session: ActiveGmarketSession | null,
  log: LogFn,
): Promise<ActiveGmarketSession | null> {
  if (!row.password) {
    log(`행 ${row.excelRow}: H열 비밀번호가 비어 있음`);
    return session;
  }

  if (isSameGmarketAccount(row, session)) {
    log(`행 ${row.excelRow}: 동일 계정(${row.userId}) — 로그인 생략`);
    const courier = await runGmarketFollowUp(session!.page, row, log, true);
    if (courier) {
      await writeCourierToExcel(filePath, row.excelRow, courier.company, courier.trackingNo);
      log(`행 ${row.excelRow}: 엑셀 K/L 기록 완료`);
    }
    return session;
  }

  if (session) {
    await session.context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    log(`행 ${row.excelRow}: 지마켓 로그인 시도… (${row.userId})`);
    await loginGmarket(page, row.userId, row.password);
    log(`행 ${row.excelRow}: 지마켓 로그인 완료`);
  } catch (err) {
    await context.close();
    throw err;
  }

  const next: ActiveGmarketSession = {
    userId: row.userId,
    password: row.password,
    context,
    page,
  };
  const courier = await runGmarketFollowUp(page, row, log, false);
  if (courier) {
    await writeCourierToExcel(filePath, row.excelRow, courier.company, courier.trackingNo);
    log(`행 ${row.excelRow}: 엑셀 K/L 기록 완료`);
  }
  return next;
}

async function runRow(
  browser: Browser,
  filePath: string,
  row: ParsedOrderRow,
  log: LogFn,
  gmarketSession: ActiveGmarketSession | null,
): Promise<ActiveGmarketSession | null> {
  if (!row.marketKey) {
    const hasThreeTokens =
      Boolean(row.marketLabel.trim()) &&
      Boolean(row.userId.trim()) &&
      Boolean(row.orderNo.trim());
    if (!hasThreeTokens) {
      log(
        `행 ${row.excelRow}: I열 형식 오류 — 공백으로 구분된 마켓·아이디·주문번호 3항목이 필요합니다.`,
      );
    } else {
      log(
        `행 ${row.excelRow}: 지원하지 않는 마켓 "${row.marketLabel}" — 건너뜀`,
      );
    }
    return gmarketSession;
  }

  if (row.marketKey === 'gmarket') {
    return handleGmarketRow(browser, filePath, row, gmarketSession, log);
  }

  return gmarketSession;
}

function maskId(id: string): string {
  if (id.length <= 2) return '**';
  return `${id.slice(0, 2)}***`;
}

export async function runOrderPipeline(
  filePath: string,
  log: LogFn,
): Promise<void> {
  const { rows, meta } = await parseOrderRowsFromFile(filePath);

  log(
    `[엑셀 읽기] 시트 "${meta.sheetName || '?'}" (통합문서 시트 ${meta.totalWorksheets}개 중 첫 번째만 사용)`,
  );
  log(
    `[엑셀 읽기] 스캔 범위: 2~${meta.lastRowNum}행 | rowCount=${meta.rowCountRaw}, lastRow.number=${meta.lastRowNumber}`,
  );

  if (rows.length === 0) {
    log(
      '처리할 데이터가 없습니다. H·I 열(8·9열)에 값이 있는지, 데이터가 첫 시트·2행 이하에 있는지 확인하세요.',
    );
    return;
  }

  log(`총 ${rows.length}행 로드됨 (H·I 중 하나라도 있는 행)`);
  const first = rows[0];
  log(
    `샘플(첫 행): ${first.excelRow}행 — 마켓 "${first.marketLabel}" / 아이디 ${maskId(first.userId)} / 주문번호 ${first.orderNo}`,
  );

  let browser: Browser | undefined;
  let gmarketSession: ActiveGmarketSession | null = null;
  try {
    browser = await chromium.launch({ headless: false });
    for (const row of rows) {
      gmarketSession = await runRow(browser, filePath, row, log, gmarketSession);
    }
  } finally {
    if (gmarketSession) {
      await gmarketSession.context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}
