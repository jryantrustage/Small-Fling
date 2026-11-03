import { palette } from './default';
import { IFontName } from './fontStyles';

export type Mode = 'DARK' | 'LIGHT';

export const modeStyles: Partial<Record<IFontName, Record<Mode, string>>> = {
title4: {
DARK: `color: ${palette.contrastWhite}`,
LIGHT: `color: ${palette.contrastBlack}`,
},
title3: {
DARK: `color: ${palette.contrastWhite}`,
LIGHT: `color: ${palette.contrastBlack}`,
},
body3: {
DARK: `color: ${palette.contrastGreyscale04}`,
LIGHT: `color: ${palette.contrastGreyscale08}`,
},
























}

export enum DisplayMode {
DARK = 'DARK',
LIGHT = 'LIGHT',
}

export enum Opacity {
'30%' = 0.3,
'40%' = 0.4,
'50%' = 0.5,
'60%' = 0.6,
'80%' = 0.8,
'85%' = 0.85,
}

export enum Shape {
Rounded = 'rounded',
Soft = 'soft',
}

export type IOpacity = keyof typeof Opacity;
export type IPropsHook = (props: Record<string, any>) => string;

























* Returns a color value from our theme definition
*/
static getColor(themeColorName: IThemeColors): IPropsHook {
return (props): string => props.theme && props.theme[themeColorName];
}

  static getModeColor({ dark, light }: { dark: IThemeColors; light: IThemeColors }): IPropsHook {
return (props): string => props.mode && props.theme && props.theme[props.mode === DisplayMode.DARK ? dark : light];
}

  /**
* Returns @media-query string
* e.g. '@media-query ((min-width: 0px) and (max-width: 379px))
* or ((min-width: 380px) and (max-width: 767px))'
*/
static getMediaQuery(...screenSizes: ScreenSize[]): IPropsHook {
return (props: Record<string, any>): string => {
const breakpoints = (props.theme && props.theme.breakpoints) || [1, 2, 3];
if (screenSizes.length === 0) throw new Error('wrong screen size');
if (screenSizes.length === 1) {
return `@media ${Theme.getMinMaxSize(screenSizes[0], breakpoints)}`;
}
const sizes = screenSizes.map((size) => Theme.getMinMaxSize(size, breakpoints));
return `@media ${sizes.join(',')}`;
























case ScreenSize.XL:
minWidth = breakpoints[2];
break;
default:
return 'wrong screen size';
}
mediaQuery = `(min-width: ${minWidth}px)`;
if (maxWidth > 0) {
mediaQuery += ` and (max-width: ${maxWidth}px)`;
}
return mediaQuery;
}

  /**
* Returns number from the breakpoint array
* e.g. 1024
*/
static getBreakpoint(screenSize: ScreenSize): number {
let newBreakpoint;
switch (screenSize) {
case ScreenSize.SM:
newBreakpoint = defaultTheme.breakpoints[0];
break;
case ScreenSize.MD:
























* @param mode DARK | LIGHT
*/
static getModeStyles(fontName: IFontName, mode: Mode): FlattenSimpleInterpolation {
const styles = modeStyles[fontName]?.[mode];
return css``
${styles || ''}
`;
}

  /**
* Returns the pixel height for the desired global navbar, action bar, or simulation
* dropdown bar.
* e.g. ${getGlobalHeaderHeight('globalNavbar')}
* @param heightName
*/
static getGlobalHeaderHeight(heightName: IThemeColors): IPropsHook {
return (props): string => props.theme && props.theme[heightName];
}

  /**
* Returns a opacity value from our theme definition
*/
static getOpacityValue(opacityName: IOpacity): number {
return Opacity[opacityName];























