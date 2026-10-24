/* @(#) $Id: prototypes.h 70 2009-10-15 23:49:28Z leres $ (LBL) */

void ReadData(char *, int);
double RoundUp(double);
void WriteValue(char *, double , int);
void error(const char *, ...);
void setsetname(char *);
char *stripdir(char *);
void xsetfont(char *);
int yylex(void);
