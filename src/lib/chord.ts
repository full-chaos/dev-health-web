import type {
  ChordDataset,
  ChordDirection,
  ChordGroupingDimension,
  ChordNode,
  ChordRecord,
  ChordSummary,
} from "@/lib/types";

const OTHER_ID = "__other__";
const DEFAULT_OTHER_LABEL = "Other";
const DEFAULT_TOP_N = 8;
const DEFAULT_TOP_K = 5;
const DEFAULT_DIRECTION: ChordDirection = "bilateral";

const sumMatrix = (matrix: number[][]): number =>
  matrix.reduce((acc, row) => acc + row.reduce((a, v) => a + v, 0), 0);

const cloneMatrix = (matrix: number[][]): number[][] => matrix.map((row) => row.slice());

const zeroMatrix = (n: number): number[][] =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

/**
 * Normalize raw chord records by merging duplicates and filtering invalid edges.
 *
 * Semantics:
 * - Duplicate `(source, target)` pairs are collapsed; their `value` fields sum.
 * - Edges with `value <= 0` are dropped.
 * - Self-links (`source === target`) are dropped unless `includeSelfLinks` is true.
 * - Metadata from the first occurrence of a `(source, target)` pair is preserved.
 * - Input is never mutated; a fresh array of fresh records is returned.
 *
 * @param records Raw chord records from the adapter layer.
 * @param opts.includeSelfLinks When true, keeps edges where `source === target`.
 * @returns A new, deduplicated, validated array of `ChordRecord`.
 */
export function normalizeChordRecords(
  records: ChordRecord[],
  opts: { includeSelfLinks?: boolean } = {},
): ChordRecord[] {
  const { includeSelfLinks = false } = opts;
  const merged = new Map<string, ChordRecord>();
  for (const record of records) {
    if (record.value <= 0) {
      continue;
    }
    if (!includeSelfLinks && record.source === record.target) {
      continue;
    }
    const key = `${record.source}\u0000${record.target}`;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, value: existing.value + record.value });
    } else {
      merged.set(key, { ...record });
    }
  }
  return Array.from(merged.values());
}

/**
 * Build a square N×N flow matrix from normalized records.
 *
 * Nodes are sorted by total magnitude descending where
 * `total(i) = row_sum(i) + col_sum(i)`. Stable tie-break is by `label`
 * lexicographic ascending. Array position IS the matrix index.
 *
 * `matrix[i][j]` represents flow from node `i` to node `j`.
 *
 * @param records Normalized records (typically from `normalizeChordRecords`).
 * @returns Nodes in final index order plus the N×N flow matrix.
 */
export function buildChordMatrix(records: ChordRecord[]): {
  nodes: ChordNode[];
  matrix: number[][];
} {
  if (records.length === 0) {
    return { nodes: [], matrix: [] };
  }

  const idSet = new Set<string>();
  for (const record of records) {
    idSet.add(record.source);
    idSet.add(record.target);
  }
  const ids = Array.from(idSet);

  const totals = new Map<string, number>();
  for (const id of ids) {
    totals.set(id, 0);
  }
  for (const record of records) {
    totals.set(record.source, (totals.get(record.source) ?? 0) + record.value);
    totals.set(record.target, (totals.get(record.target) ?? 0) + record.value);
  }

  const sortedIds = ids.slice().sort((a, b) => {
    const diff = (totals.get(b) ?? 0) - (totals.get(a) ?? 0);
    if (diff !== 0) {
      return diff;
    }
    return a.localeCompare(b);
  });

  const indexById = new Map(sortedIds.map((id, idx) => [id, idx]));
  const size = sortedIds.length;
  const matrix = zeroMatrix(size);

  for (const record of records) {
    const i = indexById.get(record.source);
    const j = indexById.get(record.target);
    if (i === undefined || j === undefined) {
      continue;
    }
    matrix[i][j] += record.value;
  }

  const nodes: ChordNode[] = sortedIds.map((id) => ({ id, label: id }));
  return { nodes, matrix };
}

/**
 * Limit the chord node count to `topN`, aggregating the overflow into an
 * "Other" bucket appended at the end of the array.
 *
 * Semantics:
 * - If `nodes.length <= topN`: return fresh clones of inputs with `otherShare: 0`.
 * - Otherwise: keep the first `(topN - 1)` nodes (assumed pre-sorted by
 *   magnitude) and collapse the rest into a single `"Other"` node with
 *   `isOther: true`, `id: "__other__"`, `label: opts.otherLabel ?? "Other"`.
 * - The new matrix sums all incoming/outgoing/self flow of dropped nodes into
 *   the Other row/column/diagonal.
 * - `otherShare` is the fraction of ORIGINAL total flow that touches Other
 *   (i.e. flow involving at least one dropped node) — always in `[0, 1]`.
 *
 * @param nodes Input nodes (typically from `buildChordMatrix`, magnitude-sorted).
 * @param matrix Square N×N flow matrix aligned with `nodes`.
 * @param topN Maximum number of nodes in the output (including Other).
 * @param opts.otherLabel Custom label for the Other bucket.
 * @returns New nodes/matrix with Other appended, plus the overflow share.
 */
