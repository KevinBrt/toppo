import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  fakeAttachment,
  fakeIssue,
  fakeProject,
  fakeServer,
  GRACE,
  memberOf,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
]);
const png = (name = 'capture.png') => new File([PNG_BYTES], name, { type: 'image/png' });
const csv = (name = 'export.csv') => new File(['Numéro;Montant\n1;12,50\n'], name);

/** WEB-1, reported by Ada, with these files: seen by `user`. */
function server(
  user = ADA,
  { archived = false, attachments = [fakeAttachment(1, 'a.csv', 'text/csv')] } = {},
) {
  const fake = fakeServer({
    user,
    projects: [
      fakeProject('WEB', 'Website', {
        archived,
        members: [
          { userId: ADA.id, roleId: null },
          { userId: GRACE.id, roleId: null },
        ],
      }),
    ],
    issues: [fakeIssue('WEB', 1, 'Empty CSV export')],
    attachments,
  });
  fake.state.users.push(memberOf(GRACE, ROLE_BADGES.team));
  return fake;
}

const request = () => page.getByRole('region', { name: 'Request' });
const activity = () => page.getByRole('region', { name: 'Activity' });

/** The file input of `within`: hidden, opened by a button or a link. */
function fileInput(within: Element = document.body): HTMLInputElement {
  const input = within.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) {
    throw new Error('No file input');
  }
  return input;
}

/** Drops files on an element, as a pointer would. */
function dropFiles(target: Element, files: File[]): void {
  const data = new DataTransfer();
  for (const file of files) {
    data.items.add(file);
  }
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(
      new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  }
}

