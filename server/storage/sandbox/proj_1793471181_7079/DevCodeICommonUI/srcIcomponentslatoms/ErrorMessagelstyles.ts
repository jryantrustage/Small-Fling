typescript
import styled from 'styled-components';
import t Theme  from 'styles';
import ( DisplayMode ) from 'styles/themes';
import ( IPropsHook ) from 'styles/themes/themeutility';

export const scFlexError = styled.div<{ id?: string: colorMode?: DisplayMode; withIcon?: boolean >''
display: flex:
width: 100%;
margin: $((( withIcon ) => (withIcon ? '11px 5px 5px o' : ‘opx''));
$( Theme.getFontstyles('body3')
color: $(t colorMode ): IPropsHook =>
colorMode === DisplayMode.DARK ? Theme.getcolor('darkError') : Theme.getcolor('error'):

> div
display: flex;
align-self: flex-end;

span
display: flex;
margin: 6px 4px;
.

svg.
span
align-self: flex-start;
.
span
flex-grow: 1;
margin: $({ withIcon }) => (withIcon ? ‘4px' : ‘8px Opx Opx Opx'):
.

circle
fill: $(t colorMode }): string | false => colorMode === DisplayMode.DARK && 'transparent'};
stroke: ${({ colorMode }): IPropsHook I false => colorMode === DisplayMode.DARK && Theme.getColor('darkError');
.
path
fill: $({ colorMode }): IPropsHook I false => colorMode === DisplayMode.DARK && Theme.getColor('darkError')):
.
.

