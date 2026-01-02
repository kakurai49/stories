export type CoverageItem = string;
type CandidateLike = { path: string };

export type CoverageState = {
  covered: Set<CoverageItem>;
  df: Map<CoverageItem, number>;
  pageCount: number;
  pathToObserved: Map<string, Set<CoverageItem>>;
  candidateSeenCount: Map<string, number>;
};

export function createCoverageState(): CoverageState {
  return {
    covered: new Set<CoverageItem>(),
    df: new Map<CoverageItem, number>(),
    pageCount: 0,
    pathToObserved: new Map<string, Set<CoverageItem>>(),
    candidateSeenCount: new Map<string, number>(),
  };
}

export function updateCoverage(state: CoverageState, path: string, observed: Set<CoverageItem>) {
  state.pageCount += 1;

  const observedOnce = new Set(observed);
  state.pathToObserved.set(path, new Set(observedOnce));

  for (const item of observedOnce) {
    state.covered.add(item);
    const prev = state.df.get(item) ?? 0;
    state.df.set(item, prev + 1);
  }
}

export function recordCandidateSeen(coverage: CoverageState, candidates: CandidateLike[]) {
  for (const candidate of candidates) {
    const prev = coverage.candidateSeenCount.get(candidate.path) ?? 0;
    coverage.candidateSeenCount.set(candidate.path, prev + 1);
  }
}
