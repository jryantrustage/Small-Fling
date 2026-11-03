import { createGlobalStyle } from 'styled-components';
import cdn from 'styles/cdn';

/* [TODO]: After MVP, request proper font fallback for extended fonts from the design team */
/* add the missing font-display: swap; for all extended fonts */
























  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaExpandedMedium}) format('woff');
font-weight: 500;
font-style: normal;
font-stretch: expanded;
font-display: swap;
}

  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaExpandedBold}) format('woff');
font-weight: bold;
font-stretch: expanded;
font-display: swap;
}

  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaCondensedBold}) format('woff');
font-weight: bold;
font-stretch: condensed;
font-display: swap;
}
























  /**
* Baked-in fonts for Chart.js
*/

  @font-face {
font-family: 'GTAmerica-CondensedBold';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaCondensedBold}) format('woff');
font-weight: normal;
font-stretch: condensed;
font-display: swap;
}

  @font-face {
font-family: 'GTAmerica-CondensedRegular';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaCondensedRegular}) format('woff');
font-weight: normal;
font-stretch: condensed;
font-display: swap;
}

  /**
* [DEPRECATED FONTS]:
* the style-guide doesn't include this font-faces. Currently we are not using any in loan-application
* not removing, because I'm not sure if this will cause some issues in sim
























  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaStandardLight}) format('woff');
font-weight: 300;
font-stretch: condensed;
}

  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaStandardMedium}) format('woff');
font-weight: 500;
font-style: normal;
font-stretch: normal;
}

  @font-face {
font-family: 'GTAmerica';
src: url(${({ fontsPath }) => fontsPath}${cdn.fonts.GTAmericaCondensedBold}) format('woff');
font-weight: 600;
font-stretch: condensed;
}
`;
