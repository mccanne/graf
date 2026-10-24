# graf
historical graphing tool ported to typescript/electron

The original C/Xlib source is in [LBL](LBL).  This is a straight port of
it: same data format, command line flags, mouse gestures and keystrokes.

## Building and running

```
npm install
npm run build
npm start -- -m data.txt          # or: npx graf -m data.txt
```

`npm link` (or `npm install -g .`) puts a `graf` command on your path that
works like the old one, including reading standard input:

```
seq 100 | awk '{print $1, sin($1/10)}' | graf -m
```

## Input

One point per line, with one to four numbers:

| line      | meaning                                   |
|-----------|-------------------------------------------|
| `y`       | x is the point's index in the set         |
| `x y`     |                                           |
| `x y d`   | width and height for `-r`/`-e` are both d |
| `x y w h` |                                           |

A blank line starts a new data set, `#` starts a comment, lines
containing `NA` are skipped, and any other characters are ignored.
Each file starts a new data set.

## Options

```
-b, -M  black and white (sets are distinguished by dash pattern)
-B      bar graph               -e   error bars
-m      mark points             -p   with -m, mark with single pixels
-n      no lines (scatter)      -s   smoothed (spline) lines
-r      rectangles              -R   filled rectangles
-t      tick marks, not grid    -o   bounding box
-l x    log X axis              -l y log Y axis
-x lo,hi  X limits              -y lo,hi  Y limits
-N name   name the next data set (repeatable)
-f font   CSS font ("bold 12px Helvetica") or X11 font name
-g geom   window geometry, e.g. 800x600 or 800x600+0+0
-u        input is 8-bit mu-law audio
```

## Mouse

| gesture                     | action                                                                         |
|-----------------------------|--------------------------------------------------------------------------------|
| left drag                   | distance: dx, dy, slope, and number of points between the ends                |
| shift-left                  | identify the nearest point as `set-index: (x, y)` (shift-ctrl: just the cursor coordinates) |
| middle drag, or alt-left    | slope                                                                          |
| right drag, or cmd-left     | zoom into the box, in a new window                                             |
| shift-right, or shift-cmd-left | write the points in the box to `xgraph.tmp`                                  |

The alt/cmd alternatives are for trackpads and one-button mice.

## Keys

`g`/`t` grid or ticks, `b` bounding box, `l` lines, `m` marks,
`p` pixel marks, `h` bars, `s` spline, `r` rectangles, `f` filled
rectangles, `e` error bars, `0`-`9` hide/show a data set, `^L` redraw,
`q` or `^D` close the window, `^C` quit.  Line and mark toggles apply to
the visible data sets, so you can hide some sets with the digit keys and
then change the style of the rest.

## Differences from the X11 version

* X resources (`graf.Background`, `graf.precision`, ...) aren't
  supported; `-d` and `-c` are accepted and ignored.
* `-s` actually smooths the lines (the X version accepted it but drew
  straight lines).
* `b` toggles the bounding box, and `-o` / `-b` are accepted as the
  usage message always said they were.
* `-x` and `-y` set the X and Y limits independently, and are given in
  data units even with log axes.
* Data is clipped to the plot area, and a trailing blank line no longer
  creates an empty data set.
* With no files and a terminal on stdin, graf prints usage instead of
  waiting for input.

## License & Attribution

This project is licensed under the 4-Clause BSD License. See the [LICENSE](LICENSE) file for full details.

> **Mandatory Notice:**
> This product includes software developed by the University of California, Lawrence Berkeley Laboratory, Berkeley, CA.

### Historical Credits
* **Original X10 xgraph:** Written by David Harrison (University of California, Berkeley, 1986–1987).
* **Interactive & visual extensions:** Developed by Van Jacobson and Steven McCanne (UCB / Lawrence Berkeley Laboratory).

