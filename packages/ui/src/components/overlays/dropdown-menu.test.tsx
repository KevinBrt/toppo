import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from '../button.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx';

function Actions({ onDeactivate }: { onDeactivate: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Actions for Grace</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onDeactivate}>Deactivate</DropdownMenuItem>
        <DropdownMenuItem disabled>Reactivate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('opens an accessible menu and runs the chosen action', async () => {
    const onDeactivate = vi.fn();
    const screen = await render(<Actions onDeactivate={onDeactivate} />);

    await screen.getByRole('button', { name: 'Actions for Grace' }).click();
    await screen.getByRole('menuitem', { name: 'Deactivate' }).click();

    expect(onDeactivate).toHaveBeenCalledOnce();
    await expect.element(screen.getByRole('menu')).not.toBeInTheDocument();
  });

  it('heads items with a label that is not itself a choice', async () => {
    const screen = await render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Labels</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Add</DropdownMenuLabel>
          <DropdownMenuItem aria-label="Add Mobile">Mobile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await screen.getByRole('button', { name: 'Labels' }).click();

    await expect.element(screen.getByRole('menu').getByText('Add', { exact: true })).toBeVisible();
    expect(screen.getByRole('menuitem').elements()).toHaveLength(1);
  });

  it('works with the keyboard and gives focus back to its trigger', async () => {
    const screen = await render(<Actions onDeactivate={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Actions for Grace' });

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByRole('menu')).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await expect.element(screen.getByRole('menu')).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it('marks unavailable actions as disabled', async () => {
    const screen = await render(<Actions onDeactivate={vi.fn()} />);

    await screen.getByRole('button', { name: 'Actions for Grace' }).click();

    await expect
      .element(screen.getByRole('menuitem', { name: 'Reactivate' }))
      .toHaveAttribute('aria-disabled', 'true');
  });
});

/** Statuses to show, several at once: the menu stays open while choosing. */
function StatusFilter() {
  const [chosen, setChosen] = useState<string[]>(['New']);
  const toggle = (status: string, checked: boolean) =>
    setChosen((current) =>
      checked ? [...current, status] : current.filter((value) => value !== status),
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Status: {chosen.join(', ')}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {['New', 'Done'].map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={chosen.includes(status)}
            onCheckedChange={(checked) => toggle(status, checked)}
            onSelect={(event) => event.preventDefault()}
          >
            {status}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenuCheckboxItem', () => {
  it('marks each chosen option, and takes or leaves one at a time', async () => {
    const screen = await render(<StatusFilter />);

    await screen.getByRole('button', { name: 'Status: New' }).click();
    await expect
      .element(screen.getByRole('menuitemcheckbox', { name: 'New' }))
      .toHaveAttribute('aria-checked', 'true');
    await screen.getByRole('menuitemcheckbox', { name: 'Done' }).click();
    await screen.getByRole('menuitemcheckbox', { name: 'New' }).click();

    await expect
      .element(screen.getByRole('menuitemcheckbox', { name: 'Done' }))
      .toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Escape}');
    await expect.element(screen.getByRole('button', { name: 'Status: Done' })).toBeVisible();
  });
});
