typescript
import styled from 'styled-components';
import { IProgressNavigationButtonProps } from 'components/atoms/ProgressNavigationButton';
import ( Theme } from 'styles/ themes'
import ( IPropsHook } from 'styles/themes/themeutility';

export const sCDisableButton = styled.div<Partial<IProgressNavigationButtonProps>>
pointer-events: $(t disabled ): string => (disabled ? 'none' : ‘inherit')


export const scButton = styled.button'
height: 40px;
width: 55px;
cursor: pointer;
: focus
circle
fill: $(Theme.getcolor("white'):
stroke: ${Theme.getcolor('contrastBlack');
stroke-width: 1px;
stroke-dasharray: 2, 2
.
.button-border
fill: $(Theme.getcolor('white'):
stroke: $(Theme.getColor('contrastBlack'):
stroke-width: 1px;
stroke-dasharray: 1, 2
.
.
: hover
circle
fill: $(Theme.getcolor("white'):
stroke: ${Theme.getcolor('contrastBlack');
.
.
:active
circle
fill: $(Theme.getcolor('contrastGreyscaleo1');
stroke: $(Theme.getColor('contrastGreyscaleo6'));
.
.


export const scDesktopButtonwrapper = styled. div
max-width: 4opx;
max-height : 40px;
svg
width: 100%;
height: auto;
.
display: inherit;
$ (Theme.getMediaQuery(Theme. LG))
display: none;
.
$ ( Theme.getMediaQuery(Theme.MD)
display: none;
.
$( Theme.getMediaQuery(Theme.sm)
display: none;
.


export const sCDesktopButtonProperties = styled.g<Partial<IProgressNavigationButtonProps>>＇
max-width: 5px;
max-height: 40px;
svg
width: 100%
height: 40px;
.
circle
cursor: pointer:
fill: ${Theme.getcolor('contrastwhite'):
fill-opacity: $(Theme.getopacityValue('50%)):
stroke: $((t disabled ): IPropsHook =>
disabled ? Theme.getcolor('contrastGreyscaleo6') : Theme.getColor('contrastGreyscale08'));
.
path
fill: $ (t disabled ): IPropsHook =>
disabled ? Theme.getcolor('contrastGreyscaleo6') : Theme.getColor('contrastBlack'));
stroke: $((t disabled ): IPropsHook =>
disabled ? Theme.getcolor('contrastGreyscaleo6') : Theme.getColor('contrastBlack'));
.

///////////////////////////////////////////////////////////////////////////
/ Mobile Button styles
/////////////////////////////////////////////////////////////////////////
export const scMobileButtonwrapper = styled.div.
max-width: 55px;
max-height : 40px;
svg
width: 100%;
height: 40px;
.
display: none
$ ( Theme.getMediaQuery(Theme.LG)
display: inherit:
.
$ ( Theme.getMediaQuery(Theme.MD)
display: inherit
.
$ (Theme.getMediaQuery(Theme. SM))
display: inherit:
.
cursor: pointer;
: hover
fill: ${Theme.getcolor("white'));
stroke: $(Theme.getcolor('contrastBlack');
.
: active
fill: ${Theme.getcolor('contrastGreyscaleo1'));
stroke: $(Theme.getcolor('contrastBlack');
.


export const sCMobileButtonProperties = styled.g<Partial<IProgressNavigationButtonProps>'';
export const SCMobileButtonPropertiesBackground = styled.g<Partial<IProgressNavigationButtonProps>>＇
path t
fill: ${Theme.getcolor('contrastwhite'):
stroke: $(t disabled y): IPropsHook =>
disabled ? Theme.getColor('contrastGreyscale06') : Theme.getColor('contrastGreyscale08');
.

export const sCMobileButtonPropertiesIcon = styled.g<Partial<IProgressNavigationButtonProps>>＇
path
cursor: pointer:
fill: $ (t disabled ): IPropsHook =>
disabled ? Theme.getColor('contrastGreyscale06') : Theme.getColor('contrastBlack'):
.

