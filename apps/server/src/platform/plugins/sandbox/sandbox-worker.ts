import { parentPort, workerData } from 'node:worker_threads';
import { createQuickJsSandbox } from './quickjs-sandbox.ts';
import type { FromWorker, ToWorker, WorkerData } from './sandbox-protocol.ts';

/**
 * A plugin's worker: its sandbox, between Toppo's requests and the plugin's calls. It keeps no
 * state of its own: once the sandbox is no longer usable, Toppo throws the whole worker away.
 */
const port = parentPort;
if (!port) {
  throw new Error('The plugin sandbox runs in a worker thread');
}
const data: WorkerData = workerData;
const calls = new Map<number, { resolve(answer: string): void; reject(error: Error): void }>();
let nextCall = 0;

function send(message: FromWorker): void {
  port?.postMessage(message);
}

const sandbox = await createQuickJsSandbox({
  code: data.code,
  memoryMb: data.memoryMb,
  call: (method, args) =>
    new Promise((resolve, reject) => {
      const id = nextCall++;
      calls.set(id, { resolve, reject });
      send({ type: 'call', id, method, args });
    }),
});

port.on('message', async (message: ToWorker) => {
  switch (message.type) {
    case 'answer': {
      const waiting = calls.get(message.id);
      calls.delete(message.id);
      if ('error' in message) {
        waiting?.reject(new Error(message.error));
      } else {
        waiting?.resolve(message.result);
      }
      return;
    }
    case 'manifest':
      send({ type: 'outcome', id: message.id, outcome: await sandbox.manifest() });
      return;
    case 'run': {
      const { id, type: _type, ...request } = message;
      send({ type: 'outcome', id, outcome: await sandbox.run(request) });
      return;
    }
  }
});
