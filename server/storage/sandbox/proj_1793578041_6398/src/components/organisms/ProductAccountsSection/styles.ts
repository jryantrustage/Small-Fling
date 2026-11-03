import { Theme } from 'styles';
import { TabbedContainer } from 'components/molecules/TabbedContainer';
import { ProductAccountCard } from 'components/organisms/ProductAccountCard';
import styled from 'styled-components';

export const SCProductAccountsSection = styled.div`
.accountType {
display: none;
}
${Theme.getMediaQuery(Theme.MD, Theme.SM)} {
.accountType {
display: none;
}
}
${Theme.getMediaQuery(Theme.MD, Theme.SM)} {
.accountType {
























row-gap: 24px;
}
${Theme.getMediaQuery(Theme.MD, Theme.SM)} {
display: grid;
grid-template-columns: 1fr;
row-gap: 24px;
}
`;

export const SCProductAccountCard = styled(ProductAccountCard)`
${Theme.getMediaQuery(Theme.XL)} {
max-width: 300px;
min-width: 300px;
}
`;
