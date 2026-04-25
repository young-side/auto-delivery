import './index.css';
import 'pretendard/dist/web/static/pretendard.css';

const btnPick = document.querySelector<HTMLButtonElement>('#btn-pick');
const btnRun = document.querySelector<HTMLButtonElement>('#btn-run');
const fileLabel = document.querySelector<HTMLSpanElement>('#file-label');
const logEl = document.querySelector<HTMLTextAreaElement>('#log');
const marketChecks = Array.from(
  document.querySelectorAll<HTMLInputElement>('.market-row input[type="checkbox"]'),
);

let selectedPath: string | null = null;

function appendLog(line: string): void {
  if (!logEl) return;
  logEl.value = logEl.value ? `${logEl.value}\n${line}` : line;
  logEl.scrollTop = logEl.scrollHeight;
}

function setRunEnabled(enabled: boolean): void {
  if (btnRun) btnRun.disabled = !enabled;
}

function syncUi(): void {
  if (fileLabel) {
    const display =
      selectedPath?.split(/[/\\]/).filter(Boolean).pop() ?? '선택된 파일 없음';
    fileLabel.textContent = display;
    fileLabel.title = selectedPath ?? '';
  }
  setRunEnabled(Boolean(selectedPath));
}

window.electronAPI.onPipelineLog((message: string) => {
  appendLog(message);
});

function enforceSingleMarketSelection(changed?: HTMLInputElement): void {
  if (marketChecks.length === 0) return;

  const checked = marketChecks.filter((c) => c.checked);
  if (checked.length === 0) {
    (changed ?? marketChecks[0]).checked = true;
    return;
  }

  if (checked.length === 1) return;

  const keep = changed && changed.checked ? changed : checked[0];
  for (const c of marketChecks) {
    c.checked = c === keep;
  }
}

for (const c of marketChecks) {
  c.addEventListener('change', () => enforceSingleMarketSelection(c));
}
enforceSingleMarketSelection();

function getSelectedMarketKey(): MarketKey {
  const checked = marketChecks.find((c) => c.checked);
  const id = checked?.id ?? 'm-gmarket';
  switch (id) {
    case 'm-gmarket':
      return 'gmarket';
    case 'm-naver':
      return 'naver';
    case 'm-auction':
      return 'auction';
    case 'm-11st':
      return '11st';
    case 'm-ohou':
      return 'ohou';
    default:
      return 'gmarket';
  }
}

btnPick?.addEventListener('click', async () => {
  const path = await window.electronAPI.selectExcelFile();
  selectedPath = path;
  syncUi();
});

btnRun?.addEventListener('click', async () => {
  if (!selectedPath) return;
  appendLog('--- 실행 시작 ---');
  btnRun.disabled = true;
  btnPick?.setAttribute('disabled', 'true');
  try {
    const marketKey = getSelectedMarketKey();
    const result = await window.electronAPI.runPipeline(selectedPath, marketKey);
    if (!result.ok && result.error) {
      appendLog(`실패: ${result.error}`);
    }
  } finally {
    btnPick?.removeAttribute('disabled');
    setRunEnabled(true);
    appendLog('--- 실행 종료 ---');
  }
});

syncUi();
