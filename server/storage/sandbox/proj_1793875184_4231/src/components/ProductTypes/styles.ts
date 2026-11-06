import { CoreButton } from 'commonui';
import styled from 'styled-components';

const SCButton = styled(CoreButton)`
display: flex;
align-items: center;
margin: 10px;
justify-content: space-evenly;
`;

const SCRightAlignedButton = styled(CoreButton)`
position: absolute;
right: 30px;
top: -60px;
z-index: 100;
`;

const SCActionsContainer = styled.div`
width: 100%;
display: flex;
justify-content: flex-end;
`;

const SCCreateActionContainer = styled.div`
text-align: -webkit-right;
flex-grow: 1;
`;

const SCCategoryHeaderContainer = styled.div`
display: flex;
padding-bottom: 10px;
`;

const SCCategoryHeaderItem = styled.div`
padding-left: 20px;
`;

const SCCategoryHeaderLabel = styled.label`
font-size: 16px;
`;

const SCCategoryContainer = styled.div`
padding-bottom: 20px;
`;

const SCCancelButton = styled(CoreButton)`
margin: 10px;
`;

const SCValueInputContainer = styled.div`
display: flex;
& > :nth-child(n + 2) {
padding-left: 10px;
}
`;

const SCCard = styled.div`
min-width: 1200px;
}`;

const SCProductSubTypesContainer = styled.div`
display: flex;
gap: 10px;
& > div:nth-child(2) {
padding-bottom: 0px;
}
& > .MsCombobox {
height: 34px;
min-width: 170px;
}
& > div:nth-child(2) > button {
height: 28px;
white-space: nowrap;
}
`;

export {
SCButton,
SCActionsContainer,
SCCancelButton,
SCValueInputContainer,
SCCard,
SCRightAlignedButton,
SCCategoryHeaderContainer,
SCCategoryContainer,
SCCreateActionContainer,
SCProductSubTypesContainer,
SCCategoryHeaderLabel,
SCCategoryHeaderItem,
};