export function limitChordNodesTopN(
  nodes: ChordNode[],
  matrix: number[][],
  topN: number,
  opts: { otherLabel?: string } = {},
): { nodes: ChordNode[]; matrix: number[][]; otherShare: number } {
  const { otherLabel = DEFAULT_OTHER_LABEL } = opts;
  const n = nodes.length;

  if (n <= topN) {
    return {
      nodes: nodes.map((node) => ({ ...node })),
      matrix: cloneMatrix(matrix),
      otherShare: 0,
    };
  }

  const keepCount = Math.max(0, topN - 1);
  const newSize = keepCount + 1;
  const otherIdx = keepCount;
  const origTotal = sumMatrix(matrix);

  const newMatrix = zeroMatrix(newSize);
  const mapIdx = (oldIdx: number): number => (oldIdx < keepCount ? oldIdx : otherIdx);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const value = matrix[i][j];
      if (value === 0) {
        continue;
      }
      newMatrix[mapIdx(i)][mapIdx(j)] += value;
    }
  }

  const newNodes: ChordNode[] = [];
  for (let i = 0; i < keepCount; i++) {
    newNodes.push({ ...nodes[i] });
  }
  newNodes.push({
    id: OTHER_ID,
    label: otherLabel,
    isOther: true,
  });

  let keptKeptSum = 0;
  for (let i = 0; i < keepCount; i++) {
    for (let j = 0; j < keepCount; j++) {
      keptKeptSum += matrix[i][j];
    }
  }
  const otherFlow = origTotal - keptKeptSum;
  const otherShare = origTotal > 0 ? otherFlow / origTotal : 0;

  return { nodes: newNodes, matrix: newMatrix, otherShare };
}

/**
 * Apply a directional transform to an N×N flow matrix.
 *
 * - `"bilateral"`: `out[i][j] = m[i][j] + m[j][i]` (symmetric; diagonal doubles).
 * - `"in"`:        `out[i][j] = m[j][i]`           (transpose — incoming view).
 * - `"out"`:       `out[i][j] = m[i][j]`           (unchanged — outgoing view).
 * - `"net"`:       `out[i][j] = max(0, m[i][j] - m[j][i])` (positive net flow).
 *
 * Input is never mutated — a fresh N×N matrix is returned.
 *
 * @param matrix Square N×N flow matrix.
 * @param direction Directional mode to apply.
 * @returns A new N×N matrix reflecting the selected direction.
 */
export function applyChordDirection(matrix: number[][], direction: ChordDirection): number[][] {
  const n = matrix.length;
  const out = zeroMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      switch (direction) {
        case "bilateral":
          out[i][j] = matrix[i][j] + matrix[j][i];
          break;
        case "in":
          out[i][j] = matrix[j][i];
          break;
        case "out":
          out[i][j] = matrix[i][j];
          break;
        case "net":
          out[i][j] = Math.max(0, matrix[i][j] - matrix[j][i]);
          break;
      }
    }
  }
  return out;
}

/**
 * Derive companion-panel insights from a finalized (post-direction) matrix.
 *
 * - `topImporters`: nodes where `incoming > outgoing`, sorted by incoming
 *   descending, then by label ascending; value is `net = incoming - outgoing`.
 * - `topExporters`: nodes where `outgoing > incoming`, sorted by outgoing
 *   descending, then by label ascending; value is `net = outgoing - incoming`.
 * - `strongestBilateral`: unique unordered pairs `(i, j)` with `i < j` ranked
 *   by `m[i][j] + m[j][i]` descending; self-pairs excluded.
 * - `otherShare`: fraction of total matrix flow involving the `isOther` node,
 *   or `0` if no Other node is present.
 *
 * All lists are capped at `topK` entries (default 5).
 *
 * @param nodes Final node list (post top-N).
 * @param matrix Final N×N matrix (post direction).
 * @param topK Maximum entries per list.
 * @returns Summary insights for the chord companion panel.
 */
