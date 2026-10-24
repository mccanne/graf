/* @(#) $Id: draw.h 63 2009-04-16 04:11:35Z leres $ (LBL) */

void DoSlope(XButtonEvent *, LocalWin *, Cursor);
int TransformCompute(LocalWin *);
void DoDistance(XButtonEvent *, LocalWin *, Cursor);
int HandleZoom(XButtonEvent *, LocalWin *, Cursor);
void DrawSet(LocalWin *, Window, struct data_set *);
void DrawWindow(Window, LocalWin *);
void DoIdentify(XButtonEvent *, LocalWin *, Cursor, int);
int DataSetHidden(LocalWin *, int);
void RedrawWindow(Window, LocalWin *);
void ResizeWindow(Window, LocalWin *);
void DoWriteSubset(XButtonEvent *, LocalWin *, Cursor);
int GetColor(char *);
Window NewWindow(BBox *, struct plotflags *, LocalWin *);
void initGCs(Window);
