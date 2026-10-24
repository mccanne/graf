/*
 * Numeric helpers.  Port of misc.c plus a C-compatible "%.*g".
 */

export function nlog10(x: number): number {
	return x === 0 ? 0 : Math.log10(x);
}

/*
 * Writes the value in a fixed seven character format, -ddd.dd,
 * after scaling by 10^-expn (WriteValue).
 */
export function writeValue(val: number, expn: number): string {
	if (expn < 0) {
		for (let i = expn; i < 0; i++)
			val *= 10;
	} else {
		for (let i = 0; i < expn; i++)
			val /= 10;
	}
	return val.toFixed(2).padStart(7);
}

/*
 * Rounds up the given positive number such that it is some power of ten
 * times either 1, 2, or 5.  Used to find increments for grid lines.
 */
export function roundUp(val: number): number {
	const exponent = Math.floor(nlog10(val));
	if (exponent < 0) {
		for (let i = exponent; i < 0; i++)
			val *= 10;
	} else {
		for (let i = 0; i < exponent; i++)
			val /= 10;
	}
	if (val > 5)
		val = 10;
	else if (val > 2)
		val = 5;
	else if (val > 1)
		val = 2;
	else
		val = 1;
	if (exponent < 0) {
		for (let i = exponent; i < 0; i++)
			val /= 10;
	} else {
		for (let i = 0; i < exponent; i++)
			val *= 10;
	}
	return val;
}

function stripZeros(s: string): string {
	if (s.indexOf(".") < 0)
		return s;
	return s.replace(/0+$/, "").replace(/\.$/, "");
}

/* sprintf("%.*g", prec, v) */
export function formatG(v: number, prec: number): string {
	if (Number.isNaN(v))
		return "nan";
	if (!Number.isFinite(v))
		return v < 0 ? "-inf" : "inf";
	if (prec <= 0)
		prec = 1;
	if (v === 0)
		return Object.is(v, -0) ? "-0" : "0";
	const e = v.toExponential(prec - 1);
	const k = e.indexOf("e");
	const exp = parseInt(e.slice(k + 1), 10);
	if (exp < -4 || exp >= prec) {
		const mant = stripZeros(e.slice(0, k));
		const sign = exp < 0 ? "-" : "+";
		const digits = String(Math.abs(exp)).padStart(2, "0");
		return `${mant}e${sign}${digits}`;
	}
	return stripZeros(v.toFixed(prec - 1 - exp));
}
