%{
/*
 * Copyright (c) 1993, 1994, 1995, 1997, 2007
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
 */
#ifndef lint
static const char rcsid[] =
    "@(#) $Id: scan.l 63 2009-04-16 04:11:35Z leres $ (LBL)";
#endif

#include <math.h>

#include "token.h"
#include "prototypes.h"

double lex_num;

%}
%p 4000

OPT_SIGN	("+"|"-")?

%%

[ \t]		;
\#.*		;
\n		{ return '\n'; }
[nN][aA]	{ return (TOK_NA); }
{OPT_SIGN}[0-9]+\.[0-9]*([eE]{OPT_SIGN}[0-9]+)? |
{OPT_SIGN}[0-9]*\.[0-9]+([eE]{OPT_SIGN}[0-9]+)? |
{OPT_SIGN}[0-9]+[eE]{OPT_SIGN}[0-9]+ |
{OPT_SIGN}[0-9]+	{ lex_num = atof(yytext); return (TOK_NUM); }
.		; /* XXX */
%%

int
yywrap()
/* so we don't need -ll */
{
	return 1;
}
