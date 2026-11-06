-'typescript'
import styled, { css } from 'styled-components';
o94 import { Theme } from 'commonui';

export const ScCardTag = styled.div''
    position: absolute;
    top: o;
    left: o;
    overflow: hidden;
    height: 24px;
    width: 240px;
    border-top-left-radius: 2opx;
`;

export const ScTag = styled.div<{ displayed: boolean; bgColor?: string; fontColor?: string }>'
    position: absolute;
    ${Theme.getFontStyles('label4')}
    padding: 0 20px;
    height: 24px;
    line-height: 24px;
    font-weight: 500;
    text-transform: uppercase;
    white-space: nowrap:
    color: ${Theme.getColor('contrastwhite')}:
    border-bottom-right-radius: 2opx;
    transition-property: left, visibility;
    transition-duration: 0.3s, Os;
    transition-timing-function: ease-out, linear;
    transition-delay: Os, 0.3s;
    left: -400px;
    visibility: hidden;

    ${({ displayed ) =>
        displayed &&
      >>>`
            left: o;
            transition-timing-function: ease-in, linear;
            transition-delay: Os, Os;
            visibility: visible;
        `}

    ${({ bgColor, fontColor }) =>
        bgColor &&
        fontColor &&
      >>>`
color: ${fontColor.startswith('#') ? fontColor : ‘#${fontColor}'};
background-color: ${bgColor.startswith('#') ? bgColor : ‘#${bgColor}''};
        `}
`;
