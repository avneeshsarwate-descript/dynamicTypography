import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

type CaptureCommand = {
  id: string;
  client: string;
  time?: number;
  look?: 'collapse' | 'crumple';
};

type PagePoll = {
  client: string;
  response: ServerResponse;
};

type PendingCapture = {
  response: ServerResponse;
  timeout: ReturnType<typeof setTimeout>;
  time?: number;
  look?: 'collapse' | 'crumple';
};

function readRequest(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('Capture exceeds 32 MB'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

function captureBridge(): Plugin {
  const commands: CaptureCommand[] = [];
  const pagePolls: PagePoll[] = [];
  const captures = new Map<string, PendingCapture>();
  let nextId = 1;
  let latestClientStatus: unknown;

  function removePoll(response: ServerResponse): void {
    const index = pagePolls.findIndex((poll) => poll.response === response);
    if (index >= 0) pagePolls.splice(index, 1);
  }

  function dispatch(command: CaptureCommand): void {
    let pageIndex = -1;
    for (let index = pagePolls.length - 1; index >= 0; index -= 1) {
      if (pagePolls[index]!.client === command.client) {
        pageIndex = index;
        break;
      }
    }
    const page = pageIndex >= 0 ? pagePolls.splice(pageIndex, 1)[0] : undefined;
    if (page) json(page.response, 200, command);
    else commands.push(command);
  }

  return {
    name: 'canvas-capture-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, 'http://127.0.0.1');

        if (request.method === 'GET' && url.pathname === '/__canvas-capture/status') {
          json(response, 200, {
            browserConnected: pagePolls.length > 0,
            connectedClients: [...new Set(pagePolls.map((poll) => poll.client))],
            queuedCommands: commands.length,
            pendingCaptures: captures.size,
            latestClientStatus,
          });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/__canvas-capture/report') {
          try {
            const report = JSON.parse((await readRequest(request)).toString('utf8')) as unknown;
            latestClientStatus = { report, receivedAt: new Date().toISOString() };
            response.statusCode = 204;
            response.end();
          } catch (error) {
            json(response, 400, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }

        if (request.method === 'GET' && url.pathname === '/__canvas-capture/next') {
          const client = url.searchParams.get('client') || 'default';
          const commandIndex = commands.findIndex((candidate) => candidate.client === client);
          const command = commandIndex >= 0 ? commands.splice(commandIndex, 1)[0] : undefined;
          if (command) {
            json(response, 200, command);
            return;
          }

          pagePolls.push({ client, response });
          const timeout = setTimeout(() => {
            removePoll(response);
            response.statusCode = 204;
            response.end();
          }, 20_000);
          response.on('close', () => {
            clearTimeout(timeout);
            removePoll(response);
          });
          return;
        }

        if (request.method === 'POST' && url.pathname.startsWith('/__canvas-capture/result/')) {
          const id = url.pathname.split('/').at(-1) ?? '';
          const pending = captures.get(id);
          if (!pending) {
            json(response, 404, { error: `Unknown capture ${id}` });
            return;
          }

          try {
            const payload = await readRequest(request);
            clearTimeout(pending.timeout);
            captures.delete(id);
            if (request.headers['content-type'] !== 'image/png') {
              pending.response.statusCode = 500;
              pending.response.setHeader('Content-Type', 'application/json');
              pending.response.end(payload);
              response.statusCode = 204;
              response.end();
              return;
            }
            pending.response.statusCode = 200;
            pending.response.setHeader('Content-Type', 'image/png');
            pending.response.setHeader('Content-Length', payload.byteLength);
            pending.response.setHeader('Cache-Control', 'no-store');
            if (pending.time !== undefined) {
              pending.response.setHeader('X-Canvas-Time', pending.time.toFixed(3));
            }
            if (pending.look !== undefined) pending.response.setHeader('X-Typography-Look', pending.look);
            pending.response.end(payload);
            response.statusCode = 204;
            response.end();
          } catch (error) {
            clearTimeout(pending.timeout);
            captures.delete(id);
            json(pending.response, 500, { error: error instanceof Error ? error.message : String(error) });
            json(response, 500, { error: 'Could not relay the canvas capture' });
          }
          return;
        }

        if (request.method === 'GET' && url.pathname === '/__canvas-capture') {
          const requestedTime = url.searchParams.get('time');
          const client = url.searchParams.get('client') || 'default';
          const time = requestedTime === null ? undefined : Number(requestedTime);
          const requestedLook = url.searchParams.get('look');
          const look = requestedLook === null ? undefined : requestedLook;
          if (time !== undefined && (!Number.isFinite(time) || time < 0)) {
            json(response, 400, { error: 'time must be a finite, non-negative number' });
            return;
          }
          if (look !== undefined && look !== 'collapse' && look !== 'crumple') {
            json(response, 400, { error: 'look must be collapse or crumple' });
            return;
          }

          const id = String(nextId++);
          const timeout = setTimeout(() => {
            captures.delete(id);
            json(response, 504, { error: 'No browser returned a canvas capture within 15 seconds' });
          }, 15_000);
          captures.set(id, { response, timeout, time, look });
          dispatch({ id, client, time, look });
          return;
        }

        next();
      });

      server.httpServer?.on('close', () => {
        for (const pending of captures.values()) {
          clearTimeout(pending.timeout);
          json(pending.response, 503, { error: 'Capture server stopped' });
        }
        for (const page of pagePolls) {
          page.response.statusCode = 503;
          page.response.end();
        }
        captures.clear();
        pagePolls.length = 0;
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), captureBridge()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
