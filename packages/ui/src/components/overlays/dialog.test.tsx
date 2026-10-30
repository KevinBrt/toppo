import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from '../button.tsx';
import { Dialog, DialogContent, DialogTrigger } from './dialog.tsx';

function Invite() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Invite members</Button>
      </DialogTrigger>
      <DialogContent
        title="Invite members"
        description="They get a link to choose a password."
        closeLabel="Close"
      >
        <input aria-label="Emails" />
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('opens a modal dialog named and described by its title and description', async () => {
    const screen = await render(<Invite />);

    await screen.getByRole('button', { name: 'Invite members' }).click();

    const dialog = screen.getByRole('dialog', { name: 'Invite members' });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription('They get a link to choose a password.');
  });

  it('closes with Escape and gives focus back to the trigger', async () => {
    const screen = await render(<Invite />);
    const trigger = screen.getByRole('button', { name: 'Invite members' });
    await trigger.click();

    await userEvent.keyboard('{Escape}');

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });
});

/** The layer an element is drawn on, by its `z-*` class. */
function layerOf(element: Element): number {
  return Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(element.className)?.[1] ?? Number.NaN);
}

describe('A dialog opened over another', () => {
  it('darkens that one too, as it darkens the page', async () => {
    const screen = await render(
      <Dialog defaultOpen>
        <DialogContent title="Log time" closeLabel="Close">
          <Dialog defaultOpen>
            <DialogContent title="Choose an issue" closeLabel="Close">
              <input aria-label="Search" />
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>,
    );

    const below = screen.getByRole('dialog', { name: 'Log time', includeHidden: true }).element();
    const above = screen.getByRole('dialog', { name: 'Choose an issue' }).element();
    const backdrop = above.previousElementSibling;
    if (!backdrop) {
      throw new Error('The dialog above has no backdrop');
    }
    // Painted over the dialog below: on its layer (as the styles of the application set it), and
    // after it.
    expect(layerOf(backdrop)).toBeGreaterThanOrEqual(layerOf(below));
    expect(below.compareDocumentPosition(backdrop) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('Dialog with its title hidden', () => {
  it('is still named by its title, read but not shown', async () => {
    const screen = await render(
      <Dialog defaultOpen>
        <DialogContent title="Search" closeLabel="Close" hideTitle>
          <input aria-label="Search issues" />
        </DialogContent>
      </Dialog>,
    );

    await expect.element(screen.getByRole('dialog', { name: 'Search' })).toBeVisible();
    // Visually hidden: the styles of the application keep it for screen readers only.
    await expect.element(screen.getByText('Search', { exact: true })).toHaveClass('sr-only');
  });
});
