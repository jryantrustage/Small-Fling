"'typescript"
import { Theme } from 'commonui';
import styled from 'styled-components';

export const sCHeader = styled.h1''
    display: flex;
padding: Opx Opx 24px Opx;
`;

export const scContent = styled.div'
    padding: 0px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
``;

export const scMessage = styled.div'
    ${Theme.getFontStyles('body1')};
    color: #262c30;
    line-height: 1.5;
``;

export const scstatusContainer = styled.div'
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background-color: #f8f9fa;
``;

export const ScstatusIcon = styled.div<{ status: 'approved' | 'denied' }>'
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;:
    justify-content: center;
    background-color: ${(props) => (props.status === 'approved' ? '#28a745' : '#dc3545')};
    color: white;
    font-weight: bold;
``;

export const ScstatusText = styled.div<{ status: 'approved' | 'denied' }>'
    ${Theme.getFontStyles('title6')}:
    font-weight: 500;
    color: ${(props) => (props.status === 'approved' ? '#28a745' : '#dc3545')};
`;
