/*
 * Point markers, from the 8x8 X bitmaps in LBL/bitmaps/mark*.11.
 * Each byte is one row, least significant bit leftmost.
 */

export const MARK_W = 8;
export const MARK_H = 8;
export const MARK_CX = 3;	/* hot spot */
export const MARK_CY = 3;

const BITS: number[][] = [
	/* in the order draw.c used them: 1, 2, 9, 3, 4, 5, 6, 7, 8 */
	[0x00, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x00, 0x00],	/* mark1 */
	[0x00, 0x3e, 0x22, 0x22, 0x22, 0x3e, 0x00, 0x00],	/* mark2 */
	[0x00, 0x1c, 0x3e, 0x3e, 0x3e, 0x1c, 0x00, 0x00],	/* mark9 */
	[0x00, 0x1c, 0x36, 0x22, 0x36, 0x1c, 0x00, 0x00],	/* mark3 */
	[0x00, 0x22, 0x14, 0x08, 0x14, 0x22, 0x00, 0x00],	/* mark4 */
	[0x00, 0x08, 0x14, 0x22, 0x14, 0x08, 0x00, 0x00],	/* mark5 */
	[0x00, 0x1c, 0x14, 0x1c, 0x14, 0x1c, 0x00, 0x00],	/* mark6 */
	[0x00, 0x1c, 0x2a, 0x36, 0x2a, 0x1c, 0x00, 0x00],	/* mark7 */
	[0x00, 0x3e, 0x1c, 0x08, 0x1c, 0x3e, 0x00, 0x00],	/* mark8 */
];

/* A mark as horizontal runs [x, y, len] relative to its top-left. */
export type Mark = [number, number, number][];

function toRuns(rows: number[]): Mark {
	const runs: Mark = [];
	rows.forEach((row, y) => {
		let x = 0;
		while (x < MARK_W) {
			if (row & (1 << x)) {
				let n = 0;
				while (x + n < MARK_W && row & (1 << (x + n)))
					++n;
				runs.push([x, y, n]);
				x += n;
			} else
				++x;
		}
	});
	return runs;
}

const MARKS: Mark[] = BITS.map(toRuns);

export function markFor(setno: number): Mark {
	return MARKS[setno % MARKS.length];
}

/* Fills the mark with its top-left corner at (x, y). */
export function fillMark(ctx: CanvasRenderingContext2D, m: Mark,
    x: number, y: number) {
	for (const [dx, dy, n] of m)
		ctx.fillRect(x + dx, y + dy, n, 1);
}
