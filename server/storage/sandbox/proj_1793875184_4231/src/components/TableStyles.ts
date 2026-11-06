/* eslint @typescript-eslint/no-unused-vars:0 */
import { Theme, CoreButton } from 'commonui';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const SCActions = styled.div`
display: flex;
align-items: center;
button {
margin-right: 10px;
}
  > {
margin-right: 4px;
}

  button:last-child {
margin-right: 0;
}
`;

// colors from material-ui
const purple = '#9c27b0';
const green = '#4caf50';
const blue = '#00acc1;';
const orange = '#ff9800';
const red = '#f44336';

const Colors: Record<string, string> = {
purple: '#9c27b0',
green: '#4caf50',
blue: '#00acc1',
orange: '#ff9800',
red: '#f44336',
white: '#ffffff',
};

export const SCRightRow = styled.div`
display: flex;
flex-direction: row;
justify-content: right;
`;

export const SCButton = styled(CoreButton)`
border-color: ${({ color }: { color: string }): string =>
color === 'transparent' ? 'transparent' : 'inherit'};
background-color: ${({ color }: { color: string }): string =>
color ? Colors[color] : 'initial'};
color: ${({ color }: { color: string }): any =>
color === 'transparent' ? 'inherit' : Theme.getColor('contrastWhite')};
padding: 12px 30px;
margin: 0.3125rem 1px;
min-width: initial;
font-size: 12px;
max-width: 238px;
display: flex;
svg {
width: 18px;
height: 18px;
margin-right: 5px;
}
path {
stroke: ${() => Theme.getColor('contrastWhite')};
}
   div
display: flex;
align-items: center;
}
`;

const SCActionButton = styled.button<{ color: keyof typeof Colors }>`
display: flex;
justify-content: center;
align-items: center;
cursor: pointer;
height: 40px;
min-width: 40px;
background-color: ${({ color }) => (color ? Colors[color] : green)};
border-radius: 50%;
transition: border 200ms;
:focus,
:hover {
border: 1px solid black;
}
`;

const SCActionButtonLink = styled(Link)<{ color: keyof typeof Colors }>`
display: flex;
justify-content: center;
align-items: center;
cursor: pointer;
height: 40px;
min-width: 40px;
background-color: ${({ color }) => (color ? Colors[color] : green)};
border-radius: 50%;
transition: border 200ms;
:focus,
:hover {
border: 1px solid black;
}
``;

const SCHeader = styled.div`
font-size: 16px;
font-weight: bold;
`;

const SCText = styled.div`
font-size: 14px;
font-weight: bold;
`;

const SCStatus = styled(SCText)<{ status: string }>`
color: ${({ status }) =>
status === 'Active' ? green : Theme.getColor('contrastGreyscale04')};
`;

const SCPending = styled(SCText)<{ pending: boolean }>`
color: ${({ pending }) => (pending ? orange : purple)};
`;

[>>
* Custom wrapper for commonui table
* Allows content to flow out of td container
>[
const SCTableOverride = styled.div`
table > tbody > tr > td {
overflow: visible;
}
`;

[>>
* Container for dynamic notifications above a table
>[
const SCNotificationContainer = styled.div`
display: flex;
flex-direction: column;
min-height: 120px;
`;

export {
SCActions,
SCActionButton,
SCActionButtonLink,
SCHeader,
SCNotificationContainer,
SCPending,
SCStatus,
SCTableOverride,
};
