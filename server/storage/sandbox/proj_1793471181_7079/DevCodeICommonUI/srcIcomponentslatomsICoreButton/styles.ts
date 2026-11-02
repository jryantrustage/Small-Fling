typescript
import ( DisplayMode, IThemecolors, Theme } from 'styles';

import styled, ( css, FlattenInterpolation, ThemeProps } from 'styled-components';

import ( Shape } from 'styles/themes/themeutility';
import ( Buttonsizes, IProps } from './types';

export const sCButtoncontentcontainerInner = styled.div<{ displayMode: DisplayMode }>＇
position: absolute
right : 1px;
display: flex;
justify-content: right
align-items: center:
flex-grow: 1;
div
display: flex;
justify-content: right
align-items: center;
.

svg
width: 75%;
height : 75%;
stroke: $((t displayMode, theme ): string =>
displayMode == DisplayMode.DARK ? Theme.getcolor('T1')({ theme }) : Theme.getColor('contrastBlack')({ theme }):
.


export const scButtoncontentcontainer = styled.div
position: relative
display: flex;
height: 100%;
width: 100%;
justify-content: center;
align-items: center:



* CoreButton Hover state

const primaryHoverstate = (strokecolor: string, buttoncolor: string) => css'
box-shadow: o o o 3px ${Theme.getcolor(strokecolor as IThemecolors),
o o o 4px $(Theme.getColor(buttoncolor as IThemecolors)

const secondaryHoverstate = (buttoncolor: string) => css
outline: 1.5px solid $(Theme.getColor(buttoncolor as IThemecolors):
outline-offset: 3px;
transition: outline-color 3ooms ease-in;

const lightModePrimaryHoverstate = (buttoncolor: string) => css'
box-shadow: o o o 1px ${Theme.getcolor(buttoncolor as IThemecolors);
outline: 1px solid;
/** Can't transition the outline property, so set outline-color instead for smooth animation */
outline-color: ${Theme.getcolor(buttoncolor as IThemecolors));
outline-offset: 3px;
transition: box-shadow 30oms ease-in, outline-color 300ms ease-in;


const hoverstate = (
strokecolor: string.
buttoncolor: string.
options?: ( issecondary?: boolean; isLightModePrimary?: boolean }
) => (
let dynamicHoverstate = primaryHoverstate(strokecolor, buttoncolor):
if (options?.isLightModePrimary)
dynamicHoverstate = lightModePrimaryHoverstate(buttoncolor);
else if (options?.issecondary)
dynamicHoverstate = secondaryHoverstate(buttoncolor):
.
return css'
transition: box-shadow 3ooms ease-in;
$ t dynamicHoverstatey
