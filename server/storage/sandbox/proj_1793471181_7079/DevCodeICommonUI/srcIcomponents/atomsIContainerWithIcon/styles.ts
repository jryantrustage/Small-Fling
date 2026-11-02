typescript
/* eslint-disable */
import t Theme  from 'styles';

import styled, ( simpleInterpolation } from 'styled-components';

import ( Position  from './types';

export const scDiv = styled.div
position: relative
$( Theme.getMediaQuery(Theme.SM, Theme.MD, Theme. LG))
padding-right: 20px;
.


export const sCIconcontainer = styled.div<( position: Position; size: number }>
position: absolute
$(t position, size ): simpleInterpolation =
position === Position.TOP_RIGHT
? 'top: o: right: o
: position === Position.BOTTOM_RIGHT
? 'bottom: o: right: o'
: position === Position.MIDDLE_RIGHT
? ‘right: o; top: calc(50% - $(size / 2)px)
: nully


export const scButton = styled.button.attrs<
ariaExpanded: boolean;
arialabel: boolean
>((t ariaxpanded, ariaLabel ) => (t
‘aria-expanded': ariaExpanded,
aria-label': arialabel,

cursor: pointer:
display: block;
box-s izing: border-box;
padding: 2opx:
margin: -2opx;
: focus
outline: none;

outline-offset: 5px;
outline: auto:
.
.

