import { mergeSetlistOps } from '../src/setlists/merge';

describe('mergeSetlistOps', () => {
  it('keeps additive operations and ignores stale moves when server order wins', () => {
    const result = mergeSetlistOps(
      [
        { id: 'a', songVersionId: 's1', notes: null, durationSec: 100 },
        { id: 'b', songVersionId: 's2', notes: null, durationSec: 120 }
      ],
      [
        {
          op: 'move',
          clientOpId: 'c1',
          itemId: 'b',
          afterItemId: null
        },
        {
          op: 'add',
          clientOpId: 'c2',
          itemId: 'c',
          afterItemId: 'b',
          songVersionId: 's3',
          notes: 'encore'
        }
      ],
      true
    );

    expect(result.mergePatch.serverOrderWins).toBe(true);
    expect(result.mergePatch.ignoredOps).toContain('c1');
    expect(result.mergePatch.appliedOps).toContain('c2');
    expect(result.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes and updates items without conflict', () => {
    const result = mergeSetlistOps(
      [
        { id: 'a', songVersionId: 's1', notes: null, durationSec: 100 },
        { id: 'b', songVersionId: 's2', notes: null, durationSec: 120 }
      ],
      [
        {
          op: 'update',
          clientOpId: 'u1',
          itemId: 'a',
          notes: 'open with click',
          durationSec: 130
        },
        {
          op: 'remove',
          clientOpId: 'r1',
          itemId: 'b'
        }
      ],
      false
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.notes).toBe('open with click');
    expect(result.items[0]?.durationSec).toBe(130);
    expect(result.mergePatch.appliedOps).toEqual(expect.arrayContaining(['u1', 'r1']));
  });
});
