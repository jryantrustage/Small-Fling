import React from 'react';

import { makeStyles } from '@material-ui/core/styles';

import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CardText from 'components/Card/CardText';

const useStyles = makeStyles(styles);

export default function Section(props) {
const classes = useStyles();

  const { id, title } = props;

  return (
<Card id={id}>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>{title}</h4>
</CardText>
</CardHeader>
<CardBody>{props.children}</CardBody>
</Card>
  ];
}
