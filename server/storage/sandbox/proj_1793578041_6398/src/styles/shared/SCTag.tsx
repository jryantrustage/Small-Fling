import styled from 'styled-components';
import { Theme } from '../themes';

export const SCTag = styled.span`
${Theme.getFontStyles('label5')};
height: 14px;
text-align: center;
vertical-align: middle;
letter-spacing: normal;
border-radius: 2px;
font-size: 12px;
line-height: 15px;
























contrastWhite: '#fbfbfb',
contrastGreyscale08: '#576975',
contrastGreyscale07: '#677178',
contrastGreyscale06: '#9BA7AE',
contrastGreyscale05: '#c2c6c9',
contrastGreyscale04: '#c8ced1',
contrastGreyscale03: '#e6eaeb',
contrastGreyscale02: '#e7eaec',
contrastGreyscale01: '#f3f5f5',
productGreyscale01: '#88959c',
productGreyscale02: '#80898d',
productGreyscale03: '#6c7479',
dsmsGreyscale: '#f4f8fa',
/** Alert / System Colors */
/** @deprecated use the color error thats inside of the errors colors below */
systemRed01: '#C82B38',
systemRed02: '#faf5f8',
/** @todo Figma swaps green01 and green02 in their design token */
systemSecureGreen01: '#eafdf7',
systemSecureGreen02: '#269b78',
systemSecureOrange01: '#fbaf5f',
systemSecureOrange02: '#fff7ef',
/** Called infoNotificationBorder in CDXUI: */
systemSecureBlue01: '#5597fb',
























* Groups 1-4 (G1-G4) are mapped groups of elements whose colors can be
* configured by the tenant in the Astro application. By default, these are all
* set to `contrastBlack`.
*
* [NB]: at MVP launch, only G1 will be configurable by tenant.
*/
const groupings = {
G1: palette.contrastBlack,
G2: palette.contrastBlack,
G3: palette.contrastBlack,
G4: palette.contrastBlack,
};

/**
* Colors for text that sits on top of Group colors. Can be overridden based
* on tenant configuation to ensure contrast levels meet accessibility.
*/
const groupingText = {
T1: palette.contrastWhite,
TI1: palette.contrastBlack,
colorMode: 'DARK',
};

/**
























/**
* Analytics Colors (as defined in Figma: https://www.figma.com/file/ZSGcrIKQbXzpadx308GDE4/00.00-%F0%9F%8C%90DX-Global-Styles-Library?node-id=3402%3A9627)
*/
const analyticsColors = {
analytics1: palette.black,
analytics2: '#001AFF',
analytics3: '#FAB500',
analytics4: '#F79401',
analytics5: '#1F40B5',
analytics6: '#5C80E5',
analytics7: '#FFECD4',
analytics8: '#AD15F8',
analytics9: '#00E4A0',
/** 10 and 11 are Brand Color on Figma, which is white in the design token */
analytics10: palette.white,
analytics11: palette.white,
};

/**
* DynamicForm Display Text Color Overrides
*/
const dynamicFormColors = {
applicationDisplayTextLightMode: palette.contrastBlack,

























const primaryDataVizColors = {
/* Blue */
blue10: '#9ED4FA',
blue30: '#5FB7F7',
blue50: '#0D93F2',
blue70: '#0861A0',
blue90: '#053B61',
/* Yellow */
yellow10: '#FFE399',
yellow30: '#FFD057',
yellow50: '#FFB900',
yellow70: '#A87A00',
yellow90: '#664A00',
/* Orange */
orange10: '#FAC09E',
orange30: '#F7975F',
orange50: '#F36716',
orange70: '#A04008',
orange90: '#612705',
};

const alternateDataVizColors = {
/* Purple */
























red50: '#E00808',
red70: '#850505',
red90: '#540303',
};

const dataVizColors = {
...primaryDataVizColors,
...alternateDataVizColors,
...tertiaryDataVizColors,
};

/**
* Breakpoint is a minimum width of a given device
* 0-385:    Small Mobile
* 386-767:  Mobile
* 768-1229: Tablet / Small Laptop
* 1330+:    Desktop
*/
const breakpoints = [386, 768, 1330];

/**
* Completed default theme. Any TENANT-SUPPLIED theme values should be spread
* into this object for rendering.
*/
























};

export { errors as errorPalette };

export type IThemeColors = keyof typeof defaultTheme;
