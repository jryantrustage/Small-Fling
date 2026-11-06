import React from 'react';
import { FormControlLabel, Switch, Grid } from '@material-ui/core';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import { ViewSetting } from './ViewSetting';
import Header from '../Header/Header';
import Add from '@material-ui/icons/Add';
import Button from 'components/CustomButtons/Button';
import Delete from '@material-ui/icons/Delete';

import ProfileCollectionDialog from'components/LoadTenantIntegrationProfiles/ProfileCollectionDialog';
import GridContainer from 'components/Grid/GridContainer';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';

export class ToggleFactory {
constructor(viewMode, classes, idPrefix) {
this.viewMode = viewMode;
this.classes = classes;
this.idPrefix = idPrefix;
}

  createComponent(templateSetting, context, settingFactory, customSettingCode) {
const controls = [];
const controlsCollection = [];
const switchChecked = customSettingCode
? context.getSettingValue(customSettingCode)
: context.getSettingValue(templateSetting.settingCode);
if (
templateSetting.collectionSettings &&
templateSetting.collectionSettings.length > 0
    ] {
const ctrlCollection = context.getControlCollection(
templateSetting.settingCode,
      ];
if (ctrlCollection) {
//ctrlCollection.sort((s1, s2) => s1.item - s2.item);
ctrlCollection.forEach((row) => {
const valuesCollection = [];
row.values.forEach((control, idx1) => {
const element = settingFactory.createComponent(
templateSetting.collectionSettings[idx1],
context,
control.settingCode,
            };
controls.push(element);
valuesCollection.push(element);
          }];
controlsCollection.push({
item: row.item,
values: valuesCollection,
          }];
        }];
}
}

    if (this.viewMode === ViewMode.View || customSettingCode) {
return (
<GridItem xs={12}>
<ViewSetting
label={
templateSetting.headingLabel
? templateSetting.headingLabel
: templateSetting.label
}
isCustomSettingCode={customSettingCode == null ? false : true}
settingName={`${templateSetting.settingCode}`}
settingValue={switchChecked ? 'Yes' : 'No'}
classes={this.classes}
          [>
{templateSetting.collectionSettings != null ? (
<Grid container direction="row">
{templateSetting.collectionSettings.map(
(headerControl, index) => {
return (
<GridItem
key={index}
xs={Math.ceil(
12 / templateSetting.collectionSettings.length,
                      ]}
>
<p style={{ fontWeight: 'bold', fontStyle: 'italic' }}>
{headerControl.label}
</p>
</GridItem>
                  ];
},
              }}
{controls.map((ctrl, index) => {
return (
<GridItem
key={index}
xs={Math.ceil(
12 / templateSetting.collectionSettings.length,
                    ]}
>
{ctrl}
</GridItem>
                };
              }]}
<br></br>
<br></br>
<br></br>
</Grid>
          } ; {
            ` `
          }}
</GridItem>
      ];
}
return (
<TemplateOption
templateSetting={templateSetting}
context={context}
switchChecked={switchChecked}
settingFactory={settingFactory}
controls={controlsCollection}
controlsAll={controls}
viewMode={this.viewMode}
classes={this.classes}
      [>
    ];
}
}

function TemplateOption(props) {
const [showPopOver, setShowPopOver] = React.useState(false);

  const handlePopover = (isPopOver) => {
if (!props.context.getSettingValue(props.templateSetting.settingCode)) {
props.context.updateSettingValue(props.templateSetting.settingCode, true);
}
setShowPopOver(isPopOver);
};

  const handleDeleteItem = (
settingCode,
collectionSettings,
context,
index,
) => {
context.removeCollectionItem(settingCode, collectionSettings, index);
};

  const layoutConfig = props.templateSetting.headingLabel
? {
sm: 5,
md: 5,
}
    ; {
sm: 12,
md: 12,
};

  return (
<GridItem xs={12}>
<div
className={
props.classes.checkboxAndRadio +
          ` ` >
props.classes.checkboxAndRadioHorizontal
}
style={{
margin: '0 auto 15px',
width: props.templateSetting.headingLabel ? '100%' : '50%',
}}
>
<GridContainer>
{props.templateSetting.headingLabel && (
<GridItem xs={12} sm={5} md={5}>
<CustomFormLabel
className={props.classes.labelHorizontal}
styleType="textFieldFactory"
label={props.templateSetting.headingLabel}
/>
</GridItem>
          }}
<GridItem xs={12} sm={layoutConfig.sm} md={layoutConfig.md}>
<FormControlLabel
value={props.context.getSettingValue(
props.templateSetting.settingCode,
              }}
// disabled={viewMode === ViewMode.View}
control={
<Switch
id={props.templateSetting.settingCode + '-toggle'}
name={props.templateSetting.settingCode + '-toggle'}
checked={props.switchChecked}
onChange={(event) => {
props.context.notifyChange(
props.templateSetting.settingCode,
event.target.checked,
                    ];
}}
value={
props.context.getSettingValue(
props.templateSetting.settingCode,
                    )
}
classes={{
switchBase: props.classes.switchBase,
checked: props.classes.switchChecked,
thumb: props.classes.switchIcon,
track: props.classes.switchBar,
}}
disabled={!(props.templateSetting.enabled ?? true)}
/>
}
classes={{
label: props.classes.label,
}}
label={<Header>{props.templateSetting.label}</Header>}
/>
</GridItem>
</GridContainer>
</div>

      {props.templateSetting.collectionSettings != null ? (
<div>
<Grid container direction="column" alignItems="flex-end">
<GridItem xs={4}>
<Button
//id="add-permissions"
id={props.templateSetting.settingCode + '-button'}
role="add-permissions"
round
disabled={
props.viewMode === ViewMode.View || !props.switchChecked
}
onClick={() => handlePopover(true)}
color="success"
className="create"
>
<Add /> ADD
</Button>
<ProfileCollectionDialog
isValid={true}
showPopOver={showPopOver}
currentElement={props.templateSetting.settingCode}
context={props.context}
ctrlCollection={props.templateSetting.collectionSettings}
handlePopover={() => handlePopover(false)}
settingFactory={props.settingFactory}
></ProfileCollectionDialog>
</GridItem>
</Grid>
<Grid container direction="row">
{props.templateSetting.collectionSettings.map(
(headerControl, index) => {
return (
<GridItem
key={index}
xs={Math.ceil(
12 / props.templateSetting.collectionSettings.length,
                    ]}
>
<p style={{ fontWeight: 'bold', fontStyle: 'italic' }}>
{headerControl.label}
</p>
</GridItem>
                };
},
            }}
</Grid>
<Grid container direction="row">
{props.controls.map((row, parentIndex) => {
//console.log(row);
return row.values.map((controlItem, index) => {
//console.log(controlItem);
return (
<GridItem
key={index}
xs={Math.ceil(
12 / props.templateSetting.collectionSettings.length,
                    ]}
>
<div style={{ float: 'left', width: '81%' }}>
{controlItem}
</div>
{index ===
props.templateSetting.collectionSettings.length - 1 ? (
<div
style={{ float: 'right', margin: '-10px 0px 10px 0px' }}
>
<Button
id={
props.templateSetting.settingCode +
row.item +
'_delete'
}
justIcon
round
disabled={props.viewMode === ViewMode.View}
onClick={() =>
handleDeleteItem(
props.templateSetting.settingCode,
props.templateSetting.collectionSettings,
props.context,
row.item,
                             }
}
color="danger"
className="edit"
>
<Delete />
</Button>{' '}
</div>
                    ] ; [
                       ` `
                    ]}
</GridItem>
});
              }];
            }]}
</Grid>
</div>
      ] ; [
        ``
      ]}
</GridItem>
  ];
}
