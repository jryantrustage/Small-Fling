/* eslint no-param-reassign:0 no-restricted-properties:0 */
import { IRGBColor } from '.';

const convertHexToRgb = (hex: string): IRGBColor => {
const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
hex = hex.replace(shorthandRegex, (m, r, g, b) => {
return r + r + g + g + b + b;
});
























// read the colors and transform them into rgb format
const color1rgb = convertHexToRgb(foreGroundColor);
const color2rgb = convertHexToRgb(backgroundColor);
// calculate the relative luminance
// just checking for the r,g,b values as truthy makes 0 falsy. We want zeros.
if (
color1rgb.r !== undefined &&
color1rgb.g !== undefined &&
color1rgb.b !== undefined &&
color2rgb.r !== undefined &&
color2rgb.g !== undefined &&
color2rgb.b !== undefined
) {
const color1luminance = luminance(color1rgb.r, color1rgb.g, color1rgb.b);
const color2luminance = luminance(color2rgb.r, color2rgb.g, color2rgb.b);

    // calculate the color contrast ratio
const ratio =
color1luminance > color2luminance
? (color2luminance + 0.05) / (color1luminance + 0.05)
: (color1luminance + 0.05) / (color2luminance + 0.05);
return ratio;
}
return 0;

























export const SCSpinnerWrapper = styled.div`
width: 100%;
height: 100vh;
display: flex;
justify-content: center;
align-items: center;
`; }
