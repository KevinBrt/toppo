/**
 * `@toppo-tracker/plugin-testing`: a fake Toppo to test a plugin with, in memory, with the rules
 * of the real one. MIT, as the SDK.
 */

export { TEST_PLUGIN_USER_ID } from './test-records.ts';
export {
  createTestToppo,
  PluginRunError,
  type TestComment,
  type TestHttpReply,
  type TestHttpRequest,
  type TestIssueInput,
  type TestToppo,
  type TestUser,
} from './test-toppo.ts';
