import styled from 'styled-components';
import { Theme } from '../themes';

export const SCUtilityLabelIcon = styled.div``
margin-left: 9px;
display: inline-block;
vertical-align: top;
margin-bottom: -4px;

























// TODO Add consistent element styles (e.g. h1, h2...)
export const GlobalStyles = createGlobalStyle`
* {
padding: 0;
margin: 0;
border: 0;
box-sizing: border-box;
background-color: transparent;
box-sizing: border-box;
}

  body {
font-family: GTAmerica, Helvetica, sans-serif;
font-size: 16px;
box-sizing: border-box;
background: ${Theme.getColor('contrastGreyscale07')};
}

  button > * {
pointer-events: none;
}

  html, body, #root {
min-height: 100%;
























height: 0;
}

  .chzn-container.chzn-container-single {
color: ${Theme.getColor('contrastBlack')};
font-family: GT America;
font-style: normal;
font-weight: normal;
font-size: 16px; // prevent zoom
line-height: 20px;
span, .chzn-results li.active-result {
color: ${Theme.getColor('contrastBlack')};
}
}

  select.chzn-done {
font-size: 16px !important; // prevent zoom
}


/**
For Vehicle Sim takeover modal, position: to prevent nested scrollbars overflow: to prevent iOS scroll freeze glitch
*/

























export type IModeProps = IModePropsType;
export { DarkMode, LightMode } from './modes';
export * from './themes';
export * from './shared';
export * from './animations';
