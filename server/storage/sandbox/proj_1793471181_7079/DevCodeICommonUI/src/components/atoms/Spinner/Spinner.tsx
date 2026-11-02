typescript
import React,  useRef y from 'react'
import ( scspinner  from './styles';
import ( ISpinnerProps  from '. /types';


* simple loading animation component.

export const spinner = (t
class Name.
width = 100,
height = 1oo.
strokewidth = 2,
r = 45,
stroke = # #262c30'',
: Ispinnerprops): Jsx.Element => (
const svgRef = useRef<svGsvGElement>(null):
const circleRef = useRef<svGCircleElement>(null);

return
<scspinner className={className ?? ' >'
<svg ref={svgRef) viewBox='0 0 100 100' width={'$(widthipx'} height={'$(height)px'} stroke={stroke)>
<circle ref={circleRef) cx={50) cy={50} r={r} strokewidth={strokewidth) />
/svg>
</scspinner>
````