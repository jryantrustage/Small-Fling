import styled, { css } from 'styled-components';
import { Theme } from '../themes';

export const SCUtilityInput = styled.input<{ overrideDisabledColor?: boolean }>`
display: block;
width: 100%;
padding: 10px 12px;
background-color: ${Theme.getColor('contrastGreyscale01')};
























}

  &.invalid {
border-color: ${Theme.getColor('error')};
background-color: ${Theme.getColor('errorBackground')};

    &:hover,
&:focus,
&:active {
border-color: ${Theme.getColor('error')};
}
}

  &:not(.readonly):disabled {
border-color: ${Theme.getColor('contrastGreyscale06')};
color: ${Theme.getColor('contrastGreyscale08')};
background-color: inherit;

    ${({ overrideDisabledColor }) =>
overrideDisabledColor &&
css`
color: transparent;
`}
}
























border-radius: 10px;
padding: 24px 0;

        & > div:last-child {
border-bottom: none;
}
``}
label {
${({ show, theme }): string | undefined =>
show &&
theme.contrastBlack &&

${theme.title4}
color: ${Theme.getColor('contrastBlack')({ theme })};
width: 90%;
margin-left: 22px;
`}
}
`;
