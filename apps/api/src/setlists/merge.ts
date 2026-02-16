import type { SetlistOperation } from './types';

export interface SetlistMergeItem {
  id: string;
  songVersionId: string;
  notes: string | null;
  durationSec: number | null;
}

export interface SetlistMergeResult {
  items: SetlistMergeItem[];
  mergePatch: {
    appliedOps: string[];
    ignoredOps: string[];
    serverOrderWins: boolean;
    finalOrder: string[];
  };
}

function insertAfter(items: SetlistMergeItem[], item: SetlistMergeItem, afterItemId: string | null): SetlistMergeItem[] {
  if (!afterItemId) {
    return [item, ...items];
  }

  const index = items.findIndex((i) => i.id === afterItemId);
  if (index < 0) return [...items, item];

  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

/**
 * 3-way style merge for setlist operations:
 * - Always preserve additive operations when item IDs are new.
 * - On ordering conflicts (client based on stale version), server order wins.
 * - Removals/updates still apply if the target item exists.
 */
export function mergeSetlistOps(
  serverItems: SetlistMergeItem[],
  operations: SetlistOperation[],
  hasOrderingConflict: boolean
): SetlistMergeResult {
  let working = [...serverItems];
  const appliedOps: string[] = [];
  const ignoredOps: string[] = [];

  for (const op of operations) {
    if (op.op === 'add') {
      if (working.some((item) => item.id === op.itemId)) {
        ignoredOps.push(op.clientOpId);
        continue;
      }
      working = insertAfter(
        working,
        {
          id: op.itemId,
          songVersionId: op.songVersionId,
          notes: op.notes ?? null,
          durationSec: null
        },
        op.afterItemId
      );
      appliedOps.push(op.clientOpId);
      continue;
    }

    if (op.op === 'move') {
      const index = working.findIndex((item) => item.id === op.itemId);
      if (index < 0) {
        ignoredOps.push(op.clientOpId);
        continue;
      }

      if (hasOrderingConflict) {
        ignoredOps.push(op.clientOpId);
        continue;
      }

      const [moved] = working.splice(index, 1);
      if (!moved) {
        ignoredOps.push(op.clientOpId);
        continue;
      }
      working = insertAfter(working, moved, op.afterItemId);
      appliedOps.push(op.clientOpId);
      continue;
    }

    if (op.op === 'remove') {
      const before = working.length;
      working = working.filter((item) => item.id !== op.itemId);
      if (working.length === before) {
        ignoredOps.push(op.clientOpId);
      } else {
        appliedOps.push(op.clientOpId);
      }
      continue;
    }

    if (op.op === 'update') {
      const index = working.findIndex((item) => item.id === op.itemId);
      if (index < 0) {
        ignoredOps.push(op.clientOpId);
        continue;
      }

      const current = working[index];
      if (!current) {
        ignoredOps.push(op.clientOpId);
        continue;
      }

      working[index] = {
        ...current,
        notes: op.notes ?? current.notes,
        durationSec: op.durationSec ?? current.durationSec
      };

      appliedOps.push(op.clientOpId);
    }
  }

  return {
    items: working,
    mergePatch: {
      appliedOps,
      ignoredOps,
      serverOrderWins: hasOrderingConflict,
      finalOrder: working.map((item) => item.id)
    }
  };
}
