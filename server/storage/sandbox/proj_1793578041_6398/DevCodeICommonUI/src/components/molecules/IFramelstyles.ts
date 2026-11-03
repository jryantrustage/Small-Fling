typescript
import styled,  css } from 'styled-components';
import  Theme  from 'styles';

export const scIFramecontainer = styled.div<( isHidden: boolean }>
display: flex;
align-items: center:
flex-direction: column;

$ (t isHidden f) =>
isHidden &&
css
visibility: hidden;