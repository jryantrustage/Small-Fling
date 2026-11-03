import React from 'react';

import { defaultTheme, DisplayMode } from './themes';

export interface IModeProps {
mode?: DisplayMode;
theme?: typeof defaultTheme;
}


























/**
* Styled component wrapper with widths that adjust at breakpoints
*/
export const SCComponentsWrapper = styled.div`
max-width: 1280px;
margin: 0 auto;
width: 100%;
`;
