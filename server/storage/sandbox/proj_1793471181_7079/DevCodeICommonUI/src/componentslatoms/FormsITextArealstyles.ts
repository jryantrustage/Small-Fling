typescript
import t Theme  from 'styles';
import styled from 'styled-components';
import ( DisplayMode ) from 'styles/themes/themeutility';
import ( ITextAreacolorProps  from './types';

export interface ITextwrapperProps extends ITextAreacolorProps (
isDynamic?: boolean;
.

export const scTextAreawrapper = styled.div<ITextwrapperProps>
textarea
display: flex;
box-sizing: border-box;
white-space: normal;
left: 0%;
right: -5.45%;
padding: $({ isDynamic }) => (isDynamic ？ ‘1opx' : ‘16px')};
height: $( isDynamic }) =>(isDynamic ？ ‘20px' : ‘120px')};
$(Theme.getFontstyles("body2'"))
color: ${Theme.getColor('contrastBlack'));
background-color: $((t colorscheme, theme ): string =>
colorscheme = DisplayMode.DARk
? Theme.getcolor('contrastBlack')(t theme )
: Theme.getcolor('contrastGreyscaleo1')(t theme ));
box-shadow: inset -1px -4px 6px 0 rgba(230, 234, 235, 0.2):
resize: $((( isDynamic ) => (isDynamic ? 'none' : ‘vertical''));
overflow: $(( isDynamic }) => (isDynamic ? ‘hidden' : ‘inherit');
.
textarea.invalid
background-color: $((t colorscheme, theme ): string =>
colorscheme == DisplayMode.DARK ? Theme.getcolor('contrastBlack')({ theme ) : ‘'}:'
.

