typescript
import styled, ( css } from 'styled-components';
import ( DisplayMode } from 'styles/ themes';
import ( Theme  from 'styles';

const modeFontcolor = css<( mode?: string >
color: $(t mode }): ReturnType<typeof Theme .getcolor> =>
mode = ‘ LIGHT
? Theme.getcolor('applicationDisplayTextLightMode')
: Theme.getcolor('applicationDisplayTextDarkMode'):

strong
color: ${Theme.getcolor('contrastBlack'));
.


export const SCwrap = styled.div<( mode?: DisplayMode; hasCustomcolorVariant?: boolean }>＇
display: flex;
margin: 8px o
$ ( modeFont Color)

& h2
$(Theme.getFontstyles'title4')
.

& p
$((t mode ): ReturnType<typeof Theme.getFontstyles> =>
mode === ‘LIGHT' ? Theme.getFontstyles("body1') : Theme.getFontstyles('label4'))
.

& span
$(Theme.getFontstyles('label7'))
padding: opx 4px
display: inline-block;
color: $(Theme.getcolor('contrastBlack'));
border-radius: 2px;
background-color: ${Theme.getcolor('contrastGreyscale04'));
.

/* fieldLabel Markdown overrides */
& ul
$(Theme.getFontstyles"body1'))
margin-left: 24px;
& li
line-height: o

$ {Theme.getMediaQuery(Theme. SM, Theme.MD)) (
line-height: inherit;
.
.
.

