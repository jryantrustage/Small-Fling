import styled, { css, CSSProp } from 'styled-components';
import { Theme } from 'styles';
import { DisplayMode } from 'styles/themes';
import { AccordionStage } from './types';

const displayModeColors = {
[DisplayMode.DARK]: {
background: css`
${Theme.getColor('contrastBlack')};
`,
primary: css`
${Theme.getColor('contrastWhite')};
`,
























if (accordionStage === AccordionStage.ACTIVE) {
return css``
border-top: 1px solid ${Theme.getColor('productUltraBlack')};
`;
}
if (expanded) {
return css`
border-top: 1px solid ${Theme.getColor('contrastGreyscale04')};
`;
}
return css``;
};

const getCircleIconSpecificStyles = ({ accordionStage }: { accordionStage: AccordionStage }): CSSProp => {
switch (accordionStage) {
case AccordionStage.COMPLETED:
/** Checkmark styles here */
return css`
display: flex;
justify-content: center;
align-items: center;
background: ${Theme.getColor('contrastBlack')};
`;
case AccordionStage.ACTIVE:
























position: relative;
border-radius: 10px;
background: ${({ displayMode }): CSSProp => displayModeColors[displayMode].background};
color: ${({ displayMode }): CSSProp => displayModeColors[displayMode].primary};
/** Container padding for each accordion */
padding: 16px 16px 16px;
.simple-accordion-container {
/** Spacing between "View Details" accordion expand label
* and accordion header */
margin-top: 8px;
/** Remove default margin-bottom on SimpleAccordion
* (bottom-spacing handled by SCAccordionWrapper padding-bottom) */
margin-bottom: 0;
width: 100%;
}
.simple-accordion-content-wrapper {
/** Border-top for content divider on expanded accordion
* Figma says Contrast Ultra Black... is this productUltraBlack?
*/
${({ expanded, accordionStage }): CSSProp => getContentDividerStyle({ expanded, accordionStage })}
${({ expanded, accordionStage }): string =>
expanded || accordionStage === AccordionStage.ACTIVE
? `/** Spacing between content divider
* and "View Details" accordion expand label */
























align-items: center;
`;

export const SCAccordionCircleIcon = styled.div<{
accordionStage: AccordionStage;
tag?: string;
hideToggle?: boolean;
}>`
display: flex;
align-items: center;
justify-content: center;
box-sizing: border-box;
border-radius: 24px;
height: 32px;
width: 32px;
/** Spacing between circle icon and other header content */
margin-right: 16px;
margin-top: ${({ tag, hideToggle }): string =>
tag && !hideToggle
? /** If there's a header tag and bullet details are shown: a
* additional margin to create 34px of spacing from top of accordion
* 18px + 16px of padding-top from SCAccordionWrapper = 34px */
'18px'
: /** If no header tag:
























height: 20px;
/** Spacing between tag and accordion header */
margin-top: 8px;
`;

export const SCAccordionConnector = styled.div`
width: 100%;
position: relative;
display: flex;
flex-direction: row;
justify-content: center;
align-items: center;
padding-top: 4px;
padding-bottom: 4px;
`;

export const SCAccordionConnectorTitle = styled.div`
position: absolute;
left: 0px;
${Theme.getFontStyles('label4')};
color: ${displayModeColors[DisplayMode.LIGHT].secondary};
`;

export const SCAccordionConnectorLine = styled.div<{ connectorTitle?: string }>`
























/** Subtext is grey for light mode, but white for dark mode */
color: ${({ displayMode }): CSSProp =>
displayMode === DisplayMode.DARK
? displayModeColors[DisplayMode.DARK].primary
: displayModeColors[DisplayMode.LIGHT].secondary};
/** Spacing between main text and question sub text */
margin-top: 16px;
/** Spacing between question text and first list item should be 16px
* Collapsing margin causes the 8px margin-top from list item
* to be ignored */
margin-bottom: 16px;
white-space: pre-line;
`;

export const SCAccordionContentListItem = styled.div`
/** Spacing between list items */
margin-top: 8px;
`;

export const SCAccordionContentListItemHeader = styled.div`
display: flex;
flex-direction: row;
align-items: center;
/** Slight left indent on list items based on Figma */

































































connectorTitle?: string;
hideToggle?: boolean;
}

export interface ISimpleAccordionGroupProps {
data: Array<ISimpleAccordionDataItem>;
defaultExpandedId?: string;
shouldIncludeCompletedCount?: boolean;
}

export interface IAccordionContentListItem {
text: string;
subText?: string;
subTextCustom?: JSX.Element | JSX.Element[];
}

export interface IAccordionContentProps {
id: string;
mainText: string | React.ReactNode;
mainSubText?: string;
accordionStage: AccordionStage;
expanded?: boolean;
listItems?: Array<IAccordionContentListItem>;
hideSubContent?: boolean;























padding-bottom: 0;
}
.modalConfirmButton {
width: 100% !important;
margin-left: 0 !important;
}
