import styled from 'styled-components';
import { SimpleAccordion, Theme } from 'commonui';

export const SCSideBarWrapper = styled.div`
display: flex;
align-items: center;
justify-content: space-between;
background-color: ${Theme.getColor('contrastBlack')};
width: 20%;
`;

export const SCSideBar = styled.div`
width: 100%;
height: 100vh;
padding: 20px;
overflow-y: scroll;
`;

export const SCBrandLogo = styled.div`
display: flex;
justify-content: center;
align-items: center;
padding: 10px 0px;
img {
width: 125px;
}
`;

export const SCSideBarDisplay = styled.div`
padding-bottom: 30px;
border-top: 2px solid ${Theme.getColor('productGreyscale01')};
`;

export const SCIcon = styled.div<{ expanded?: boolean }>`
display: flex;
align-items: center;
width: 35px;
height: 35px;
i {
transition: transform 200ms;
transform: ${({ expanded }) =>
expanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
}
svg path {
stroke-width: 1px;
stroke: #fff;
marker: #fff;
fill: #fff;
}
`;

export const SCSidebarEntry = styled.div<{
isNested: boolean;
navDepth: number;
}>`
font-size: 14px;
margin-top: 5px;

  >,
> div {
color: ${Theme.getColor('white')};
display: flex;
align-items: center;
padding: 10px;
margin-left: ${({ isNested, navDepth }) =>
isNested ? `${navDepth * 20}px` : '0'};
border-radius: 3px;
transition: color 100ms, background-color 100ms;
}

  .active,
a:hover,
button:hover & {
background-color: #fff;
    color: #ooo;
div {
color: #000;
}
svg path {
stroke: grey;
marker: grey;
fill: grey;
}
}
`;

export const SCAccordionDepthWrapper = styled.div<{ depth: number }>`
margin-left: ${(props) => props.depth * 3}px;
`;

export const SCAccordion = styled(SimpleAccordion)<{ hasBorder?: boolean }>`
${({ hasBorder }) =>
hasBorder
? `
padding-top: 10px;
padding-bottom: 10px;
border-bottom: 2px solid ${Theme.getColor('productGreyscale01')};
border-top: 2px solid ${Theme.getColor('productGreyscale01')};

      ; ``}
> button {
cursor: pointer;
}
> div {
flex-direction: column;
}
`;
