typescript
import styled, ( css ) from 'styled-components';
import { DisplayMode, Theme } from 'styles/themes/themeutility';
import ( Togglesize  from '. / types';

export const sCTogglewrapper = styled.ul<{ mode: DisplayMode; size: Togglesize: isDisabled: boolean }>＇
display: flex;
position: relative
height: ${(( size }) => (size === Togglesize.SMALL ? ‘28px' : ‘40px'));
width: $(( size }) => (size === Togglesize.LARGE ? ‘328px' : ‘fit-content');
justify-items: start:
align-items: center:
background-color: $t(t mode ) =>
return mode === DisplayMode.DARK ? Theme.getColor('contrastBlack') : Theme.getColor('contrastwhite');

border: solid 1px;
border-color: $((t mode, isDisabled y) => (
if (isDisabled)
return Theme.getcolor('contrastGreyscaleo6');
.

return mode === DisplayMode.DARK ? Theme.getColor('contrastGreyscale04') : Theme.getColor('contrastGreyscale08');

border-radius: 3opx;
padding: 1px;


export const scToggle = styled.li<
isselected: boolean;
issecondBtn: boolean;
mode: DisplayMode
size: Togglesize:
isDisabled: boolean;

height: $((( size }) => (size === Togglesize.SMALL ? ‘16px' : ‘38px'));
$t(t isselected, size ) =>
if (isselected && size = Togglesize ARGE) (
return css
width: 175px

.
if (lisselected && size === Togglesize.LARGE)
return css
width: 203px;

.

return css ;

border-radius: $( size }) => (size === Togglesize.SMALL ? '10opx' : '3opx')):
padding: $((( size }) => (size === Togglesize.LARGE ? ‘0 30px' : ‘o 16px'));
margin-left: $((t issecondBtn, size ) => (
if (lissecondBtn && size === Togglesize.LARGE)
return -- px';
.
if (lissecondBtn && size === Togglesize.SMALL)
return 4px'';
.

return o;

margin-right: $((t issecondBtn, size ) => (
if (issecondBtn && size === Togglesize. LARGE) (
return -1px'';
.
if (issecondBtn && size === Togglesize.sMALL)
return 4px'';
.

return o;

text-align: center
justify-content: center;
display: flex;
flex-direction: column;
$ (Theme.getFontstyles('label4'));
$({ size ) => size === Togglesize.SMALL && Theme.getFontstyles('label6');
color: $((t isselected, mode, isDisabled ) =>
if (isselected && isDisabled)
return Theme.getcolor('contrastGreyscaleo6');
.
if (isSelected && mode = DisplayMode.DARK) return Theme.getColor('contrastBlack'):
if (isSelected && mode = DisplayMode.LIGHT) return Theme.getcolor('contrastwhite');
if (!isselected && mode === DisplayMode.DARK) return Theme.getcolor('contrastwhite');
return Theme.getcolor('contrastBlack');

background-color: $((t isselected, mode, isDisabled ) =>
if (isselected && isDisabled)
return Theme.getcolor('contrastGreyscaleo6');
.
if (isselected && mode === DisplayMode.DARK) return Theme.getColor('contrastwhite');
if (isselected && mode === DisplayMode.LIGHT) return Theme.getColor('contrastBlack');
if (!isselected && mode === DisplayMode.DARK) return Theme.getColor('contrastBlack');
return Theme.getcolor('contrastwhite');


z-index: $((t isselected ) => isselected && '1'
list-style: none;
cursor: pointer;
text-transform: uppercase;

&［aria-disabled=' true'
pointer-events: none
.

