typescript
import ( Theme ) from 'styles/ themes'

import styled, ( simpleInterpolation  from 'styled-components';

const scIcon = styled.i
display: block;
margin: o auto;


export const scArrowup = styled.div<{ size?: number f>
$(({ size }): SimpleInterpolation => size ＆& ‘margin: $((size - 8) / 2)px $(size - 10) / 2)px'};
width: opx;
height: opx;
border-left: 5px solid transparent;
border-right: 5px solid transparent
border-bottom: 8px solid $(Theme.getColor('contrastBlack');
border-top: o:

export const scArrowDown = styled.div< size?: number >
$(({ size }): SimpleInterpolation => size ＆& ‘margin: $((size - 8) / 2)px $(size - 10) / 2)px'};
width: opx;
height: opx;
border-left: 5px solid transparent;
border-right: 5px solid transparent;
border-top: 8px solid ${Theme.getcolor('contrastBlack'));


export t scIcon f;
