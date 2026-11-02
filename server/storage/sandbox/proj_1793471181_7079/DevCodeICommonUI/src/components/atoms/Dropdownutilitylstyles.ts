typescript
import styled from 'styled-components';
import t Theme  from 'styles';

export const scDropdownutility = styled.div
position: relative
height: 100%;


export const scTogglewrapper = styled. button'
width: 100%;
height: 100%;
display: flex;
align-items: center:

$(Theme.getFontstyles('label2')

background: ${Theme.getcolor('contrastGreyscaleo1');
border: 1px solid $(Theme.getcolor('contrastGreyscale08');
border-radius: 1opx;

.isopen & t
border-bottom-left-radius: o;
border-bottom-right-radius: o
border-bottom-width: o:
.

.left &
border-top-right-radius: o:
border-bottom-right-radius: o
.


export const scLabel = styled.span'
height: 100%;
display: inline-flex;
align-items: center:
margin-left: 6px;
white-space: nowrap:


export const scMenuToggle = styled. div
position: absolute
right: o:
top: o:
width: 40px;
height: 100%;
text-align: center
border: 1px solid transparent
border-top-right-radius: 1opx
border-bottom-right-radius: 1opx;
display: flex;
align-items: center:

.left &
border-top-right-radius: o:
border-bottom-right-radius: o
.

.invalid: not(: disabled)  &
border-left-color: $(Theme.getcolor('error')):
.

&: disabled
pointer-events: none
.

svg
transform: translatey(1px):
.

.isopen &
border-bottom-right-radius: o

svg
transform: rotatex(18odeg) translateY(1px):
.
.


export const scMenu = styled.ul
position: absolute
left: o
top: 100%
right: o:
max-height: 30opx;
overflow-y: auto;
$( Theme.getFontstyles("body2')
border-bottom-left-radius: 1opx
border-bottom-right-radius: 1opx;
margin: o:
background: $(Theme.getColor('contrastGreyscaleo1'));

.isopen &
z- index: 2;
padding: o
border: 1px solid ${Theme.getcolor('contrastGreyscaleo7'));
border-top-width: o;
.


export const scMenuItem = styled.li'
display: flex;
padding: 6px 8px;
margin: 5px o
width: 100%;
user-select: none
-webkit-tap-highlight-color: rgba(o, o, o, o)
box-sizing: border-box
border-radius : 7px

&.highlighted
background: $(Theme.getColor('contrastBlack');
color: ${Theme.getcolor('contrastwhite'));

i svg path
stroke: $(Theme.getcolor('contrastwhite'):
.
.

&. disabled
color: $(Theme.getcolor('contrastGreyscaleo6')
pointer-events: none
.


margin: 2px 1opx o auto;

svg
stroke: ${Theme.getcolor('contrastBlack');
.
.


export const scNooptionsMessage = styled. div
margin: 5px:
text-align: center


export const Iconwrapper = styled.div
padding-left: 6px;

