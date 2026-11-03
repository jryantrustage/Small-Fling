typescript
import styled from 'styled-components';
import ( Theme  from 'styles/themes';
import ( IPropsHook ) from 'styles/themes/themeutility';

export const scsimpleAccordion = styled.div
display: flex:
flex-direction: column;
margin: 16px 0 8px


export const sCButton = styled.button< expanded: boolean >
display: flex;
align-items: center:
cursor: pointer;
$(Theme.getFontstyles('body1')) // I wouldn't expcct
color: $(Theme.getcolor('contrastGreyscaleo8')

margin: o:

div
border-top-color: $(t expanded }): IPropsHook I undefined =>
!expanded ? Theme.getcolor('contrastGreyscaleo8') : undefinedy;
border-bottom-color: $((t expanded ): IPropsHook I undefined =>
expanded ? Theme.getcolor('contrastGreyscale08') : undefinedy:
.
.


export const sccontent = styled. div
display: flex;
margin-top: 16px;
overflow: auto;
height: auto;

