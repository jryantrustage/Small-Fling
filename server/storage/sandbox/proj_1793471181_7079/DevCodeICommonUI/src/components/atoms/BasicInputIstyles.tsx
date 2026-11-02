typescript
import t Theme  from 'styles';

import React from 'react';
import styled, ( css, FlattensimpleInterpolation ) from 'styled-components';
import  omit  from 'lodash';

const activestyle = css.
outline: none
box-shadow: inset -1px -4px 6px 0 rgba(230, 234, 235, 0.2):
border: solid 1px $(Theme.getcolor('contrastGreyscale02')
background-color: $(Theme.getcolor('contrastGreyscaleo1');
& + button
display: block;
.


// remove custom properties
interface IBasicInputProps
invalid?: boolean
active?: boolean;
position? : string:
[propName: string] : any:
.
const BasicInput = (props: IBasicInputProps): Jsx.Element =><input (...omit(props, ［'invalid', 'active'I)) />;

const scBasicInput = styled(BasicInput)
display: block;
box-sizing: border-box
position: $((t position ): string => position || 'relative'};
z-index: 1;
padding: 11px 35px 11px 14px;
width: 100%;
border-radius: 1opx;
$( Theme.getFontstyles('label1')
color: $(Theme.getcolor('contrastBlack');
background-color: transparent:
outline: none
transition: all, o.3s;
border: solid 1px transparent:

&: : -ms-clear.
&: : -ms -reveal
display: none;
.

&: focus
$ tactivestyley
.

$(({ active ): string I undefined I typeof activestyle => (active ? activestyle : ‘''))

&: : placeholder
color: $(Theme.getcolor('contrastGreyscaleo8')
.

$((( invalid, theme }): string | FlattensimpleInterpolation =>
invalid
```
border-color: ${Theme.getcolor('error')(t theme );
background-color: ${Theme.getcolor('errorBackground')(t theme ));




const sCBasicInputError = styled.div
$(Theme.getFontstyles(body2'):'
color: $(Theme.getcolor('error):'
padding: 8px 12px opx;


export ( sCBasicInput, sCBasicInputError
