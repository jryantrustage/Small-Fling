typescript
import styled,  css, cssProp } from 'styled-components';
import ( DisplayMode ) from 'styles/themes';
import t Theme  from 'styles';

export const sccardcontainer = styled.div<
displayMode? : string:
useBrandcolors?: boolean

padding: 24px
border-radius: 2opx;

$t(t displayMode ): cssprop => css
background-color: $(displayMode = DisplayMode.DARk
? Theme.getcolor('contrastBlack')
: Theme.getcolor('contrastGreyscaleo2'):

color: $[displayMode === DisplayMode.DARK ? Theme.getcolor('contrastwhite') : Theme.getcolor('contrastBlack'));