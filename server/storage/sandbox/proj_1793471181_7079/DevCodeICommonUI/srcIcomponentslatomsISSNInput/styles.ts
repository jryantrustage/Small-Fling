typescript
import styled from 'styled-components';
import  Theme  from 'styles';
import ( MaskedInput } from 'components/atoms/MaskedInput';
import ( IPropsHook ) from 'styles/themes/themeutility';

****************************************************************
STYLES: ssN or ITIN Input field with label and error
*********************************************************

export const scssNTextFieldwrapper = styled. div
position: relative
z-index: o:


export const sCMaskedInput = styled(MaskedInput)
z-index: 5;
position: relative
color: transparent
background-color: transparent
caret-color: ${Theme.getcolor('contrastBlack');

&: focus
background-color: transparent
outline: none;
.

&: : selection
color: transparent:
background: none
.

&.invalid
background-color: transparent
.

/* make sure input text stays transparent when readonly and disabled */
&.readonly: disabled
color: transparent:
background-color: transparent;
.


export const scVisiblevaluewrap = styled.div<{ disabled?: boolean J>
position: absolute
display: flex;
top: o:
left: o:
width: 100%;
height: 40px;
$(Theme.getFontstyles("body2')
padding: 9px 35px 9px 14px;
border-radius: 1opx;
border: none
background-color: $((t disabled f): IPropsHook =>
disabled ? Theme.getcolor('contrastGreyscale03') : Theme.getcolor('contrastGreyscale01'):

&.invalid
background-color: ${Theme.getcolor('errorBackground'));
.

&.readonly
background-color: ${Theme.getcolor('contrastGreyscale03'));
.


export const scInvisiblevalue = styled.span
display: inline-block;
position: relative
user-select: none
color: transparent !important


export const scMaskedvalue = styled. span'
position: absolute
top: o:
left: o:
width: 100%;
display: flex;
color: $(Theme.getcolor('contrastGreyscaleo8')):


export const scMaskedvaluestars = styled.span'
flex: 1
display: flex:
justify-content: space-around


export const scToggleMask = styled. div
cursor: pointer;
width: 20opx;
height: 18px;
margin-right: -2opx;
margin-left: auto:
align-self: flex-end;
z-index: 6:

