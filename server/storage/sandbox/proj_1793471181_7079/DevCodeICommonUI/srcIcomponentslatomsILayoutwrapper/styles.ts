typescript
import  Theme  from 'styles';

import styled from 'styled-components';

export const scLayoutwrapper = styled.div
display: flex;
flex-direction: column
min-height: 100%;
height: 100%;
flex: 1
background-color: $(Theme.getcolor('contrastwhite'));