export function computeChordSummary(
  nodes: ChordNode[],
  matrix: number[][],
  topK: number = DEFAULT_TOP_K,
): ChordSummary {
  const n = nodes.length;
  if (n === 0 || matrix.length === 0) {
    return {
      topImporters: [],
      topExporters: [],
      strongestBilateral: [],
      otherShare: 0,
    };
  }

  const incoming = new Array<number>(n).fill(0);
  const outgoing = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      outgoing[i] += matrix[i][j];
      incoming[j] += matrix[i][j];
    }
  }

  const importerCandidates = nodes
    .map((node, idx) => ({ idx, node }))
    .filter(({ idx }) => incoming[idx] > outgoing[idx])
    .sort((a, b) => {
      const diff = incoming[b.idx] - incoming[a.idx];
      if (diff !== 0) {
        return diff;
      }
      return a.node.label.localeCompare(b.node.label);
    });

  const exporterCandidates = nodes
    .map((node, idx) => ({ idx, node }))
    .filter(({ idx }) => outgoing[idx] > incoming[idx])
    .sort((a, b) => {
      const diff = outgoing[b.idx] - outgoing[a.idx];
      if (diff !== 0) {
        return diff;
      }
      return a.node.label.localeCompare(b.node.label);
    });

  const topImporters = importerCandidates.slice(0, topK).map(({ idx, node }) => ({
    id: node.id,
    label: node.label,
    net: incoming[idx] - outgoing[idx],
  }));

  const topExporters = exporterCandidates.slice(0, topK).map(({ idx, node }) => ({
    id: node.id,
    label: node.label,
    net: outgoing[idx] - incoming[idx],
  }));

  type BilateralPair = {
    a: string;
    b: string;
    aLabel: string;
    bLabel: string;
    bilateralValue: number;
  };
  const bilateralPairs: BilateralPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const value = matrix[i][j] + matrix[j][i];
      if (value > 0) {
        bilateralPairs.push({
          a: nodes[i].id,
          b: nodes[j].id,
          aLabel: nodes[i].label,
          bLabel: nodes[j].label,
          bilateralValue: value,
        });
      }
    }
  }
  bilateralPairs.sort((a, b) => {
    if (b.bilateralValue !== a.bilateralValue) {
      return b.bilateralValue - a.bilateralValue;
    }
    const aKey = `${a.aLabel}\u0000${a.bLabel}`;
    const bKey = `${b.aLabel}\u0000${b.bLabel}`;
    return aKey.localeCompare(bKey);
  });
  const strongestBilateral = bilateralPairs.slice(0, topK).map((pair) => ({
    a: pair.a,
    b: pair.b,
    bilateralValue: pair.bilateralValue,
  }));

  const otherIdx = nodes.findIndex((node) => node.isOther === true);
  let otherShare = 0;
  if (otherIdx >= 0) {
    const total = incoming.reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      const rowSum = outgoing[otherIdx];
      const colSum = incoming[otherIdx];
      const diag = matrix[otherIdx][otherIdx];
      otherShare = (rowSum + colSum - diag) / total;
    }
  }

  return {
    topImporters,
    topExporters,
    strongestBilateral,
    otherShare,
  };
}

/**
 * End-to-end orchestrator: build a fully processed chord dataset ready for
 * ECharts `series.type: "chord"` consumption.
 *
 * Pipeline:
 *   1. `normalizeChordRecords(records, { includeSelfLinks })`
 *   2. `buildChordMatrix(...)`
 *   3. `limitChordNodesTopN(..., topN ?? 8, { otherLabel })`
 *   4. `applyChordDirection(..., direction ?? "bilateral")`
 *   5. `computeChordSummary(...)` (then `otherShare` is back-filled from
 *      step 3 so the fraction reflects pre-direction ingestion).
 *
 * `totalFlow` is the sum of all matrix entries, halved for `"bilateral"` to
 * avoid double-counting the symmetric pairs.
 *
 * @param records Raw records from the adapter layer.
 * @param opts Pipeline options; `grouping` is required for downstream labeling.
 * @returns A `ChordDataset` ready to render.
 */
export function buildChordDataset(
  records: ChordRecord[],
  opts: {
    topN?: number;
    includeSelfLinks?: boolean;
    direction?: ChordDirection;
    grouping: ChordGroupingDimension;
    unit?: string;
    otherLabel?: string;
  },
): ChordDataset {
  const {
    topN = DEFAULT_TOP_N,
    includeSelfLinks = false,
    direction = DEFAULT_DIRECTION,
    grouping,
    unit,
    otherLabel = DEFAULT_OTHER_LABEL,
  } = opts;

  const normalized = normalizeChordRecords(records, { includeSelfLinks });
  const { nodes: builtNodes, matrix: builtMatrix } = buildChordMatrix(normalized);
  const limited = limitChordNodesTopN(builtNodes, builtMatrix, topN, { otherLabel });
  const directed = applyChordDirection(limited.matrix, direction);
  const summary = computeChordSummary(limited.nodes, directed);

  const finalSummary: ChordSummary = {
    ...summary,
    otherShare: limited.otherShare,
  };

  const rawTotal = sumMatrix(directed);
  const totalFlow = direction === "bilateral" ? rawTotal / 2 : rawTotal;

  const annotatedNodes: ChordNode[] = limited.nodes.map((node) => ({
    ...node,
    group: node.group ?? (node.isOther ? node.group : grouping),
  }));

  return {
    nodes: annotatedNodes,
    matrix: directed,
    totalFlow,
    summary: finalSummary,
    grouping,
    unit,
  };
}
