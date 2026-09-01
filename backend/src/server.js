'use strict';

/**
 * 서버 진입점. 앱을 생성하고 설정된 포트로 리슨한다.
 * createApp 은 async(어댑터 초기화·스키마 적용)이므로 부팅도 async 로 처리한다.
 */

const { createApp } = require('./app');
const { config } = require('./config');
const { closeDatabase } = require('./db');

async function main() {
  const app = await createApp();

  const server = app.listen(config.port, () => {
    console.log(`[activity-archive] server listening on port ${config.port}`);
  });

  function shutdown(signal) {
    console.log(`[activity-archive] received ${signal}, shutting down`);
    server.close(async () => {
      await closeDatabase().catch(() => {});
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[activity-archive] failed to start:', err && err.message);
  process.exit(1);
});
