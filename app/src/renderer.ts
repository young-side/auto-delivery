import './index.css';

const btnPick = document.querySelector<HTMLButtonElement>('#btn-pick');
const btnRun = document.querySelector<HTMLButtonElement>('#btn-run');
const fileLabel = document.querySelector<HTMLSpanElement>('#file-label');
const logEl = document.querySelector<HTMLTextAreaElement>('#log');

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
    fileLabel.textContent = selectedPath ?? '선택된 파일 없음';
  }
  setRunEnabled(Boolean(selectedPath));
}

window.electronAPI.onPipelineLog((message: string) => {
  appendLog(message);
});

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
    const result = await window.electronAPI.runPipeline(selectedPath);
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
