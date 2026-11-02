typescript
import  Theme  from 'styles';

import styled, ( css, FlattensimpleInterpolation, FlattenInterpolation, ThemeProps ) from 'styled-components';

import  IProps  from . /types'';

I/ consider using a data attribute on the element instead of passing in 'isLink' this way.

export const scsimpleButton = styled.button<IProps>
padding: 8px 2opx;
$(Theme.getFontstyles('label2'))
line-height: 1.14;

border-radius : 5px
background-color: $( Theme.assignGroup('G1'):
color: $ (Theme.assignGroup('T1'):
text-transform: uppercase;
cursor: pointer;
opacity: 1;

&[disabled]
background-color: $(Theme.getcolor('contrastGreyscale05')):
cursor: default;
.

: hover,
: focus
background-color: $(Theme.assignGroup('G1'):
opacity: $(Theme.getcolor(hoveropacity''));
.

$ (props): false I FlattenInterpolation<ThemeProps<any>> I undefined =>
props.isLink &&
css
padding: o;
margin: o:
border: o:
$ (Theme.getFontstyles('label3')
text-decoration: underline
text-transform: none:
color: ${Theme.getcolor('contrastBlack'):
background-color: transparent: