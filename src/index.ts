import { createApp } from './app';

(async () => {
  const app = createApp();
  await app.start();
  console.log('⚡️ Bolt app started');
})();
