import type { Page } from 'playwright';

const LOGIN_URL = 'https://gsigninssl.gmarket.co.kr/Login/Login';

/**
 * 지마켓 PC 로그인. 페이지 구조 변경 시 셀렉터 조정 필요.
 */
export async function loginGmarket(
  page: Page,
  userId: string,
  password: string,
): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const idLocator = page.locator('input#txtID, input[name="txtID"]').first();
  const pwLocator = page.locator('input#txtPassword, input[name="txtPassword"]').first();

  await idLocator.waitFor({ state: 'visible', timeout: 15000 });
  await idLocator.fill(userId);
  await pwLocator.fill(password);

  const submit = page.locator(
    '#btnLogin, input#btnLogin, button[type="submit"], input[type="submit"]',
  ).first();
  await submit.click();

  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
    /* 일부 리다이렉트에서 networkidle 미도달 가능 */
  });
}
