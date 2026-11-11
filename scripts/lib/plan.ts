/** Walks a MongoDB explain() winning plan and collects stage names. */
type PlanNode = { stage?: string; indexName?: string; inputStage?: PlanNode; inputStages?: PlanNode[]; queryPlan?: PlanNode };

function walk(node: PlanNode | undefined, stages: string[], indexes: string[]) {
  if (!node) return;
  if (node.stage) stages.push(node.stage);
  if (node.indexName) indexes.push(node.indexName);
  walk(node.queryPlan, stages, indexes);
  walk(node.inputStage, stages, indexes);
  node.inputStages?.forEach((n) => walk(n, stages, indexes));
}

export function summarizePlan(explain: unknown): { stages: string[]; indexes: string[]; usesIndex: boolean; collScan: boolean; inMemorySort: boolean } {
  const stages: string[] = [];
  const indexes: string[] = [];
  const e = explain as Record<string, any>;
  // find() explain, or aggregate() explain (first $cursor stage / top-level queryPlanner)
  const planner = e.queryPlanner ?? e.stages?.[0]?.$cursor?.queryPlanner ?? e.shards ?? {};
  walk(planner.winningPlan, stages, indexes);
  return {
    stages,
    indexes,
    usesIndex: stages.some((s) => ['IXSCAN', 'COUNT_SCAN', 'DISTINCT_SCAN', 'EXPRESS_IXSCAN'].includes(s)),
    collScan: stages.includes('COLLSCAN'),
    inMemorySort: stages.includes('SORT'),
  };
}
