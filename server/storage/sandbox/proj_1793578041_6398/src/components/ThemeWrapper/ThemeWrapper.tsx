/* eslint no-param-reassign:0 */
import { GlobalStyles, Fonts } from 'styles';
import { defaultTheme } from 'styles/themes/default';
import { Spinner } from 'components/atoms/Spinner';

import { ThemeProvider } from 'styled-components';

























    /** As per WCAG accessibility requirements, the ratio value would be 4.5:1 or greater (which means 0.222... or *smaller*)
*  https://www.w3.org/TR/WCAG20-TECHS/G18.html
*/

    if (ratio < 1 / 4.5) {
// If the ratio of G1 against black is greater than 4.5:1 (or less than 0.222...), then G1's a light color, and the text should be black (light mode)
themeOverrides.T1 = defaultTheme.black;
themeOverrides.TI1 = defaultTheme.white;
themeOverrides.colorMode = DisplayMode.LIGHT;
} else {
// If the ratio of G1 against black is 4.5:1 or less (or greater than 0.222...), then G1's a dark color, and the text should be white (dark mode)
themeOverrides.T1 = defaultTheme.white;
themeOverrides.TI1 = defaultTheme.black;
themeOverrides.colorMode = DisplayMode.DARK;
}
}

  const modifiedTheme = {
...defaultTheme,
...themeOverrides,
};
























