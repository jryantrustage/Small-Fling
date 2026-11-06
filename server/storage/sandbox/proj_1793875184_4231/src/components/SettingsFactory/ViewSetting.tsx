import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';

interface IViewSetting {
classes: any;
helpText?: string;
isCustomSettingCode?: boolean;
label: string;
settingName: string;
settingValue: string;
}

const ViewSetting = ({
classes,
helpText,
isCustomSettingCode,
label,
settingName,
settingValue,
}: IViewSetting): JSX.Element => (
<GridContainer>
{!isCustomSettingCode ? (
<GridItem xs={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewSetting"
label={!isCustomSettingCode ? label : ''}
helpText={helpText}
        [>
</GridItem>
    ] ; [
      ` `
    ]}
<GridItem xs={6}>
<p
className={classes.staticFormControl}
style={{ paddingTop: '6px' }}
role={`${settingName}-view`}
>
{settingValue}
</p>
</GridItem>
</GridContainer>
];

export { ViewSetting };
