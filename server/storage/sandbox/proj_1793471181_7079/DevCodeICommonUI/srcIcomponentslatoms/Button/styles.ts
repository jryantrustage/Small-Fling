typescript
import styled from 'styled-components';

import ( DisplayMode, Theme  from 'styles/themes';

import ( IscButtonprops  from '. /types';

export const sCButton = styled.button<IsCButtonProps>
position: relative
min-width: 256px;
line-height: 1rem;
padding: 19px 25px
border-radius: 43px;
border: solid 1px $(Theme.getCcolor('contrastGreyscale05'):
cursor: pointer;
text-transform: uppercase;
background-color: transparent:
$( Theme.getFontstyles('label1')

&: disabled
color: $(Theme.getcolor('contrastGreyscaleo5')
border-color: ${Theme.getcolor('contrastGreyscaleo5'));
cursor: default;
pointer-events: none
.

$ (Theme.getMediaQuery(Theme. SM, Theme.MD) (
min-width: 20opx
padding: 12px;
$(Theme.getFontstyles('label2'))
.

$( Theme.getMediaQuery(Theme.sm)
width: 100%;
.


export const scPrimaryButton = styled(scButton)
background-color: transparent:
$t(t displayMode, theme f): string =>
displayMode === DisplayMode. DARk
```
color: ${Theme.getcolor('contrastwhite')(t theme );
border-color: ${Theme.getcolor('productGreyscaleo1')(t theme )
&: disabled
color: ${Theme.getcolor('productGreyscaleo1')({ theme ):
border-color: ${Theme.getcolor('productGreyscaleo1')({ theme ));
.
: hover
border-color: ${Theme.getcolor('contrastwhite')(( theme }):
.
: focus
outline: auto;
.

```
color: ${Theme.getcolor('contrastBlack')(t theme );
border-color: ${Theme.getcolor('contrastGreyscaleo5')(t theme ))
&: disabled
color: ${Theme.getcolor('contrastGreyscaleo5')(( theme ));
border-color: ${Theme.getcolor('contrastGreyscaleo5')(t theme +));
.
: hover
border-color: ${Theme.getcolor('productuitraBlack')(t theme +):
.
: focus
outline: auto ${Theme.getcolor('contrastBlack')(( theme }):
.