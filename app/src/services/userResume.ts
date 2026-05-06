type ResumeKey = 'captcha';

const waiters = new Map<ResumeKey, Array<() => void>>();

export function waitForResume(key: ResumeKey): Promise<void> {
  return new Promise((resolve) => {
    const list = waiters.get(key) ?? [];
    list.push(resolve);
    waiters.set(key, list);
  });
}

export function signalResume(key: ResumeKey): void {
  const list = waiters.get(key);
  if (!list || list.length === 0) return;
  waiters.set(key, []);
  for (const fn of list) fn();
}

