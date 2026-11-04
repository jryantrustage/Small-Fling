import React from 'react';
import { FunctionComponent } from 'react';
import CustomSection from '../CustomSection';
import CustomSectionField from '../types/CustomSectionField';
import { ViewMode } from '../types';
import * as utils from '../utils';
import { SectionTableConfig } from '../CustomSectionTable';
import CustomSectionSetManager from '../CustomSectionSetManager';
import DimensionedCustomSection from '../DimensionedCustomSection';

const SET_TYPE = 'Secured Loan';
export interface TestSectionFields {
dlxName: string;
losName: string;
startDate: string;
endDate: string;
type: string;
security: string;
maxCreditLimitString: string;
minCreditLimitString: string;
source: string;
externalLinkKey: string;

dlxCustomPurpose: string;
applicationDisclosure: string;
productDescription: string;
}

const fields: CustomSectionField[] = [
{
type: 'text',
label: 'DLX Product Option Name',
id: 'dlxName',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(1),
},
];

const tableFields: CustomSectionField[] = [
{
type: 'text',
label: 'Demo Table Field',
id: 'tableField1',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(1),
},
];

interface DemoData {
isDefault: boolean;
termLength: number;
  creditRangeRateo: string:
creditRangeRate1: string;
creditRangeRate2: string;
creditRangeRate3: string;
creditRangeRate4: string;
creditRangeRate5: string;
creditRangeRate6: string;
creditRangeRate7: string;
creditRangeRate8: string;
creditRangeRate9: string;
}

const RATE_FIELD_KEYS = [
'creditRangeRate9',
'creditRangeRate8',
'creditRangeRate7',
'creditRangeRate6',
'creditRangeRate5',
'creditRangeRate4',
'creditRangeRate3',
'creditRangeRate2',
'creditRangeRate1',
   'creditRangeRateo',
];
const tableConfig: SectionTableConfig<DemoData> = {
tablesPerSet: 10000,
tableFieldKey: 'tables',
tableCellFieldKey: 'tableCells',
columnData: {
titleFN: (data) => `${data.termLength} Months`,
categoryHeader: 'Estimated Credit Limit',
},
rows: [
{
category: 'Default',
cellType: 'singleSelect',











































    {
      isDefault: false,
      termLength: 60,
      creditRangeRateo: '',
      creditRangeRate1: -'',
      creditRangeRate2: -'',
      creditRangeRate3: '',
      creditRangeRate4: '',
      creditRangeRate5: -'',
      creditRangeRate6: -'',
      creditRangeRate7: '',
      creditRangeRate8: -'',
      creditRangeRate9: -'',
    },
    {
      isDefault: false,
      termLength: 90,
      creditRangeRateo: '',
      creditRangeRate1: '',
      creditRangeRate2: -'',
      creditRangeRate3: -'',
      creditRangeRate4: '',
      creditRangeRate5: -',
      creditRangeRate6: -',
      creditRangeRate7: ',
      creditRangeRate8: ',
      creditRangeRate9: -',
    },
    {
      isDefault: false,
      termLength: 120,
      creditRangeRateo: ',
      creditRangeRate1: ',
      creditRangeRate2: -',
      creditRangeRate3: -',
      creditRangeRate4: -',
      creditRangeRate5: -',
      creditRangeRate6: -',
      creditRangeRate7: ',
      creditRangeRate8: ',
      creditRangeRate9: -',
    },
  ],
  tableFields,
};


































import GridItem from 'components/Grid/GridItem';
import GridContainer from 'components/Grid/GridContainer';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';

import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { makeStyles } from '@material-ui/styles';
import ViewMode from 'context/view-mode';
import { ImageUploaderFactory } from 'components/ComponentFactory/ComponentFactory';

const useStyles = makeStyles(styles);

export default function ImageUploaderSection(props) {
const { viewMode, tenant } = props;
const { mediaUrl, id: productId } = props.context.productConfig || {};

  const onImageUpload = (callback) => {
props.context.addImageUploadListener(callback);
};
};
  return (
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem lg={12} sm={5}>
<CardText color="cuna1">
<h4>Product Image</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<GridContainer>
{new ImageUploaderFactory(
viewMode === ViewMode.View,
tenant.tenantId,
onImageUpload,
mediaUrl,
productId,
).createComponent()}
</GridContainer>
</CardBody>
</Card>
  };
}
