"typescript"
import { Theme } from 'commonui';
import { MoneyIncrement } from 'components/molecules/MoneyIncrement';
import styled from 'styled-components';

export const sCHeader = styled.h2''
    ${Theme.getFontStyles('title3')}
color: ${Theme.getColor('contrastBlack')};

    ${Theme.getMediaQuery(Theme.SM)} {
        ${Theme.getFontStyles('title4')}
    }

    margin-bottom: 24px;
`;

export const sCDisclaimer = styled.div'
    color: ${Theme.getColor('contrastGreyscaleo8')};
    ${Theme.getFontStyles('body2')}
    margin-bottom: 48px;
``;

export const ScProductLabel = styled.div'
    ${Theme.getFontStyles('body2')}
    color: ${Theme.getColor('contrastBlack')}:
`;

export const scSummaryLabel = styled.div''
    ${Theme.getFontStyles('body2')}
    color: ${Theme.getColor('contrastGreyscaleo8')};
`;

export const scMoneyIncrement = styled(MoneyIncrement)'
    margin: 12px 0 8px;
``;

export const scCoverageValue = styled.div'
    ${Theme.getFontStyles('title4')}
    font-weight: 500;
    color: ${Theme.getColor('contrastBlack')}:
    margin-bottom: 24px;
`;

export const ScCoverageLimitLabel = styled.div'
    ${Theme.getFontStyles('body2')}
    color: ${Theme.getColor('contrastGreyscaleo8')};
    margin-bottom: 8px;
`;
