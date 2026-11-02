typescript
import styled,  keyframes } from 'styled-components';

const svgAnimation = keyframes''
0%
transform: rotatez(odeg);
.
100%
transform: rotatez(36odeg):
.


const circleAnimation = keyframes
0%,
25%
stroke-dashof fset: 28o:
transform: rotate(o)
.

50%,
75%
stroke-dashoffset: 75;
transform: rotate(45deg);
.

100%
stroke-dashoffset: 28o
transform: rotate(36odeg):
.


const fadeIn = key frames
0%
opacity: o;
.
100%
opacity: 1;
.

export const scspinner = styled. div
opacity: o;
animation: $(fadeIny 1.4s ease-in-out infinite
& svg
animation: 2s linear infinite $(svgAnimation);
max-width: 1oopx

& circle
animation: 1.4s ease-in-out infinite both $(circleAnimation);
display: block
fill: transparent;
stroke-dasharray: 308;
stroke-dashoffset: 298
transform-origin: 50% 50%
.
.

