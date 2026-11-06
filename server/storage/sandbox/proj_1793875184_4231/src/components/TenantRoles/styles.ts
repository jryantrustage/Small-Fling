import { CoreButton } from 'commonui';
import styled from 'styled-components';

const SCButton = styled(CoreButton)`
display: flex;
align-items: center;
margin: 10px;
justify-content: space-evenly;
`;

const SCActionsContainer = styled.div`
width: 100%;
display: flex;
justify-content: flex-end;
`;

const SCCancelButton = styled(CoreButton)`
margin: 10px;
`;

export { SCButton, SCActionsContainer, SCCancelButton };
