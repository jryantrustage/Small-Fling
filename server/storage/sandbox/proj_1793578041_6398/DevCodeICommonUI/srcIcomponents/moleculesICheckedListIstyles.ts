typescript
import styled, ( css, SimpleInterpolation } from 'styled-components';

// changing the relative path below will probably cause build issues
import largecheckMarkGreen from '../../atoms/Icon/svg/large-check-mark-green.svg';

export const scprosList = styled.div< checked: boolean >
max-width: 38opx;
& > ul
& > li
padding-left: 25px;
position: relative;
list-style-type: none;
: not(: last-child)
margin-bottom: 15px;
.
$((t checked ): simpleInterpolation =>
checked &&
css
&: before
content: ;
position: absolute;
left: opx;
top: 5px;
background-color: unset;
background-image: url(\"s (largecheckMarkGreen)\");
background-repeat: no-repeat;
background-position: 50% 50%:
background-size: contain;
width: 16px;
height: 12px;
.
```
.
.

