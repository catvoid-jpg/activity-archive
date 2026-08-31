'use strict';

/**
 * 서버 진입점. 앱을 생성하고 설정된 포트로 리슨한다.
 */

const { createApp } = require('./app');
const { config } = require('./config');

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[activity-archive] server listening on port ${config.port}`);
});

// 프로세스 종료 시 깔끔하게 닫는다.
function shutdown(signal) {
  console.log(`[activity-archive] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server };
