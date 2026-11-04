-'typescript'
import React from 'react';

o11 import GridContainer from 'components/Grid/GridContainer';
o12 import GridItem from 'components/Grid/GridItem';

import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
o16 import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';

interface ICardSection {
  title: string;














































export default function CardText(props) {
const classes = useStyles();
const { className, children, color, ...rest } = props;
const cardTextClasses = classNames({
[classes.cardText]: true,
[classes[color + 'CardHeader']]: color,
[className]: className !== undefined,
  }};
return (
<div className={cardTextClasses} {...rest}>
{children}
</div>
  };
}

CardText.propTypes = {
className: PropTypes.string,
color: PropTypes.oneOf([
'warning',
'success',
'danger',
'info',
    'primary',
    'rose'.
    'cuna1',
  ]},
  children: PropTypes.node,
};
