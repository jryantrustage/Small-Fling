-'typescript
import { Theme } from 'commonui';
import styled from 'styled-components';

export const sCHeader = styled.h1''
    display: flex;
`;

export const scSubheader = styled.div'
    ${Theme.getFontStyles('body1')};
    color: ${Theme.getColor('contrastGreyscaleo8')};
    display: flex;
    margin: 12px 0px 24px 0px;
`;

export const scFooter = styled.div''
    ${Theme.getFontStyles('body1')};
    color: ${Theme.getColor('contrastGreyscaleo8')};
    display: flex;
`;

export const scNotificationwrap = styled.div'
    .notification {
        margin-top: Opx;

        & #notification-title {
            font-weight: 500;
        }
    }
``;

export const scIframe = styled.iframe''
    width: calc(100% + 24px);
    height: 520px;
`;
