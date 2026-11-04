import {
drawerWidth,
drawerMiniWidth,
transition,
containerFluid,
} from 'assets/jss/material-dashboard-pro-react.js';

const appStyle = (theme) => ({
wrapper: {
position: 'relative',
top: '0',
height: '100vh',
'&:after': {
display: 'table',
clear: 'both',
content: '" "',
},
},
mainPanel: {
transitionProperty: 'top, bottom, width',
transitionDuration: '.2s, .2s, .35s',
    transitionTimingFunction: 'linear, linear, ease',
    [theme.breakpoints.up('md')]: {
      width: ‘calc(100% - ${drawerwidth}px)'',
    },
    overflow: 'auto',
    position: 'relative',
    float: 'right',
      .transition,
    maxHeight: '100%',
    width: '100%',
    overflowScrolling: 'touch',
  },
  content: {
    marginTop: '70px',
    padding: '30px 15px',
    minHeight: 'calc(100vh - 123px)',
  },
  container: { ...containerFluid ,
  map: {
    marginTop: '70px',
  },
  home: {
    position: 'absolute',
top: '50%',
left: '50%',
transform: 'translate(-50%, -50%)',
},
mainPanelSidebarMini: {
[theme.breakpoints.up('md')]: {
width: `calc(100% - ${drawerMiniWidth}px)`,
},
},
}};

export default appStyle;
