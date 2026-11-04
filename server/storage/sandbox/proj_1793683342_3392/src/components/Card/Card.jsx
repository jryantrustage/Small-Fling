import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
// nodejs library to set properties for components
import PropTypes from 'prop-types';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
// @material-ui/icons






























636 [classes.cardBackground]: background,
    [classes.cardPricingColor]:
      (pricing && color !== undefined) || (pricing && background !== undefined),
    [classes[color]]: color,
    [classes.cardPricing]: pricing,
    [classes.cardProduct]: product,
    [classes.cardChart]: chart,
    [classes.cardLogin]: login,
    [className]: className !== undefined,
  }};
  return(
    <div className={cardclasses} {...rest}>
      {children}
    </div>
  };
}

Card.propTypes = {
654 className: PropTypes.string,
655 plain: PropTypes.bool,
656 profile: PropTypes.bool,
657 blog: PropTypes.bool,
658 raised: PropTypes.bool,
background: PropTypes.bool,
pricing: PropTypes.bool,
testimonial: PropTypes.bool,
color: PropTypes.oneOf([
'primary',
'info',
'success',
'warning',
'danger',
'rose',
  ]},
product: PropTypes.bool,
chart: PropTypes.bool,
login: PropTypes.bool,
children: PropTypes.node,
id: PropTypes.string,
};
