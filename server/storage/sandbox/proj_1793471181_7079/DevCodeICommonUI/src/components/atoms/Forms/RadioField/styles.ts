typescript
import styled,  css, cssProp } from 'styled-components';
import ( Alignment  from 'core/enums';
import  Theme  from 'styles';
import ( RadioInput  from 'components/atoms/RadioInput';

export const sCRadioField = styled(RadioInput)<
alignment: Alignment:
showerticalDivider: boolean;

$ (t alignment, showverticalDivider ): cssProp =>
(alignment === Alignment.VERTICAL &&
showverticalDivider &&
css
&: not( : ast-of-type)
border-bottom: 1px solid ${Theme.getcolor('productGreyscale03');
.

(showverticalDivider &&
css
&: not( : ast-of-type)
border-right: 1px solid $(Theme.getcolor('contrastGreyscale07');
.

css  y
div
align-self: center:
letter-spacing: -0.366px;
.
$ (t showverticalDivider ): cssProp =>
(showverticalDivider &&
css
${Theme.getMediaQuery(Theme. MD, Theme. M))
flex: 1 1 30%;
.

css y


export const sCRadioFieldGroup = styled.div<( alignment: Alignment; showBorder?: boolean }>'
border-style: solid;
$t(t alignment f): cssprop =>
(alignment === Alignment.VERTICAL &&
css
display: flex;
flex-direction: column;
border-radius: 2opx;
border-color: $(Theme.getColor('productGreyscale03');

css
display: inline-flex;
border-radius: 1opx;
max-height: 4opx;
background-color: ${Theme.getcolor('contrastGreyscaleo1'):
$ {Theme.getMediaQuery(Theme.MD, Theme.SM) (
flex-wrap: wrap:
max-height: unset;
.
```
&.invalid
border-color: $(Theme.getcolor('error'):
background-color: ${Theme.getcolor('errorBackground'));
.
border-color: $(Theme.getcolor('contrastGreyscaleo7');
border-width: $(({ showBorder = true }) => (showBorder ？ ‘1px ‘ : ‘opx')):

$ t(t showBorder = true f) =>
showBorder

: css
label
padding-left: opx
.