import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
SimpleAccordion,
ISimpleAccordionProps,
AccordionArrowWithText,
Styles,
} from 'commonui';
const { Theme } = Styles;

export const SCCustomSectionAccordion = styled.div`

margin: 0px 20px;
padding: 4px 0px 8px;
`;

const SCSimpleAccordion = styled(SimpleAccordion)`
margin: 0;
.simple-accordion-content-wrapper {
margin-top: 0px;
}
button {
cursor: pointer;
}
`;

const SCContentContainer = styled.div`
flex-direction: column;
margin-top: 8px;
border-top: 1px solid ${Theme.getColor('contrastGreyscale04')};
``;

const SCAccordionButton = styled(AccordionArrowWithText)`
cursor: pointer;
^;l

export interface CustomSectionAccordionProps
extends Omit<ISimpleAccordionProps, 'buttonComponent'> {
headerComponent: JSX.Element;
expandFromParent?: boolean;
}

export const CustomSectionAccordion = ({
id,
headerComponent,
title,
content,
expandFromParent = false,
onSetExpanded,
}: CustomSectionAccordionProps): JSX.Element | null => {
const [expanded, setExpanded] = useState<boolean>(expandFromParent);

  useEffect(() => {
if (expandFromParent) {
setExpanded(true);
}
}, [expandFromParent]);

  return (
<SCCustomSectionAccordion>
{headerComponent}
<SCSimpleAccordion
id={id}
title={title}
content={<SCContentContainer>{content}</SCContentContainer>}
expandedOverride={expanded}
onSetExpanded={(newValue) => {
setExpanded(newValue);
if (onSetExpanded) {
onSetExpanded(newValue);
}
}}
buttonComponent={
/** match ID format of SimpleAccordion *(`simple-accordion-button-${id}`) */
<div id={`accordion-arrow-button-container-${id}`}>
<SCAccordionButton expanded={expanded} displayMode="LIGHT" />
</div>
}
      [>
</SCCustomSectionAccordion>
);
};
