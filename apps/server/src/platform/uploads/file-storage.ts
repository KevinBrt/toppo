import { randomBytes } from 'node:crypto';
import { createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, statfs, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createTextScan, FILE_HEAD_LENGTH } from '@toppo/core';
import { HttpError } from '../http/http-error.ts';

/** Where files wait while they arrive, before a command keeps them. */
const INCOMING = '.incoming';
/** A kept file's name on disk: 32 random bytes in hexadecimal, never derived from its name. */
const STORAGE_KEY = /^[0-9a-f]{64}$/;
/** Kept files are spread over 256 folders, by the first two characters of their key. */
const FOLDER = /^[0-9a-f]{2}$/;
/** Room left free for the database and the system: uploads stop before the disk is full. */
const DEFAULT_RESERVE = 1024 * 1024 * 1024;
/**
 * How old a file nothing names must be before it is swept: far older than any upload in flight
 * or any transaction that is about to name it.
 */
const SWEEP_AFTER_MS = 60 * 60 * 1000;
/** Keys checked against the database at once. */
const SWEEP_BATCH = 1000;

/**
 * A file received from a request, waiting in `.incoming` until a command keeps it. Only
 * `FileStorage.receive` makes one: a request body cannot pass for it.
 */
export class ReceivedFile {
  readonly path: string;
  /** In bytes. */
  readonly size: number;
  /** Its first bytes, at most `FILE_HEAD_LENGTH`, to tell its type. */
  readonly head: Uint8Array;
  /** Whether it is all text (`createTextScan`). */
  readonly text: boolean;

  constructor(file: { path: string; size: number; head: Uint8Array; text: boolean }) {
    this.path = file.path;
    this.size = file.size;
    this.head = file.head;
    this.text = file.text;
  }
}

/** Attached files on disk, under `<dataDir>/uploads`. */
export interface FileStorage {
  /** Largest file accepted, in bytes (`TOPPO_ATTACHMENT_MAX_SIZE_MB`). */
  readonly maxFileSize: number;
  /**
   * Writes a request body to `.incoming`, refusing before reading it a body without a length, an
   * empty one, one too large, or one the disk has no room for.
   */
  receive(body: Readable, declaredLength: string | undefined): Promise<ReceivedFile>;
  /** Moves a received file among the kept ones, under a new random key, and answers that key. */
  keep(file: ReceivedFile): Promise<string>;
  /** Removes a received file no command kept. */
  discard(file: ReceivedFile): Promise<void>;
  /** Opens a kept file to send it. */
  open(storageKey: string): Promise<ReadStream>;
  /**
   * Removes the files nothing names any more (`referenced` answers which of some keys still
   * are), and those left in `.incoming`, once an hour old. Answers how many it removed.
   */
  sweep(referenced: (keys: readonly string[]) => Promise<ReadonlySet<string>>): Promise<number>;
}

export interface FileStorageOptions {
  /** `<dataDir>/uploads`. */
  root: string;
  maxFileSize: number;
  /** Bytes left free on the disk; 1 GiB by default. */
  reserve?: number;
  /** How many bytes are free where files are stored; the file system's own count by default. */
  freeSpace?: () => Promise<number>;
}