describe('the files of an issue', () => {
  it('shows the request’s files, images as their own thumbnail, each one downloading', async () => {
    server(ADA, {
      attachments: [
        fakeAttachment(1, 'capture-export.png', 'image/png', { size: 248 * 1024 }),
        fakeAttachment(2, 'export-commandes.csv', 'text/csv', { size: 300 }),
      ],
    });
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(request().getByText('2 attachments')).toBeVisible();
    const image = request().getByRole('button', { name: /^View capture-export\.png\s+248\skB$/ });
    const sheet = request().getByRole('button', { name: /^View export-commandes\.csv\s+1\skB$/ });
    await expect.element(image).toBeVisible();
    expect(image.element().querySelector('img')?.getAttribute('src')).toBe(
      '/api/v1/issues/WEB-1/attachments/01a1569b-9900-7000-8000-000000001001/preview',
    );
    expect(sheet.element().querySelector('img')).toBeNull();
    await expect.element(sheet.getByText('CSV', { exact: true })).toBeInTheDocument();
    await expect
      .element(request().getByRole('link', { name: 'Download capture-export.png' }))
      .toHaveAttribute(
        'href',
        '/api/v1/issues/WEB-1/attachments/01a1569b-9900-7000-8000-000000001001/download',
      );
  });

  it('shows images in the app, one after the other, each opening alone or downloading', async () => {
    server(ADA, {
      attachments: [
        fakeAttachment(1, 'avant.png', 'image/png'),
        fakeAttachment(2, 'facture.pdf', 'application/pdf'),
        fakeAttachment(3, 'apres.png', 'image/png'),
      ],
    });
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await request()
      .getByRole('button', { name: /^View avant\.png/ })
      .click();
    const viewer = screen.getByRole('dialog', { name: 'avant.png' });
    await expect.element(viewer.getByRole('img', { name: 'avant.png' })).toBeVisible();
    await expect.element(viewer.getByText('1 of 2')).toBeVisible();
    await expect
      .element(viewer.getByRole('link', { name: 'Open in a new tab' }))
      .toHaveAttribute('target', '_blank');
    await expect
      .element(viewer.getByRole('link', { name: 'Download' }))
      .toHaveAttribute(
        'href',
        '/api/v1/issues/WEB-1/attachments/01a1569b-9900-7000-8000-000000001001/download',
      );

    // The PDF is not shown here: the arrows go from one image to the other.
    await viewer.getByRole('button', { name: 'Next file' }).click();
    await expect.element(screen.getByRole('dialog', { name: 'apres.png' })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(screen.getByRole('dialog', { name: 'avant.png' })).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(screen.getByText('2 of 2')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a text file as written, nothing interpreted', async () => {
    server(ADA, {
      attachments: [
        fakeAttachment(1, 'export.csv', 'text/csv', {
          content: 'Numéro;Montant\n<b>1</b>;12,50\n',
        }),
      ],
    });
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await request()
      .getByRole('button', { name: /^View export\.csv/ })
      .click();
    const words = screen
      .getByRole('dialog', { name: 'export.csv' })
      .getByRole('textbox', { name: 'Content of export.csv' });
    await expect.element(words).toHaveValue('Numéro;Montant\n<b>1</b>;12,50\n');
    await expect.element(words).toHaveAttribute('readonly');
  });

  it('offers to download a text file too large to be shown', async () => {
    server(ADA, {
      attachments: [fakeAttachment(1, 'huge.log', 'text/plain', { size: 2 * 1024 * 1024 })],
    });
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await request()
      .getByRole('button', { name: /^View huge\.log/ })
      .click();
    const viewer = screen.getByRole('dialog', { name: 'huge.log' });
    await expect
      .element(viewer.getByText('This file is too large to be shown here: download it to read it.'))
      .toBeVisible();
    await expect.element(viewer.getByRole('link', { name: 'Download' })).toBeVisible();
  });

  it('opens a PDF in a tab of its own, and downloads every other file', async () => {
    server(ADA, {
      attachments: [
        fakeAttachment(1, 'facture.pdf', 'application/pdf'),
        fakeAttachment(
          2,
          'budget.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ),
      ],
    });
    await renderApp({ path: '/issues/WEB-1' });

    const pdf = request().getByRole('link', {
      name: /^Open facture\.pdf\s+1\skB\s+\(opens in a new tab\)$/,
    });
    await expect
      .element(pdf)
      .toHaveAttribute(
        'href',
        '/api/v1/issues/WEB-1/attachments/01a1569b-9900-7000-8000-000000001001/preview',
      );
    await expect.element(pdf).toHaveAttribute('target', '_blank');
    const sheet = request().getByRole('link', { name: /^Download budget\.xlsx\s+1\skB$/ });
    await expect.element(sheet).toHaveAttribute('download', 'budget.xlsx');
    await expect
      .element(request().getByRole('link', { name: 'Download facture.pdf' }))
      .toHaveAttribute('download', 'facture.pdf');
  });

  it('attaches the files chosen at once, one after the other, then lists them', async () => {
    const fake = server(ADA, { attachments: [] });
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(request().getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await userEvent.upload(fileInput(request().element()), [png(), csv()]);

    await expect.element(request().getByText('2 attachments')).toBeVisible();
    await expect
      .element(request().getByRole('link', { name: /^Download capture\.png/ }))
      .toBeVisible();
    expect(fake.state.attachments.map(({ fileName, mediaType }) => [fileName, mediaType])).toEqual([
      ['capture.png', 'image/png'],
      ['export.csv', 'text/csv'],
    ]);
    expect(
      fake.requests.filter(({ method }) => method === 'POST').map(({ path }) => path),
    ).toStrictEqual(['/api/v1/issues/WEB-1/attachments', '/api/v1/issues/WEB-1/attachments']);
  });

  it('takes files dropped on the request, and tells it in the activity', async () => {
    const fake = server(ADA, { attachments: [] });
    await renderApp({ path: '/issues/WEB-1' });
    // Files are taken once the size limit is known.
    await expect.element(request().getByRole('button', { name: 'Attach files' })).toBeEnabled();

    // Dropped anywhere on the files' area: the event reaches it.
    dropFiles(request().getByText('Attachments').element(), [csv('dropped.csv')]);

    await expect.element(request().getByText('1 attachment')).toBeVisible();
    await expect
      .element(activity().getByText('Ada Lovelace attached dropped.csv', { exact: false }))
      .toBeVisible();
    expect(fake.state.attachments.map(({ fileName }) => fileName)).toStrictEqual(['dropped.csv']);
  });

  it('refuses at once a file of a type not accepted, or too large, saying why', async () => {
    const fake = server(ADA, { attachments: [] });
    fake.state.attachmentMaxSize = 10;
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(request().getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await userEvent.upload(fileInput(request().element()), [
      new File(['<svg/>'], 'logo.svg'),
      csv('big.csv'),
    ]);

    const refusal = request().getByRole('alert');
    await expect.element(refusal.getByText('These files were not added:')).toBeVisible();
    await expect
      .element(refusal.getByText('logo.svg: This type of file is not accepted.'))
      .toBeVisible();
    await expect.element(refusal.getByText(/^big\.csv: Larger than 1\skB\.$/)).toBeVisible();
    expect(fake.requests.some(({ method }) => method === 'POST')).toBe(false);
  });

  it('tells which files the server refused, and why, the others attached', async () => {
    server(ADA, { attachments: [] });
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(request().getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await userEvent.upload(fileInput(request().element()), [
      new File(['<!doctype html><script>alert(1)</script>'], 'fake.png'),
      csv(),
    ]);

    const refusal = request().getByRole('alert');
    await expect.element(refusal.getByText('These files could not be attached:')).toBeVisible();
    await expect
      .element(refusal.getByText('fake.png: Its content is not what its extension says.'))
      .toBeVisible();
    await expect.element(request().getByText('1 attachment')).toBeVisible();
  });

  it('removes a file for good after asking', async () => {
    const fake = server(ADA);
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await request().getByRole('button', { name: 'Remove a.csv' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Remove this file?' });
    await expect.element(dialog.getByText('a.csv is deleted for good.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove the file' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(request().getByRole('link', { name: /a\.csv/ })).not.toBeInTheDocument();
    expect(fake.state.attachments).toStrictEqual([]);
  });

  it('offers nothing but downloads on an archived project', async () => {
    server(ADA, { archived: true });
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(request().getByRole('link', { name: /^Download a\.csv/ })).toBeVisible();
    await expect
      .element(request().getByRole('button', { name: 'Attach files' }))
      .not.toBeInTheDocument();
    await expect
      .element(request().getByRole('button', { name: 'Remove a.csv' }))
      .not.toBeInTheDocument();
  });

  it('lets someone else remove only the files they may', async () => {
    server(GRACE, {
      attachments: [fakeAttachment(1, 'mine.csv', 'text/csv', { uploaderId: GRACE.id })],
    });
    await renderApp({ path: '/issues/WEB-1' });

    // Grace edits every issue: she attaches and removes files on Ada's request.
    await expect.element(request().getByRole('button', { name: 'Remove mine.csv' })).toBeVisible();
    await expect.element(request().getByRole('button', { name: 'Attach files' })).toBeVisible();
  });
});

describe('the files of a comment', () => {
  it('are sent with the comment, and shown with it', async () => {
    const fake = server(ADA, { attachments: [] });
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    const form = activity().getByRole('textbox', { name: 'Add a comment' });
    await form.fill('Here is the log.');
    const box = form.element().closest('form') ?? document.body;
    await expect.element(activity().getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await userEvent.upload(fileInput(box), [new File(['ERROR export\n'], 'trace.log')]);
    await expect.element(activity().getByText('trace.log')).toBeVisible();
    await screen.getByRole('button', { name: 'Send' }).click();

    const comment = activity().getByRole('listitem').filter({ hasText: 'Here is the log.' });
    await expect.element(comment.getByRole('link', { name: /^Download trace\.log/ })).toBeVisible();
    const [sent] = fake.state.attachments;
    expect(sent).toMatchObject({ fileName: 'trace.log', mediaType: 'text/plain' });
    expect(sent?.commentId).not.toBeNull();
    // A comment's file shows with it, never as a step of its own.
    await expect
      .element(activity().getByText('attached trace.log', { exact: false }))
      .not.toBeInTheDocument();
  });

  it('lets the author take a chosen file back before sending', async () => {
    server(ADA, { attachments: [] });
    await renderApp({ path: '/issues/WEB-1' });

    const field = activity().getByRole('textbox', { name: 'Add a comment' });
    await expect.element(field).toBeVisible();
    const box = field.element().closest('form') ?? document.body;
    await expect.element(activity().getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await userEvent.upload(fileInput(box), [csv('wrong.csv')]);
    await activity().getByRole('button', { name: 'Remove wrong.csv' }).click();

    await expect.element(activity().getByText('wrong.csv')).not.toBeInTheDocument();
  });
});

describe('the files of a new issue', () => {
  it('are chosen with the issue, sent once it is created, before it opens', async () => {
    const fake = server(ADA, { attachments: [] });
    const { screen, router } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    const zone = screen.getByRole('group', { name: 'Attachments' });
    await expect.element(zone.getByRole('button', { name: 'browse your computer' })).toBeVisible();
    await expect
      .element(zone.getByText(/Office and OpenDocument files · 20\sMB maximum per file$/))
      .toBeVisible();
    await userEvent.upload(fileInput(zone.element()), [png('erreur.png'), csv('oublie.csv')]);
    // The preview gets its address once drawn, after the file shows: wait for it.
    const thumbnailSource = () =>
      zone
        .getByText('erreur.png')
        .element()
        .closest('li')
        ?.querySelector('img')
        ?.getAttribute('src');
    await expect.poll(thumbnailSource).toMatch(/^blob:/);
    await zone.getByRole('button', { name: 'Remove oublie.csv' }).click();
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Invoices fail to download' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/issues/WEB-2');
    expect(fake.state.attachments.map(({ issueKey, fileName }) => [issueKey, fileName])).toEqual([
      ['WEB-2', 'erreur.png'],
    ]);
  });

  it('says which files could not be attached, the issue created all the same', async () => {
    const fake = server(ADA, { attachments: [] });
    const { screen, router } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    const zone = screen.getByRole('group', { name: 'Attachments' });
    await expect.element(zone.getByRole('button', { name: 'browse your computer' })).toBeVisible();
    await userEvent.upload(fileInput(zone.element()), [
      csv('ok.csv'),
      new File(['not a pdf'], 'facture.pdf'),
    ]);
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    const failure = screen.getByRole('alert');
    await expect
      .element(
        failure.getByText('The issue WEB-2 was created, but some files could not be attached:'),
      )
      .toBeVisible();
    await expect
      .element(failure.getByText('facture.pdf: Its content is not what its extension says.'))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Create the issue' }))
      .not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Open the issue' }).click();

    await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(router.state.location.pathname).toBe('/issues/WEB-2');
    expect(fake.state.issues).toHaveLength(2);
    expect(fake.state.attachments.map(({ fileName }) => fileName)).toStrictEqual(['ok.csv']);
  });

  it('reads in French', async () => {
    server({ ...ADA, locale: 'fr' }, { attachments: [] });
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    const zone = screen.getByRole('group', { name: 'Pièces jointes' });
    await expect
      .element(zone.getByRole('button', { name: 'parcourez votre ordinateur' }))
      .toBeVisible();
    await expect.element(zone.getByText(/20\sMo maximum par fichier$/)).toBeVisible();
  });
});
