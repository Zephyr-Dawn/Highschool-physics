export const QUESTION_STATS = {
  total: 132,
  byModel: {
    p01: 14,
    p02: 8,
    p03: 8,
    p04: 8,
    p05: 8,
    p06: 8,
    p07: 8,
    p08: 8,
    i01: 8,
    i02: 8,
    i03: 6,
    i04: 8,
    i05: 8,
    i06: 8,
    i07: 8,
    i08: 8,
  },
} as const;

export function questionCount(modelId: keyof typeof QUESTION_STATS.byModel): number {
  return QUESTION_STATS.byModel[modelId];
}
