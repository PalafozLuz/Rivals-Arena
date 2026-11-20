const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1, timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:3417', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:3417', env: { PORT: '3417' }, reuseExistingServer: false }
});
