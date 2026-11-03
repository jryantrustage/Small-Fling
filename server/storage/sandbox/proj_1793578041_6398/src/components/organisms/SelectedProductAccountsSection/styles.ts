import { Theme } from 'styles';
import { SelectedProductAccountCard } from 'components/organisms/SelectedProductAccountCard';
import styled, { css, CSSProp } from 'styled-components';

export const SCSelectedProductAccountsSection = styled.div<{ hasBorderBottom: boolean }>`
padding-bottom: 52px;
margin-bottom: 24px;
${({ hasBorderBottom }): CSSProp =>
hasBorderBottom
? css`
border-bottom: 2px solid ${Theme.getColor('contrastGreyscale02')};

: ''}
`;

export const SCCardsContainer = styled.div`
min-height: 100px;
max-width: 744px;
























padding: 0px;
`;
