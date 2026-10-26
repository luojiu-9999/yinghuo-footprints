import { existsSync } from 'node:fs';

// Prefer an explicit executable, then an installed browser, then Playwright Chromium.
export function browserOptions() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) throw new Error('CHROME_PATH points to a missing browser executable');
    return { executablePath: process.env.CHROME_PATH, headless: true };
  }
  const candidates = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).flatMap(root => [`${root}/Google/Chrome/Application/chrome.exe`, `${root}/Microsoft/Edge/Application/msedge.exe`])
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const executablePath = candidates.find(path => existsSync(path));
  return executablePath ? { executablePath, headless: true } : { headless: true };
}
