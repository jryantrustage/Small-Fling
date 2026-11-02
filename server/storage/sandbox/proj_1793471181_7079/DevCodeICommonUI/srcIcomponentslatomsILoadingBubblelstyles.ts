typescript
import styled,  keyframes } from 'styled-components';
import  a ) from 'react-spring';
import  Theme  from 'styles';

export const scDiv = styled.div
display: flex:
flex-direction: row;
line-height: o l important;


const loadingAnimation = keyframes
from
opacity: 1;
.
to
opacity: ${Theme.getopacityValue('40%):'
.


export const scDot = styled(a.div)
position: relative
animation: $(loadingAnimation o.8s infinite alternate;
animation-delay: o.4s;
margin: 4px 20px 3px:


&: before,
&: after
border-radius: 50%;
width: 12px;
height: 12px;
display: inline-block;
background-color: ${Theme.getcolor('contrastBlack');
.

&: before,
&:after
content: ;
pos ition: absolute:
top: o:
animation: $(loadingAnimation o.8s infinite alternate;
.

&: before
left: -2opx;
animation-delay: os;
.

&: after
left: 2opx;
animation-delay: o.8s;
.

