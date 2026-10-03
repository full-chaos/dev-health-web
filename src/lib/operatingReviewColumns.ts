/** Rows of equal length, at most 5 wide: 3 -> 3, 4 -> 4, 6 -> 3, 7 -> 4, 8 -> 4. No empty cell. */
export function balancedColumns(count: number): number {
    if (count <= 0) return 1;
    return Math.ceil(count / Math.ceil(count / 5));
}
