// Isolated visual-review app with deterministic local AI judgments and artificial
// delays. No private runtime configuration or external vision service is used.
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { buildApp } from '../packages/server/dist/app.js';
import defaults from '../config/default.json' with { type: 'json' };
const root = '/tmp/shin-wallslice-v131-review';
await mkdir(root, { recursive: true });
const provider = createServer(async (request, reply) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const { messages } = JSON.parse(raw);
    const prompt = messages[0].content;
    let content;
    if (prompt.startsWith('Compare ORIGINAL')) {
      await delay(10_000);
      const cutoff = Number(
        messages[1].content[2].text.match(/cutoff (\d+)/)[1],
      );
      content = JSON.stringify({ cutoff, acceptable: cutoff <= 24 });
    } else
      content = prompt.startsWith('Suggest exactly')
        ? 'dusk-ridges'
        : '{"subject":null,"focal":null}';
    if (!reply.destroyed) {
      reply.setHeader('content-type', 'application/json');
      reply.end(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content } }],
        }),
      );
    }
  } catch {
    reply.destroy();
  }
});
await new Promise((resolve) => provider.listen(3102, '127.0.0.1', resolve));
const app = buildApp({
  ...defaults,
  port: 3101,
  host: '127.0.0.1',
  logLevel: 'silent',
  dataDirectory: `${root}/data`,
  temporaryDirectory: `${root}/tmp`,
  outputDirectory: `${root}/output`,
  ai: {
    enabled: true,
    baseUrl: 'http://127.0.0.1:3102',
    model: 'controlled-review',
  },
});
app.addHook('preHandler', async (request) => {
  if (request.url.endsWith('/render')) await delay(4_000);
});
await app.listen({ host: '127.0.0.1', port: 3101 });
console.log(
  'Controlled visual-review app: http://127.0.0.1:3101 (mock AI; 10s/comparison, 4s/render delay)',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close().then(() => provider.close());
  });
