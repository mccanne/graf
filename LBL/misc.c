/*
 * Copyright (c) 1991, 1996, 1997, 2007
 *	The Regents of the University of California.  All rights reserved.
 *
 * Redistribution and use in source and binary forms are permitted
 * provided that the above copyright notice and this paragraph are
 * duplicated in all such forms and that any documentation,
 * advertising materials, and other materials related to such
 * distribution and use acknowledge that the software was developed
 * by the University of California, Lawrence Berkeley Laboratory,
 * Berkeley, CA.  The name of the University may not be used to
 * endorse or promote products derived from this software without
 * specific prior written permission.
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND WITHOUT ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, WITHOUT LIMITATION, THE IMPLIED
 * WARRANTIES OF MERCHANTIBILITY AND FITNESS FOR A PARTICULAR PURPOSE.
 * 
 * This code is derived from the original X10 xgraph written by
 * David Harrison University of California,  Berkeley 1986, 1987
 * 
 * Heavily hacked by Van Jacobson and Steven McCanne, UCB/LBL: added mouse
 * functions to id points and compute slopes and distances.  added keystroke
 * commands to toggle most of the visual attributes of a window (grid, line, 
 * markers, etc.).
 */

#include <stdio.h>
#include <math.h>
#include <string.h>

#include "flags.h"
#include "prototypes.h"

/*
 * Writes the value provided into the string in a fixed format consisting of
 * seven characters.  The format is: -ddd.dd
 */
void
WriteValue(char *str, double val, int expn)
{
	int index;

	if (expn < 0) {
		for (index = expn; index < 0; index++)
			val *= 10.0;
	} else {
		for (index = 0; index < expn; index++)
			val /= 10.0;
	}
	(void)sprintf(str, "%7.2f", val);
}

#define nlog10(x)	(x == 0.0 ? 0.0 : log10(x))

/*
 * This routine rounds up the given positive number such that it is some
 * power of ten times either 1, 2, or 5.  It is used to find increments for
 * grid lines.
 */
double 
RoundUp(double val)
{
	int exponent, index;

	exponent = (int) floor(nlog10(val));
	if (exponent < 0) {
		for (index = exponent; index < 0; index++) {
			val *= 10.0;
		}
	} else {
		for (index = 0; index < exponent; index++) {
			val /= 10.0;
		}
	}
	if (val > 5.0)
		val = 10.0;
	else if (val > 2.0)
		val = 5.0;
	else if (val > 1.0)
		val = 2.0;
	else
		val = 1.0;

	if (exponent < 0)
		for (index = exponent; index < 0; index++)
			val /= 10.0;
	else
		for (index = 0; index < exponent; index++)
			val *= 10.0;

	return (val);
}

char *
stripdir(char *s)
{
	char *cp = strrchr(s, '/');

	return (cp != 0) ? cp + 1 : s;
}
