import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
// nodejs library to set properties for components
import PropTypes from 'prop-types';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
// @material-ui/icons

// core components
import styles from 'assets/jss/material-dashboard-pro-react/components/cardHeaderStyle.js';

const useStyles = makeStyles(styles);

export default function CardHeader(props) {
const classes = useStyles();
const {
className,
children,
color,
plain,
image,


















  }};
return (
<div className={cardHeaderClasses} {...rest}>
{children}
</div>
  };
}

CardHeader.propTypes = {
className: PropTypes.string,
color: PropTypes.oneOf([
'warning',
'success',
'danger',
'info',
'primary',
'rose',
'cuna1',
  ]},
plain: PropTypes.bool,
image: PropTypes.bool,
contact: PropTypes.bool,
signup: PropTypes.bool,
stats: PropTypes.bool,
icon: PropTypes.bool,
text: PropTypes.bool,
children: PropTypes.node,
};
