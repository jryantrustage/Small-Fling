import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { DynamicInputField, SimpleAccordion } from 'commonui';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import { IEligibilityDetailsComponent } from 'components/Membership/types';
import React from 'react';
import { isKeyLink } from './useEligibility';
import { SCCategory, SCDetail, SCTitle } from './styles';

const useStyles = makeStyles(styles);

const EligiblityDetails = ({
model,
setDetails,
}: IEligibilityDetailsComponent): JSX.Element => {
const classes = useStyles();

  return (
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4
id="eligibility-identification-card-header"
className={classes.cardTitle}
>
Eligibility Details
</h4>
</CardText>
</CardHeader>
<CardBody>
{model.map(({ description, key, value, error }) => {
const isLink = isKeyLink(key);
return (
<SCCategory key={key}>
<SimpleAccordion
expandedOverride={true}
id={key}
title={key}
content={
<SCDetail key={key}>
<DynamicInputField
validateAllFields
dataField={{
fieldType: 'text',
fieldCode: `elegibility-description-${key}`,
fieldLabel: 'Description',
}}
value={description}
onChange={(_, newDescription) => {
setDetails(key, { description: newDescription });
}}
                    [>
<DynamicInputField
error={error}
validateAllFields
dataField={{
fieldType: 'text',
fieldCode: `elegibility-value-${key}`,
fieldLabel: 'Value',
placeHolder: isLink ? 'www.google.com' : '',
exposition: isLink
? [
{
content:
'Please provide a url. The http(s) protocol will be removed on save',
order: 1,
},
                             ]
                           ; [],
                      }}
122value={value}
                      onChange={(_, newValue)=> {
124setDetails(key, { value: newValue );
                      }}
                    [>
127/SCDetail>
                }
                buttonComponent={
130<sCTitle expandedText={key} collapsedText={key) />
                }
              />
133</ScCategory>
          };
        }]}
136</CardBody>
137 </Card>
  ];
};

export default EligiblityDetails;
