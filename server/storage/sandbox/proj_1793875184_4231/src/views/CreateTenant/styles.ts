import { DynamicSegment } from 'commonui';
import styled from 'styled-components';

const SCTenantIntegrationWrapper = styled.div`
display: flex;
justify-content: space-around;
flex-direction: column;
margin-left: 24px;
> div {
margin-bottom: 16px;
width: 80%;
}
`;

const SCDynamicSegment = styled(DynamicSegment)`
background-color: transparent;
> .fieldGroup {
padding: 0;
}
`;

export { SCTenantIntegrationWrapper, SCDynamicSegment };
