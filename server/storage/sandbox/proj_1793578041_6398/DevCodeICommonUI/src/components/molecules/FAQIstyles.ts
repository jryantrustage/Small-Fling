
import ( SimpleAccordion ) from 'components/molecules/SimpleAccordion';
import  Theme  from 'styles';
import styled from 'styled-components';

export const sccontainer = styled.div'';

export const scTitle = styled.div
$(Theme.getFontstyles('title4'))
color: $(Theme.getcolor('contrastBlack'));
margin-bottom: 24px;


export const sCFAQItem = styled(SimpleAccordion)<( iconurl?: string }>
margin: opx:
margin-bottom: 12px;
$( Theme.getMediaQuery(Theme.LG, Theme.MD, Theme. SM))
margin-bottom: 16px;
.
.simple-accordion-content-wrapper
margin: opx;
.


export const scFAQButtonQuestion = styled.div
display: flex:
flex-direction: row;

align-items: flex-start;
/** Needed to keep text center when it becomes multi-line: */
text-align: left;
$( Theme.getFontstyles('strong2')
color: $(Theme.getcolor('contrastGreyscaleo8')):
cursor: pointer;

svg
/** Margins to set icon position relative to text based on Figma */
margin-top: 5px;
margin-right: 8px;
.


export const scFAQAnswer = styled.div
$ (Theme.getFontstyles("body3'")
color: $(Theme.getcolor('contrastGreyscale07'):
margin-top: 8px;
/** To make answer vertically aligned with question:
* 1opx icon width + 8px margin from icon */
margin-left: 18px;

