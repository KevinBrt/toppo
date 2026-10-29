/**
 * For what runs a plugin outside Toppo's sandbox, such as the testing kit: its answers to Toppo,
 * served with a host of one's own, and the signatures every host checks the same way.
 */
export {
  type HostCrypto,
  type SignedRequest,
  signedHeaders,
  verifySignature,
} from './crypto/signatures.ts';
export { servePlugin } from './serve.ts';
