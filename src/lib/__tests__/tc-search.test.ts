import { describe, it, expect } from 'vitest';
import { cosineSimilarity, rankChunks } from '../tc-search';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('handles non-unit vectors', () => {
    const a = [3, 4];
    const b = [6, 8]; // same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe('rankChunks', () => {
  const chunks = [
    { sectionId: 'A', title: 'First', text: 'aaa', embedding: [1, 0, 0] },
    { sectionId: 'B', title: 'Second', text: 'bbb', embedding: [0, 1, 0] },
    { sectionId: 'C', title: 'Third', text: 'ccc', embedding: [0, 0, 1] },
  ];

  it('ranks by cosine similarity descending', () => {
    const queryEmbedding = [1, 0.1, 0]; // closest to A
    const results = rankChunks(queryEmbedding, chunks, 3);
    expect(results[0].sectionId).toBe('A');
  });

  it('respects topK limit', () => {
    const results = rankChunks([1, 1, 1], chunks, 2);
    expect(results).toHaveLength(2);
  });

  it('returns all chunks if topK exceeds length', () => {
    const results = rankChunks([1, 1, 1], chunks, 10);
    expect(results).toHaveLength(3);
  });
});
