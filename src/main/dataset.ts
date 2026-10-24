/*
 * Data file reader.  Port of dataset.c and the flex scanner in scan.l.
 *
 * Input is one point per line with one to four numbers:
 *	y		x is the point index
 *	x y
 *	x y d		w = h = d
 *	x y w h
 * A blank line starts a new data set.  '#' starts a comment.  A line
 * containing "NA" is skipped.  Any other characters are ignored.
 */

import type { BBox, DataSet } from "../common/types";
import { ulawToLinear } from "./ulaw";

export interface ReadOptions {
	logX: boolean;
	logY: boolean;
	names: string[];	/* -N names, applied in set order */
}

const enum Tok { EOF, NL, NUM, NA }

/*
 * Tokenizer matching scan.l.  Numbers follow the four flex patterns:
 *	[+-]?D+.D*(E)?  [+-]?D*.D+(E)?  [+-]?D+E  [+-]?D+
 */
const NUM_RE =
    /[+-]?(?:\d+\.\d*(?:[eE][+-]?\d+)?|\d*\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+)/y;

class Scanner {
	private pos = 0;
	num = 0;

	constructor(private readonly text: string) {}

	next(): Tok {
		const s = this.text;
		while (this.pos < s.length) {
			const c = s[this.pos];
			if (c === " " || c === "\t" || c === "\r") {
				this.pos++;
				continue;
			}
			if (c === "#") {
				const nl = s.indexOf("\n", this.pos);
				this.pos = nl < 0 ? s.length : nl;
				continue;
			}
			if (c === "\n") {
				this.pos++;
				return Tok.NL;
			}
			if ((c === "n" || c === "N") &&
			    (s[this.pos + 1] === "a" || s[this.pos + 1] === "A")) {
				this.pos += 2;
				return Tok.NA;
			}
			NUM_RE.lastIndex = this.pos;
			const m = NUM_RE.exec(s);
			if (m !== null) {
				this.pos += m[0].length;
				this.num = parseFloat(m[0]);
				return Tok.NUM;
			}
			this.pos++;	/* ignore anything else */
		}
		return Tok.EOF;
	}
}

class SetBuilder {
	x: number[] = [];
	y: number[] = [];
	w: number[] = [];
	h: number[] = [];
	bb: BBox = {
		loX: Number.MAX_VALUE, loY: Number.MAX_VALUE,
		hiX: -Number.MAX_VALUE, hiY: -Number.MAX_VALUE,
	};

	constructor(readonly setno: number, readonly name: string) {}

	get length(): number {
		return this.x.length;
	}

	add(x: number, y: number, w: number, h: number, opts: ReadOptions) {
		if (opts.logX) {
			if (x <= 0)
				return;
			x = Math.log10(x);
		}
		if (opts.logY) {
			if (y <= 0)
				return;
			y = Math.log10(y);
		}
		this.x.push(x);
		this.y.push(y);
		this.w.push(w);
		this.h.push(h);
		const bb = this.bb;
		if (x < bb.loX)
			bb.loX = x;
		if (x + w > bb.hiX)
			bb.hiX = x + w;
		if (y < bb.loY)
			bb.loY = y;
		if (y + h > bb.hiY)
			bb.hiY = y + h;
	}

	build(): DataSet {
		return {
			setno: this.setno,
			name: this.name,
			x: Float64Array.from(this.x),
			y: Float64Array.from(this.y),
			w: Float64Array.from(this.w),
			h: Float64Array.from(this.h),
			bb: this.bb,
		};
	}
}

function basename(path: string): string {
	const i = path.lastIndexOf("/");
	return i >= 0 ? path.slice(i + 1) : path;
}

/*
 * Accumulates data sets across all input files, assigning set numbers
 * and names the same way the C version did.
 */
export class DataReader {
	private sets: SetBuilder[] = [];

	constructor(private readonly opts: ReadOptions) {}

	private nextSet(filename: string | null): SetBuilder {
		const setno = this.sets.length;
		let name: string;
		if (setno < this.opts.names.length)
			name = this.opts.names[setno];
		else if (filename !== null)
			name = basename(filename);
		else
			name = `Set ${setno}`;
		const p = new SetBuilder(setno, name);
		this.sets.push(p);
		return p;
	}

	readText(text: string, filename: string | null) {
		const sc = new Scanner(text);
		let p = this.nextSet(filename);
		/* set when a blank line ends p; the next set is made lazily */
		let split = false;
		const v = [0, 0, 0, 0];
		let eof = false;

		while (!eof) {
			/* scanline() */
			let n = 0;
			for (;;) {
				const tok = sc.next();
				if (tok === Tok.EOF) {
					eof = true;
					break;
				}
				if (tok === Tok.NL)
					break;
				if (tok === Tok.NUM) {
					if (n >= 0 && n < 4)
						v[n++] = sc.num;
				} else
					n = -1;
			}
			if (n < 0)
				continue;
			if (n === 0) {
				/* blank line ends the current set */
				if (p.length !== 0)
					split = true;
				continue;
			}
			if (split) {
				p = this.nextSet(null);
				split = false;
			}
			switch (n) {
			case 1:
				p.add(p.length, v[0], 0, 0, this.opts);
				break;
			case 2:
				p.add(v[0], v[1], 0, 0, this.opts);
				break;
			case 3:
				p.add(v[0], v[1], v[2], v[2], this.opts);
				break;
			default:
				p.add(v[0], v[1], v[2], v[3], this.opts);
				break;
			}
		}
	}

	/* -u: each byte is a mu-law sample; x is the sample index. */
	readUlaw(bytes: Uint8Array, filename: string | null) {
		const p = this.nextSet(filename);
		for (let i = 0; i < bytes.length; ++i)
			p.add(i, ulawToLinear(bytes[i]), 0, 0, this.opts);
	}

	datasets(): DataSet[] {
		return this.sets.map((s) => s.build());
	}
}

/* Bounding box of all non-empty data sets (DataSetBBox). */
export function dataSetsBBox(sets: DataSet[]): BBox {
	let b: BBox | null = null;
	for (const p of sets) {
		if (p.x.length === 0)
			continue;
		if (b === null) {
			b = { ...p.bb };
			continue;
		}
		b.loX = Math.min(b.loX, p.bb.loX);
		b.hiX = Math.max(b.hiX, p.bb.hiX);
		b.loY = Math.min(b.loY, p.bb.loY);
		b.hiY = Math.max(b.hiY, p.bb.hiY);
	}
	return b ?? { loX: 0, loY: 0, hiX: 1, hiY: 1 };
}
