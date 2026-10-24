import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

/** A message the test server took, its MIME source decoded enough to search its words. */
export interface ReceivedMail {
  from: string;
  to: string[];
  /** The `Subject` header, decoded. */
  subject: string;
  /** Every part of the message, quoted-printable undone: search it for words and links. */
  content: string;
}

export interface TestSmtpServer {
  port: number;
  received: ReceivedMail[];
  close(): Promise<void>;
}

/**
 * A mail server on a free local port that takes every message, for tests to read what was sent.
 * With `credentials`, it asks to sign in and refuses any other user name or password. Plain
 * connections only: no TLS.
 */
export async function startSmtpServer(credentials?: {
  username: string;
  password: string;
}): Promise<TestSmtpServer> {
  const received: ReceivedMail[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    converse(socket, credentials, (mail) => received.push(mail));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test mail server has no port');
  }
  return {
    port: address.port,
    received,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
      await once(server, 'close');
    },
  };
}

/** One SMTP session, line by line: just what Nodemailer says. */
function converse(
  socket: Socket,
  credentials: { username: string; password: string } | undefined,
  onMail: (mail: ReceivedMail) => void,
): void {
  const session = new SmtpSession(
    (line) => socket.write(`${line}\r\n`),
    () => socket.end(),
    credentials,
    onMail,
  );
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf('\r\n');
    while (end !== -1) {
      session.read(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\r\n');
    }
  });
  session.greet();
}

class SmtpSession {
  private envelope: { from: string; to: string[] } = { from: '', to: [] };
  /** The lines of the message being received, if one is. */
  private data: string[] | null = null;
  /** The user name given so far, while signing in with `AUTH LOGIN`. */
  private login: { user?: string } | null = null;

  private readonly reply: (line: string) => void;
  private readonly end: () => void;
  private readonly credentials: { username: string; password: string } | undefined;
  private readonly onMail: (mail: ReceivedMail) => void;

  constructor(
    reply: (line: string) => void,
    end: () => void,
    credentials: { username: string; password: string } | undefined,
    onMail: (mail: ReceivedMail) => void,
  ) {
    this.reply = reply;
    this.end = end;
    this.credentials = credentials;
    this.onMail = onMail;
  }

  greet(): void {
    this.reply('220 localhost test mail server');
  }

  read(line: string): void {
    if (this.data !== null) {
      this.readData(this.data, line);
    } else if (this.login !== null) {
      this.readLogin(this.login, Buffer.from(line, 'base64').toString('utf8'));
    } else {
      const [verb = '', ...rest] = line.split(' ');
      this.command(verb.toUpperCase(), rest.join(' '));
    }
  }

  private readData(data: string[], line: string): void {
    if (line !== '.') {
      data.push(line.startsWith('..') ? line.slice(1) : line);
      return;
    }
    this.onMail({ ...this.envelope, ...decoded(data.join('\r\n')) });
    this.data = null;
    this.reply('250 queued');
  }

  private readLogin(login: { user?: string }, value: string): void {
    if (login.user === undefined) {
      this.login = { user: value };
      this.reply('334 UGFzc3dvcmQ6');
      return;
    }
    this.signIn(login.user, value);
    this.login = null;
  }

  private signIn(user: string, pass: string): void {
    const { credentials } = this;
    const allowed =
      credentials === undefined || (user === credentials.username && pass === credentials.password);
    this.reply(allowed ? '235 signed in' : '535 refused');
  }

  private command(verb: string, argument: string): void {
    switch (verb) {
      case 'EHLO':
        this.reply(this.credentials ? '250-localhost' : '250 localhost');
        if (this.credentials) {
          this.reply('250 AUTH PLAIN LOGIN');
        }
        return;
      case 'AUTH':
        this.auth(argument);
        return;
      case 'MAIL':
        this.envelope = { from: addressIn(argument), to: [] };
        break;
      case 'RCPT':
        this.envelope.to.push(addressIn(argument));
        break;
      case 'DATA':
        this.data = [];
        this.reply('354 go on');
        return;
      case 'QUIT':
        this.reply('221 bye');
        this.end();
        return;
      default:
        break;
    }
    this.reply('250 ok');
  }

  private auth(argument: string): void {
    const [method = '', initial = ''] = argument.split(' ');
    if (method.toUpperCase() === 'LOGIN') {
      this.login = {};
      this.reply('334 VXNlcm5hbWU6');
      return;
    }
    const [, user = '', pass = ''] = Buffer.from(initial, 'base64').toString('utf8').split('\0');
    this.signIn(user, pass);
  }
}

const addressIn = (argument: string) => /<([^>]*)>/u.exec(argument)?.[1] ?? '';

/** The subject and the words of a MIME source, as a reader sees them. */
function decoded(source: string): Pick<ReceivedMail, 'subject' | 'content'> {
  const headerEnd = source.indexOf('\r\n\r\n');
  const headers = source.slice(0, headerEnd).replaceAll(/\r\n[ \t]+/gu, ' ');
  const subject = /^Subject: (.*)$/imu.exec(headers)?.[1] ?? '';
  return {
    subject: subject.replaceAll(
      /=\?utf-8\?([bq])\?([^?]*)\?=\s*/giu,
      (_, kind: string, text: string) =>
        kind.toLowerCase() === 'b'
          ? Buffer.from(text, 'base64').toString('utf8')
          : quotedPrintable(text.replaceAll('_', ' ')),
    ),
    content: quotedPrintable(source.slice(headerEnd + 4).replaceAll(/=\r\n/gu, '')),
  };
}

function quotedPrintable(text: string): string {
  return text.replaceAll(/(?:=[0-9A-F]{2})+/gu, (bytes) =>
    Buffer.from(bytes.replaceAll('=', ''), 'hex').toString('utf8'),
  );
}
