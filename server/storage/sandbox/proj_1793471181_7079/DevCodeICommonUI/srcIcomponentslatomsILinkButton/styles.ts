typescript
import t Theme  from 'styles';
import ( DisplayMode } from 'styles/themes';

import styled from 'styled-components';

import ( ILinkButtonProps } from './types'

export const sCButton = styled.button<ILinkButtonProps>
align-items: center:
color: $(t displayMode, theme ): string =>
displayMode === DisplayMode. DARk
? Theme.getcolor('contrastBlack')(t theme )
: Theme.getcolor('contrastwhite')(t theme )
display: inline-flex;
$( Theme.getFontstyles("body2')
margin-left: 4px;
text-decoration: underline;
cursor: pointer:

