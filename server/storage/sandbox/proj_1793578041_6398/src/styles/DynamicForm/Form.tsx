import styled from 'styled-components';
import { Theme } from '../themes';

export const SCBasicDisplay = styled.div`
color: ${Theme.getColor('contrastGreyscale04')};
overflow: hidden;
white-space: nowrap;
margin-right: 81px;
margin-top: -24px; // This is brittle and I don't like it...
text-overflow: ellipsis;
`;
























