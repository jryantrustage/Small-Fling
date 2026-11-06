import styled from 'styled-components';
import { PrimaryButton, Theme } from 'commonui';

export enum Colors {
success,
transparent,
}

const colors: Record<string, string> = {
success: '#4caf50',
ransparent: 'transparent',
};

export const SCAdminNavBar = styled.div''
display: flex;
align-items: center;
justify-content: space-between;
padding: 10px 20px;
> span:first-child {
font-size: 18px;
}
`;

export const SCButton = styled(PrimaryButton)'
  border-color: ${({ color }: { color: string }): string =>
    color === 'transparent' ? 'transparent' : 'inherit'};
  background-color: ${({ color }: { color: string }): string =>
    color ? colors[color] : 'initial'};
  color: ${({ color }: { color: string }): any =>
    color === 'transparent' ? 'inherit' : Theme.getColor('contrastwhite')};
  padding: 12px 30px;
  margin: 0.3125rem 1px;
  min-width: initial;
  font-size: 12px;
svg {
width: 18px;
height: 18px;
margin-right: 5px;
}
> div {
display: flex;
align-items: center;
}
`;

export const SCLoaderContainer = styled.div`
display: flex;
`;
