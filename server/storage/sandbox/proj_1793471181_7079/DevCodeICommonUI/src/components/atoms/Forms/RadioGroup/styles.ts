typescript
import styled,  css, cssProp } from 'styled-components';
import ( IPropsHook ) from 'styles/themes/themeutility';
import ( Alignment, RadioGroupvariant } from 'core/enums';
import  Theme  from 'styles';
import ( DisplayMode } from 'styles/themes';
import ( RadioButton } from '../RadioButton';

export const sCRadiooption = styled(RadioButton)<
alignment: Alignment:
showverticalDivider: boolean
colorscheme: DisplayMode
error: string I boolean;
disabled?: boolean

letter-spacing: normal

&.readonly div.
&.readonly label
opacity: 1;
.

$((t alignment, showverticalDivider ): cssProp =>
(alignment === Alignment.VERTICAL &&
css
&: not( : ast-of-type)
border-bottom: 1px solid ${Theme.getcolor('productGreyscale03'));
.

(showverticalDivider &&
css
&: not(: last-of-type)
border-right: 1px solid $(Theme.getcolor('contrastGreyscale05');
.

css  y
$t(t alignment f): cssprop =>
(alignment === Alignment.VERTICAL &&
css
div
align-self: flex-start;
.
fieldset > legend
margin-left: opx
.

css
& not(: last-of-type)
border-right: 1px solid $(Theme.getcolor('contrastGreyscaleo5'));
.
```
$t(t showverticalDivider ): cssProp =>
(showverticalDivider &&
css
${Theme.getMediaQuery(Theme. MD, Theme. M))
flex: 1 1 30%;
.

css
$ (t colorscheme, error ): cssProp =>
(error &&
css
input[type='radio'] :not(:checked) ~ label (
border-color: $Theme.getcolor('error');

&: hover,
&: focus,
&: active
border-color: ${Theme.getcolor('error');
.
.

input[type='radio'] : checked ~ label (
border:  px solid;
border-color: $ (DisplayMode.DARk
? Theme.getcolor('darkError')(t Theme )
: Theme.getcolor('error')(t Theme ):
.

(colorscheme === DisplayMode IGHT &&
css
&: hover input[type='radio'] ~ label (
border: 1px solid ${Theme.getcolor('contrastBlack')):
.
input[type='radio'] : checked ~ label (
border: 1px solid ${Theme.getcolor('contrastBlack')):
.

css
&: hover input[type='radio'] ~ label (
border: 1px solid $(Theme.getcolor('contrastwhite')):
.
input[type='radio'] : checked ~ label (
border: 1px solid $(Theme.getcolor('contrastwhite'));
.
.