/** Prepares the folders of `root` (readable by Toppo only) and answers the storage. */
export async function createFileStorage({
  root,
  maxFileSize,
  reserve = DEFAULT_RESERVE,
  freeSpace,
}: FileStorageOptions): Promise<FileStorage> {
  const incoming = join(root, INCOMING);
  await mkdir(incoming, { recursive: true, mode: 0o700 });
  const bytesFree =
    freeSpace ??
    (async () => {
      const { bavail, bsize } = await statfs(root);
      return bavail * bsize;
    });
  const pathOf = (storageKey: string) => {
    if (!STORAGE_KEY.test(storageKey)) {
      throw new Error('Invalid storage key');
    }
    return join(root, storageKey.slice(0, 2), storageKey);
  };

  // Bytes of the files on their way: the disk does not count them yet, the reserve must.
  let arriving = 0;

  return {
    maxFileSize,

    async receive(body, declaredLength) {
      const length = await acceptedLength(declaredLength, maxFileSize, async (size) => {
        // Checked and counted at once, after the only wait: two uploads never both take the room.
        const fits = (await bytesFree()) - arriving - size >= reserve;
        if (fits) {
          arriving += size;
        }
        return fits;
      });
      const path = join(incoming, randomBytes(16).toString('hex'));
      const inspection = inspect(length);
      try {
        await pipeline(
          body,
          inspection.stream,
          createWriteStream(path, { flags: 'wx', mode: 0o600 }),
        );
      } catch (error) {
        await removeIfThere(path);
        if (body.readableAborted && !(error instanceof HttpError)) {
          throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The file did not arrive whole');
        }
        throw error;
      } finally {
        arriving -= length;
      }
      const received = inspection.result();
      if (received.size !== length) {
        await removeIfThere(path);
        throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The file did not arrive whole');
      }
      return new ReceivedFile({ path, ...received });
    },

    async keep(file) {
      if (dirname(file.path) !== incoming) {
        throw new Error('Only a file received here can be kept');
      }
      const storageKey = randomBytes(32).toString('hex');
      const path = pathOf(storageKey);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await rename(file.path, path);
      return storageKey;
    },

    async discard(file) {
      if (dirname(file.path) === incoming) {
        await removeIfThere(file.path);
      }
    },

    async open(storageKey) {
      return (await open(pathOf(storageKey), 'r')).createReadStream();
    },

    async sweep(referenced) {
      const before = Date.now() - SWEEP_AFTER_MS;
      let removed = 0;
      const removeIfOld = async (path: string) => {
        const modified = await modifiedAt(path);
        if (modified !== null && modified < before && (await removeIfThere(path))) {
          removed += 1;
        }
      };
      for (const name of await readdir(incoming)) {
        await removeIfOld(join(incoming, name));
      }
      for (const folder of (await readdir(root)).filter((name) => FOLDER.test(name))) {
        const keys = (await readdir(join(root, folder))).filter((name) => STORAGE_KEY.test(name));
        for (let start = 0; start < keys.length; start += SWEEP_BATCH) {
          const batch = keys.slice(start, start + SWEEP_BATCH);
          const kept = await referenced(batch);
          for (const key of batch.filter((candidate) => !kept.has(candidate))) {
            await removeIfOld(pathOf(key));
          }
        }
      }
      return removed;
    },
  };
}

/**
 * The length a request announces, checked before a byte is read: required, so that the limit is
 * known at once; a browser always sends it with a file.
 */
async function acceptedLength(
  declared: string | undefined,
  maxFileSize: number,
  fits: (size: number) => Promise<boolean>,
): Promise<number> {
  if (declared === undefined || !/^\d+$/.test(declared)) {
    throw new HttpError(411, 'LENGTH_REQUIRED', 'Send the file with its length');
  }
  const length = Number(declared);
  if (length === 0) {
    throw new HttpError(400, 'ATTACHMENT_EMPTY', 'This file is empty');
  }
  if (length > maxFileSize) {
    throw new HttpError(413, 'ATTACHMENT_TOO_LARGE', `Files may not exceed ${maxFileSize} bytes`);
  }
  if (!(await fits(length))) {
    throw new HttpError(507, 'STORAGE_FULL', 'There is no room left to store files');
  }
  return length;
}

/** Reads a file as it passes: its size, never beyond `length`, its first bytes, whether it is text. */
function inspect(length: number) {
  const head = new Uint8Array(FILE_HEAD_LENGTH);
  const textScan = createTextScan();
  let size = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      if (size < FILE_HEAD_LENGTH) {
        head.set(chunk.subarray(0, FILE_HEAD_LENGTH - size), size);
      }
      size += chunk.length;
      if (size > length) {
        done(new HttpError(413, 'ATTACHMENT_TOO_LARGE', 'The file is larger than announced'));
        return;
      }
      textScan.push(chunk);
      done(null, chunk);
    },
  });
  return {
    stream,
    result: () => ({
      size,
      head: head.subarray(0, Math.min(size, FILE_HEAD_LENGTH)),
      text: textScan.end(),
    }),
  };
}

/** Whether there was a file to remove: another sweep, or a keep, may have taken it first. */
async function removeIfThere(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

async function modifiedAt(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
