import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OSTCard } from '@/components/ost/OSTCard';
import { ProjectName } from '@/components/ost/header/ProjectName';
import { useOSTStore } from '@/store/ostStore';

// Live-commit prevents data loss when the cloud poll calls loadFromStoredShare
// — that action resets editingCardId/UI state, which would otherwise unmount
// inline inputs and throw away their component-local "draft" text.

describe('inline editor live commit', () => {
  beforeEach(() => {
    useOSTStore.getState().resetTree();
  });

  it('OSTCard title input writes to the store on every keystroke', () => {
    const id = useOSTStore.getState().addCard('outcome', null, 'Old Title');
    useOSTStore.getState().setEditingCard(id);

    const card = useOSTStore.getState().tree.cards[id];
    render(<OSTCard card={card} />);

    const input = screen.getByTestId('card-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Title' } });

    expect(useOSTStore.getState().tree.cards[id].title).toBe('New Title');
  });

  it('OSTCard title input does NOT commit empty/whitespace-only values', () => {
    const id = useOSTStore.getState().addCard('outcome', null, 'Old Title');
    useOSTStore.getState().setEditingCard(id);

    const card = useOSTStore.getState().tree.cards[id];
    render(<OSTCard card={card} />);

    const input = screen.getByTestId('card-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });

    // Whitespace-only should be preserved in the editor draft but not committed,
    // so the previous title survives if the user blurs/escapes.
    expect(useOSTStore.getState().tree.cards[id].title).toBe('Old Title');
  });

  it('ProjectName input writes to the store on every keystroke', () => {
    render(<ProjectName />);

    fireEvent.click(screen.getByTestId('project-name-button'));
    const input = screen.getByTestId('project-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Renamed Tree' } });

    expect(useOSTStore.getState().projectName).toBe('My Renamed Tree');
  });

  it('Escape reverts OSTCard title to its pre-edit value', () => {
    const id = useOSTStore.getState().addCard('outcome', null, 'Old Title');
    useOSTStore.getState().setEditingCard(id);

    const card = useOSTStore.getState().tree.cards[id];
    render(<OSTCard card={card} />);

    const input = screen.getByTestId('card-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should Be Cancelled' } });
    expect(useOSTStore.getState().tree.cards[id].title).toBe('Should Be Cancelled');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useOSTStore.getState().tree.cards[id].title).toBe('Old Title');
    expect(useOSTStore.getState().editingCardId).toBeNull();
  });

  it('Escape reverts ProjectName to its pre-edit value', () => {
    useOSTStore.setState({ projectName: 'Original Name' });
    render(<ProjectName />);

    fireEvent.click(screen.getByTestId('project-name-button'));
    const input = screen.getByTestId('project-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should Be Cancelled' } });
    expect(useOSTStore.getState().projectName).toBe('Should Be Cancelled');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useOSTStore.getState().projectName).toBe('Original Name');
  });
});
