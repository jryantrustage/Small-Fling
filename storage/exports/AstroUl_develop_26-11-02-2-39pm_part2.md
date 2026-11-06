
















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































    // add upload hook if the rest of the product config uploads successfully
    props.context.addUploadListener(
      (context, productId, newVersionofsubcomponents, recordstate) => {
        // fetch the latest state of the products from cache
        const ancillaryProducts = context.getCachedobject(
          CACHE_OBJECT_KEY_ANCILLARY_PRODUCTS,
        };

        if(!ancillaryProducts){
          return Promise.resolve();
        }

        ancillaryProducts.productId = productId;
        ancillaryProducts.recordstate = recordstate;

        ancillaryProducts.forEach((product) => delete product.active);

        const url = '${process.enV.REACT_APP_ANCILLARY_PRODUCTS_API_BASE_URL}core-product- ancillary-products/$(productId}';

        //l console.log(JsoN.stringify(ancillaryProducts))

        const config = {
          headers: {
'X-TEMPLATE-ID': templateId,
},
body: ancillaryProducts,
};

        return client2(url, 'PUT', config);
},
    ];

    if (viewMode === ViewMode.Create) {
// fetch default ancillary products configuration, using the product template
client2(
`${process.env.REACT_APP_ANCILLARY_PRODUCTS_API_BASE_URL}core-product-template-ancillary-products/${templateId}`,
      ]
.then((data) => {
// console.log(data)

          let fetchedAncProducts = data.payload;

          // TODO -> shouldn't need to filter for this?
fetchedAncProducts = fetchedAncProducts.filter(
(product) => product.subTypes && product.subTypes.length > 0,
          };

          fetchedAncProducts.forEach((product) => {
product.active = product.subTypes.some((subtype) => subtype.active);

            // temporary code to account for unique GAP product configuration
if (!product.active || product.type !== 'GAP') {
return;
}
if (
product.subTypes.filter((subtype) => subtype.active).length > 1
            } {
// force only one GAP option to be active
product.subTypes.forEach((subtype) => (subtype.active = false));
product.subTypes[0].active = true;
}
          }];

          setAncillaryProducts(fetchedAncProducts);
setLoading(false);
        }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
        }];

      return;
}

    // ... in edit/view mode - fetch and show the product instance's relationships

    const config = {
headers: {
'X-TEMPLATE-ID': templateId,
},
};
const productId = props.productInstance.id;

    client2(
`${process.env.REACT_APP_ANCILLARY_PRODUCTS_API_BASE_URL}core-product-ancillary-products/${productId}`,
'GET',
config,
    ]
.then((data) => {
// console.log(data)

        let fetchedAncProducts = data.payload;

        // TODO -> shouldn't need to filter for this?
fetchedAncProducts = fetchedAncProducts.filter(
(product) => product.subTypes && product.subTypes.length > 0,
        };

        fetchedAncProducts.forEach((product) => {
product.active = product.subTypes.some((subtype) => subtype.active);

          // temporary code to account for unique GAP product configuration
if (!product.active || product.type !== 'GAP') {
return;
}
if (product.subTypes.filter((subtype) => subtype.active).length > 1) {
// force only one GAP option to be active
product.subTypes.forEach((subtype) => (subtype.active = false));
product.subTypes[0].active = true;
}
        }];

        setAncillaryProducts(fetchedAncProducts);
setLoading(false);
      }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
      }];

    // TODO -> local test settings
// let fetchedAncProducts = require('components/__mock__/fakeAncillaryProducts.json')
// fetchedAncProducts = fetchedAncProducts.filter(prod => prod.recordState === "Active")

    // // set UI-specific flag determining if the ancillary product is active, based on
// // the subtypes' active status
// fetchedAncProducts.forEach(product => {
//     product.active = product.subTypes.some(subtype => subtype.active)
// })

    // setAncillaryProducts(fetchedAncProducts)
// setLoading(false)
}, [loading]);

  const changeProductActiveStatus = (productName, isChecked) => {
const snapshot = JSON.parse(JSON.stringify(ancillaryProducts));

    const targetProduct = snapshot.find((prod) => prod.name === productName);
if (!targetProduct) return;

    if (isChecked) {
targetProduct.active = true;
targetProduct.subTypes.forEach((subtype) => (subtype.active = true));
setAncillaryProducts((prev) => {
return snapshot;
      }];
return;
}

    targetProduct.active = false;
targetProduct.subTypes.forEach((subtype) => (subtype.active = false));

    setAncillaryProducts((prev) => {
return snapshot;
    }};
};

  // temporary feature
const changeRadioButtonProductActiveStatus = (productName, isChecked) => {
const snapshot = JSON.parse(JSON.stringify(ancillaryProducts));

    const targetProduct = snapshot.find((prod) => prod.name === productName);
if (!targetProduct) return;

    if (isChecked) {
targetProduct.active = true;

      if (targetProduct.subTypes && targetProduct.subTypes.length > 0) {
// select the first option by default
targetProduct.subTypes[0].active = true;
}

      setAncillaryProducts((prev) => {
return snapshot;
      }];

      return;
}

    targetProduct.active = false;
targetProduct.subTypes.forEach((subtype) => (subtype.active = false));

    setAncillaryProducts((prev) => {
return snapshot;
    }};
};

  const changeSubtypeActiveStatus = (productName, subtypeId, isChecked) => {
const snapshot = JSON.parse(JSON.stringify(ancillaryProducts));

    const targetProduct = snapshot.find((prod) => prod.name === productName);
if (!targetProduct) return;

    if (isChecked) {
// if a plan under the product is set to active, then the product is active
targetProduct.active = true;
}

    const targetSubtype = targetProduct.subTypes.find(
(subtype) => subtype.id === subtypeId,
    ];
if (!targetSubtype) return;

    targetSubtype.active = isChecked;

    targetProduct.active = targetProduct.subTypes.some(
(subtype) => subtype.active,
    ];

    setAncillaryProducts((prev) => {
return snapshot;
    }};
};

  // temporary feature
const changeSubtypeRadioButtonActiveStatus = (productName, subtypeId) => {
const snapshot = JSON.parse(JSON.stringify(ancillaryProducts));

    const targetProduct = snapshot.find((prod) => prod.name === productName);
if (!targetProduct) return;

    targetProduct.active = true;

    targetProduct.subTypes.forEach((subtype) => {
subtype.active = subtype.id === subtypeId;
    }};

    setAncillaryProducts((prev) => {
return snapshot;
    }};
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  if (!ancillaryProducts || ancillaryProducts.length === 0) {
return <div />;
}

  // cache the state of the product assignments on each render
props.context.cacheObject(
CACHE_OBJECT_KEY_ANCILLARY_PRODUCTS,
ancillaryProducts,
  ];

  const components = ancillaryProducts.map((ancilProduct, idx) => {
return (
<GridItem key={idx} xs={12} md={6}>
<GridContainer>
<GridItem xs={12} xl={12}>
{props.viewMode === ViewMode.View ? (
<ViewSetting
label={ancilProduct.name}
settingName={`${ancilProduct.name}-view`}
settingValue={ancilProduct.active ? 'Yes' : 'No'}
classes={classes}
/>
            } ; {
<FormControlLabel
key={ancilProduct.name + '-' + 'control'}
control={
<Checkbox
id={ancilProduct.name}
checked={ancilProduct.active}
onChange={(event) => {
// temporary control for GAP plans
if (ancilProduct.type === 'GAP') {
changeRadioButtonProductActiveStatus(
ancilProduct.name,
event.target.checked,
                        ];
return;
}

                      changeProductActiveStatus(
ancilProduct.name,
event.target.checked,
                      ];
}}
value={ancilProduct.name}
classes={{
checked: classes.checked,
}}
                  [>
}
label={<Header>{ancilProduct.name}</Header>}
/>
            }}
</GridItem>

          {ancilProduct.active && (
<GridItem xs={2} xl={2}>
<div />
</GridItem>
          }}

          <TypedSelectionList
viewMode={props.viewMode}
ancillaryProduct={ancilProduct}
changeSubtypeActiveStatus={changeSubtypeActiveStatus}
changeSubtypeRadioButtonActiveStatus={
changeSubtypeRadioButtonActiveStatus
}
classes={classes}
          [>
</GridContainer>
</GridItem>
    ];
  }};

  return (
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem lg={12} sm={5}>
<CardText color="cuna1">
<h4>Ancillary Products</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<GridContainer>{components}</GridContainer>
</CardBody>
</Card>
  ];
}

function TypedSelectionList(props) {
const ancillaryProduct = props.ancillaryProduct;

  if (ancillaryProduct.type !== 'GAP') {
return (
<CheckBoxes
viewMode={props.viewMode}
ancillaryProduct={ancillaryProduct}
update={props.changeSubtypeActiveStatus}
classes={props.classes}
      [>
    ];
}

  return (
<RadioButtons
viewMode={props.viewMode}
ancillaryProduct={ancillaryProduct}
update={props.changeSubtypeRadioButtonActiveStatus}
classes={props.classes}
    [>
  ];
}

function CheckBoxes(props) {
const ancillaryProduct = props.ancillaryProduct;

  return (
<GridItem xs={10} xl={10}>
<GridContainer>
{ancillaryProduct.subTypes.map((subtype, idx) => {
if (!ancillaryProduct.active) return <div key={idx} />;

          if (props.viewMode === ViewMode.View) {
return (
<GridItem key={idx} xs={12} xl={12}>
<ViewSetting
key={idx}
label={subtype.name}
settingName={`${ancillaryProduct.name}-${subtype.name}-view`}
settingValue={subtype.active ? 'Yes' : 'No'}
classes={props.classes}
/>
</GridItem>
            };
}

          return (
<GridItem key={idx} xs={12} xl={12}>
<FormControlLabel
key={`${ancillaryProduct.name}-${subtype.name}-control`}
control={
<Checkbox
id={`${ancillaryProduct.name}-${subtype.name}`}
checked={subtype.active}
onChange={(event) => {
props.update(
ancillaryProduct.name,
subtype.id,
event.target.checked,
                      ];
}}
value={`${ancillaryProduct.name}-${subtype.name}`}
                    classes={{
                      checked: props.classes.checked,
                    }}
                  [>
                }
                label={<Header>subtype.name}</Header>}
              />
            </GridItem>
          };
        }]}
      </GridContainer>
    </GridItem>
  ];
}

function RadioButtons(props) {
  const ancillaryProduct = props.ancillaryProduct;

  return(
    <GridItem xs={10} xl={10}>
      <GridContainer>
        {ancillaryProduct.subTypes.map((subtype, idx) => {
if (!ancillaryProduct.active) return <div key={idx} />;

          if (props.viewMode === ViewMode.View) {
return (
<GridItem key={idx} xs={12} xl={12}>
<ViewSetting
key={idx}
label={subtype.name}
settingName={`${ancillaryProduct.name}-${subtype.name}-view`}
settingValue={subtype.active ? 'Yes' : 'No'}
classes={props.classes}
/>
</GridItem>
            };
}

          return (
<GridItem key={idx} xs={12} xl={12}>
<FormControlLabel
key={`${ancillaryProduct.name}-${subtype.name}-control`}
control={
<Radio
id={`${ancillaryProduct.name}-${subtype.name}`}
checked={subtype.active}
onClick={(event) => {
props.update(ancillaryProduct.name, subtype.id);
}}
value={`${ancillaryProduct.name}-${subtype.name}`}
name={`${ancillaryProduct.name}-${subtype.name}-radio-button`}
aria-label={`${ancillaryProduct.name}-${subtype.name}`}
icon={
<FiberManualRecord
className={props.classes.radioUnchecked}
                      [>
}
checkedIcon={
<FiberManualRecord
className={props.classes.radioChecked}
                      [>
}
classes={{
checked: props.classes.radio,
root: props.classes.radioRoot,
}}
                  [>
}
label={<Header>{subtype.name}</Header>}
/>
</GridItem>
          };
        }]}
</GridContainer>
</GridItem>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 245. `C:\DevCode\AstroUI\src\components\CoreProduct\api.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProduct\api.ts" type=".ts" size="1307" lines="53" chars="1307" -->
```typescript
import { client2 } from 'utils/api-client';

export function getTemplate(
tenantId: string,
templateId: string,
): Promise<any> {
const config = { headers: { 'X-TENANT-ID': tenantId } };
return client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-product-templates/${templateId}`,
'GET',
config,
  ];
}

export function getDrafts(tenantId: string): Promise<any> {
const config = { headers: { 'X-TENANT-ID': tenantId } };
return client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products`,
'GET',
config,
  ];
}
}
export function getProductInstance(
tenantId: string,
productId?: string,
): Promise<any> {
const config = { headers: { 'X-TENANT-ID': tenantId } };
return client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products/${productId}`,
'GET',
config,
  ];
}

export function postCoreProductImage(
file: File,
tenantId: string,
productId?: string,
): Promise<any> {
const url = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products-media/${productId}`;
const formParams = new FormData();
formParams.append('fileContents', file);
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
body: formParams,
};

  return client2(url, 'POST', config, false);
}

```
<!-- CODESCAN_FILE_END -->

---

### 246. `C:\DevCode\AstroUI\src\components\CoreProduct\CoreProduct.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProduct\CoreProduct.tsx" type=".tsx" size="11543" lines="354" chars="11543" -->
```typescript
import React, { ReactElement, useEffect, useState } from 'react';
import CoreProductContext from 'components/CoreProduct/CoreProductContext';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { useAppContext } from 'context/app-context';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import SweetAlert from 'react-bootstrap-sweetalert';
import SnackbarContent from 'components/Snackbar/SnackbarContent';

import { makeStyles } from '@material-ui/core/styles';
import regularFormsStyle from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import customSelectStyle from 'assets/jss/material-dashboard-pro-react/customSelectStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import customCheckboxRadioSwitch from 'assets/jss/material-dashboard-pro-react/customCheckboxRadioSwitch';

import ViewMode from 'context/view-mode';
import { getTemplate, getDrafts, getProductInstance } from './api';
import upgradeProduct from './versioning/version-upgrader';
import { TemplateProductSpecificationJSON } from './types';
import { useNavigate, useParams } from 'react-router-dom';

const useSweetAlertStyles = makeStyles(sweetAlertStyle);
const useFormStyles = makeStyles({
...regularFormsStyle,
...customSelectStyle,
select: {
...customSelectStyle.select,
padding: '0px 0 0px',
},
radioRoot: {
...customCheckboxRadioSwitch.radioRoot,
padding: '2px 16px 16px 16px', // order is: top, right, bottom, left
fontWeight: 'bold',
},
}};

const CoreProduct = (): JSX.Element => {
const {
tenant,
setDisplayCreateButton,
setPageTitle,
setCoreProduct,
setHasDecisioningInCoreProduct,
} = useAppContext();
const [loading, setLoading] = useState(true);
const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<ReactElement | null>(null);

  const [viewMode, setViewMode] = useState<string | null>(null);

  const [errorResponse, setErrorResponse] = useState<any>(null);
const [uploadError, setUploadErr] = useState(false);
const [uploadErrorMessage, setUploadErrorMessage] = useState(
'Server returned error while processing data. Please try again later.',
  ];

  const [errorSections, setErrorSections] = useState<string[]>([]);

  const [draftProducts, setDraftProducts] = useState(false);
const [productTemplate, setProductTemplate] = useState(null);
const [productInstance, setProductInstance] = useState(null);
const push = useNavigate();

  useEffect(() => {
setDisplayCreateButton(false);
}, []);

  // configure product template selection effect
const params = useParams();
useEffect(() => {
if (!loading) return;

    const tenantId = params.tenantId as string;
const templateId = params.templateId as string;
const viewMode = params.viewMode as string;
const productId = params.productId;
const titleList = new Map();
if (tenant) {
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
}

    getTemplate(tenantId, templateId)
.then((data) => {
const productSpecifications = JSON.parse(
data.payload.productSpecificationJSON,
) as TemplateProductSpecificationJSON;
const productSettings = productSpecifications?.sections?.find(
(item: { sectionCode: string }) => item.sectionCode === 'DECISIONING',
) || { settings: [] };
const decisionSetting = productSettings.settings.find(
(item: { settingCode: string }) =>
item.settingCode === 'USE-INTERNAL-DECISIONING',
        };
if (decisionSetting?.value) {
setHasDecisioningInCoreProduct(true);
} else {
setHasDecisioningInCoreProduct(false);
}
const template = {
...JSON.parse(data.payload.templateSpecificationJSON),
productSpecificationJSON: JSON.parse(
data.payload.productSpecificationJSON,
          },
id: templateId,
category: data.payload.category,
type: data.payload.type,
subtype: data.payload.subtype,
};

        setProductTemplate(template);

        if (viewMode === 'create') {
titleList.set(
`Core Products > `,
`/admin/tenant/${tenantId}/core-products`,
          };
titleList.set(
'Create Core Product',
`/admin/tenant/${tenantId}/core-products/${templateId}/create`,
          };
setProductInstance(JSON.parse(data.payload.productSpecificationJSON));
setPageTitle(titleList);

          setViewMode(ViewMode.Create);

          getDrafts(tenantId).then((data) => {
const draftProd = data.payload.filter(
(product: any) =>
product.recordState == 'Draft' &&
product.templateId == templateId,
            };
setDraftProducts(draftProd);
setLoading(false);
          }];

          return;
}

        // ... if in Edit/View mode, fetch the product instance
getProductInstance(tenantId, productId)
.then((data) => {
// console.log(data);

            const productInstance = {
...data.payload,
...JSON.parse(data.payload.specificationJSON),
};

            // remove string representation
delete productInstance.specificationJSON;

            titleList.set(
`Core Products > `,
`/admin/tenant/${tenantId}/core-products`,
            };
titleList.set(
productInstance.name,
`/admin/tenant/${tenantId}/core-products/${templateId}/${productId}/${viewMode}`,
            };
setPageTitle(titleList);

            if (viewMode !== 'upgrade') {
setProductInstance(productInstance);
setCoreProduct({ ...productInstance, viewMode });
setViewMode(viewMode === 'view' ? ViewMode.View : ViewMode.Edit);
setLoading(false);
return;
}

            // ... fetch old template for an upgrade
const oldTemplateId = productInstance.templateId;

            getTemplate(tenantId, oldTemplateId)
.then(({ payload }) => {
const oldTemplate = {
...JSON.parse(payload.templateSpecificationJSON),
productSpecificationJSON: JSON.parse(
                    payload.productSpecificationsoN,
                  ],
id: oldTemplateId,
};

                // the product upload will override to a new ID ... need to set this to the old id
// for independently-controlled components
const upgradedProduct: any = {
...upgradeProduct(oldTemplate, template, productInstance),
id: productInstance.id,
version: productInstance.version,
recordState: productInstance.recordState,
type: productInstance.type,
};

                setProductInstance(upgradedProduct);
setCoreProduct({
...upgradedProduct,
templateId: oldTemplateId,
viewMode: ViewMode.Upgrade,
name: productInstance.name,
                }};
setViewMode(ViewMode.Upgrade);
setLoading(false);
              }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
              }];
          }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
          }];
      }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
      }];
}, [loading]);

  const setUploadError = (errState: any) => {
const defaultMessage =
'Server returned error while processing data. Please try again later.';

    if (!errState || errState === '') {
setUploadErrorMessage(defaultMessage);
setUploadErr(false);
return;
}

    setUploadErrorMessage(
typeof errState === 'string' ? errState : defaultMessage,
    ];
setUploadErr(true);
};

  /* TODO -> need to find a better approach to passing down style classes
*  to component factories, without using React hooks. Current strategy requires
*  passing the classes into the constructor of each factory. */
const formClasses = useFormStyles();
const sweetAlertClasses = useSweetAlertStyles();

  const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
tenant
? push(`/admin/tenant/${tenant.id}/core-products`)
: push(`/admin/tenant`);
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  // pass form action methods to child components
const formOperations = {
setFormError: setErrorSections,
handleDiscardChanges: discardChangesWarning,
};

  let errorSectionsMsg: ReactElement;
if (errorSections && errorSections.length > 0) {
errorSectionsMsg = (
<div id="error-sections-message">
Please fix form errors in the following sections:
<ul>
{errorSections.map((sectionName, idx) => (
<li key={idx}>{sectionName}</li>
          }]}
</ul>
</div>
    ];
} else {
errorSectionsMsg = <div />;
}

  return (
<div>
{alert}
{uploadError && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={uploadErrorMessage}
close={true}
color="danger"
closeNotification={() => setUploadError(false)}
/>
</GridItem>
</GridContainer>
      ]}
{errorSections && errorSections.length > 0 && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={errorSectionsMsg}
close={true}
color="danger"
closeNotification={() => setErrorSections([])}
/>
</GridItem>
</GridContainer>
      ]}
<GridContainer>
<GridItem xs={12} md={12}>
<CoreProductContext
tenant={tenant}
viewMode={viewMode}
draftProducts={draftProducts}
productTemplate={productTemplate}
productInstance={productInstance}
formOperations={formOperations}
navigatePush={push}
setUploadError={setUploadError}
styleClasses={formClasses}
          [>
</GridItem>
</GridContainer>
</div>
  ];
};

export default CoreProduct;

```
<!-- CODESCAN_FILE_END -->

---

### 247. `C:\DevCode\AstroUI\src\components\CoreProduct\CoreProductContext.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProduct\CoreProductContext.jsx" type=".jsx" size="22049" lines="753" chars="22049" -->
```javascript
import ViewMode from 'context/view-mode';
import EventEmitter from 'events';
import { Base64 } from 'js-base64';
import React from 'react';
import { client2 } from 'utils/api-client';
import { v4 as uuid } from 'uuid';
import { CoreProductForm } from './CoreProductForm';
import configureValidators from '../../helpers/validation/validator-configuration';
import { DataValuesChangeTracker } from './versioning/DataValuesChangeTracker';
import { VersioningChecker } from './versioning/VersioningChecker';
import { validateRequiredFields } from './util/RequiredSettingsValidator';

export default class CoreProductContext extends React.Component {
validatorCount = 0;
validatorIncrement = 0;
uploaderIncrement = 0;
uploaderCount = 0;
/** Added to prevent upload and error checks from happening while the error state is still being updated
* (because this.setState is asynchronous and used in the this.updateError() function) */
errorsLoading = {};

  constructor(props) {
super(props);

    this.eventEmitter = new EventEmitter();
this.eventEmitter.setMaxListeners(1000);

    this.latestImageUploadListener = React.createRef();

    this.templateSettingsMap = new Map();

    this.styleClasses = props.styleClasses;

    this.productTemplate = props.productTemplate;
this.productConfig = props.productInstance;
this.productId = this.productConfig.id;

    this.sectionReferenceMap = new Map();

    configureValidators(this.productTemplate, this.productConfig, this);

    this.productTemplate.sections.forEach((section) => {
if (!section.settings) return; // must be a pre-built section reference
section.settings.forEach((setting) => {
this.templateSettingsMap.set(setting.settingCode, setting);
this.sectionReferenceMap.set(setting.settingCode, section.sectionTitle);
      }];
    }};

    const settingsMap = new Map();

    // build flattened settings map from arrays and add value change listeners for settings
this.productConfig.sections.forEach((section) => {
section.settings.forEach((setting) => {
const settingName = setting.settingCode;

        settingsMap.set(settingName, setting);

        this.eventEmitter.addListener(settingName, (ctxt, updatedValue) => {
this.updateSettingValue(settingName, updatedValue);
        }];
      }];
    }};

    this.changeTracker = new DataValuesChangeTracker(this.productConfig);
this.versioningChecker = new VersioningChecker(
this.productTemplate,
this.productConfig,
    ];

    // initialize errors object
const errors = {};
this.productConfig.sections.forEach((section) => {
section.settings.forEach(
(setting) => (errors[setting.settingCode] = null),
      ];
    }};

    this.objectCache = new Map();

    this.versioningSet = new Set();

    this.state = {
settingsMap: settingsMap,
errors: errors,
requestedState: null,
validationTriggered: false,
uploadHooksTriggered: false,
uploadError: false,
reload: false,
incrementVersion: false,
};
}

  render() {
if (this.uploadTwice && !this.onSecondUpload) {
// if the product is ultimately being saved as active, but the update to active status
// hasn't been performed yet, do not use the temporary state of the product's record state
return (
<CoreProductForm
{...this.props}
context={this}
productRecordState={this.updatingDraftProduct ? 'Draft' : 'Active'}
        [>
      ];
}

    return (
<CoreProductForm
{...this.props}
context={this}
productRecordState={this.productConfig.recordState}
      [>
    ];
}

  componentDidUpdate() {
if (this.state.uploadError) {
// ... if upload failed, reset the upload state and show notification
this.validatorIncrement = 0;
this.uploaderIncrement = 0;

      const errState = this.state.uploadError;

      this.setState((prev) => {
return {
...prev,
uploadHooksTriggered: false,
uploadError: false,
};
      }];

      this.props.setUploadError(errState);

      return;
}

    if (
this.state.uploadHooksTriggered &&
this.uploaderIncrement === this.uploaderCount
    ] {
// ... all independently-controlled components uploaded successfully.

      if (this.uploadTwice) {
this.onSecondUpload = true;
this.uploadProduct('Active');
return;
}

      // route to the product listing page
this.props.navigatePush(
`/admin/tenant/${this.props.tenant.id}/core-products`,
      ];
}

    if (!this.state.validationTriggered) return;

    if (
this.validatorCount > 0 &&
this.validatorIncrement < this.validatorCount
    ]
return;

    this.validatorIncrement = 0;
this.uploaderIncrement = 0;

    this.setState((prev) => {
return {
...prev,
validationTriggered: false,
};
    }};

    /** Move this to a helper function, so we can run the contained error-check and upload functionality
* after the error loading promise finishes if an error state is still being set at this point
     >[
const checkErrorsAndRunUpload = () => {
const sectionsWithErrors = this.checkForErrors();
if (sectionsWithErrors && sectionsWithErrors.size > 0) {
// form errors exist - show in UI
this.props.formOperations.setFormError(Array.from(sectionsWithErrors));
return;
}
// ... otherwise, validation passed - try to upload
this.props.formOperations.setFormError(false);
this.uploadProduct(this.state.requestedState);
};

    if (this.isAnErrorLoading()) {
new Promise((resolve) => {
/** Checks to see if there's still an error state key loading every 100ms,
* when none of them are loading anymore, run the error-check and upload functionality */
const checkInterval = setInterval(() => {
const errorStateLoading = this.isAnErrorLoading();
if (!errorStateLoading) {
clearInterval(checkInterval);
resolve();
}
}, 100);
}).then(() => {
checkErrorsAndRunUpload();
      }];
} else {
checkErrorsAndRunUpload();
}
}

  startUpload = (requestedState) => {
this.uploadTwice = this.props.viewMode === ViewMode.Create;
this.onSecondUpload = false;

    this.setState((prev) => {
return {
...prev,
requestedState: this.uploadTwice ? 'Draft' : requestedState,
validationTriggered: true,
errors: {}, // reset error state prior to validation
};
    }};
// on startUpload check the core product setup values min/max are valid
this.minMaxValidator(this.productConfig);
this.validateAll(requestedState);
};

  uploadProduct = (requestedState) => {
const productInstance = this.createFinishedProduct();

    let url = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products`;

    const instanceValuesMap = new Map();
productInstance.sections.forEach((section) => {
section.settings.forEach((setting) => {
instanceValuesMap.set(setting.settingCode, setting.value);
      }];
    }};

    const reqFieldsMissing = validateRequiredFields(
this,
productInstance,
this.productTemplate,
    ];

    if (reqFieldsMissing) {
// if the required fields validator finds missing fields, then upload will be skipped,
// and the error state will be updated
return;
}

    let productVersion = productInstance.version ? productInstance.version : 0;

    const newVersion = this.props.viewMode === ViewMode.Create;

    let productId;
let httpMethod;
let newVersionOfSubcomponents; // use POST for independently-controlled components (Rates, Ancillary Products)?

    if (newVersion && !this.onSecondUpload) {
productVersion = 1;
productId = this.productId ? this.productId : uuid().toUpperCase();
httpMethod = 'POST';
newVersionOfSubcomponents = true;
} else {
productId = this.productId;
url = `${url}/${productId}`;
httpMethod = 'PUT';
newVersionOfSubcomponents = false;
}

    productInstance.id = productId;

    const payload = {
id: productId,
templateId: this.props.productTemplate.id.toUpperCase(),
tenantId: this.props.tenant.id.toUpperCase(),
recordState: httpMethod === 'POST' ? 'Draft' : 'Active',
name: instanceValuesMap.get('CORE-PRODUCT-NAME'),
description: '',
category: instanceValuesMap.get('CORE-PRODUCT-CATEGORY'),
type: instanceValuesMap.get('CORE-PRODUCT-TYPE'),
subtype: instanceValuesMap.get('CORE-PRODUCT-SUBTYPE'),
version: productVersion,
versionDescription: '',
applicationIdleDuration: instanceValuesMap.get(
'LOAN-APPLICATION-IDLE-DURATION',
      ],
applicationExpiryDuration: instanceValuesMap.get(
'LOAN-APPLICATION-EXPIRY-DURATION',
      ],
allowSimulation: instanceValuesMap.get('ALLOW-SIMULATION')
? instanceValuesMap.get('ALLOW-SIMULATION')
: false,
metadataJSON: {},
businessRulesJSON: {},
specificationJSON: { sections: productInstance.sections },
mediaUrl: this.newMediaUrl ?? productInstance.mediaUrl,
};

    const config = {
headers: {
'X-TENANT-ID': this.props.tenant.id.toUpperCase(),
'X-B64-ENCODED': 'true',
'Content-Type': 'text/plain',
},
body: Base64.encode(JSON.stringify(payload)),
};

    const payloadLosRouting = {
losSystemName: instanceValuesMap.get('INTEGRATIONS-LOS'),
type: instanceValuesMap.get('CORE-PRODUCT-TYPE'),
subType: instanceValuesMap.get('CORE-PRODUCT-SUBTYPE'),
};

    const configLosRouting = {
headers: {
'X-CONTRACT-NUMBER': this.props.tenant.contractNumber,
},
body: payloadLosRouting,
};

    client2(url, httpMethod, config, false)
.then((data) => {
this.productId =
data?.payload && data.payload.id ? data.payload.id : productId;
productInstance.version = productVersion;

        // send los-routing request if product is being created and los name is provided from the dropdown
if (payloadLosRouting.losSystemName) {
client2(
`${process.env.REACT_APP_LOS_ADAPTER_API_BASE_URL}los-routing`,
            'PpOSt',
configLosRouting,
true,
          };
}

        if (this.uploadTwice && this.onSecondUpload) {
// independently-controlled components have already been successfully uploaded
// ... route to the product listing page

          this.props.navigatePush(
`/admin/tenant/${this.props.tenant.id}/core-products`,
          };
return;
}

        // update state to acknowledge successful upload of data-driven elements
this.setState((prev) => {
return {
...prev,
uploadHooksTriggered: true,
};
        }];

        this.triggerUploadHooks(
this.productId,
newVersionOfSubcomponents,
this.uploadTwice ? 'Active' : requestedState,
        };

        productInstance.recordState = requestedState;
      }]
.catch((e) => {
console.dir({
msg: 'Upload Error',
error: e,
        }];
if (e.message) {
const errorObj = JSON.parse(e.message);

          if (
errorObj.result &&
errorObj.result.errors &&
errorObj.result.errors.length === 1 &&
errorObj.result.errors[0].code === 'ERR_DUP_VERSION'
          } {
this.setState((prev) => {
return {
...prev,
uploadError:
'A product with the specified name already exists.',
};
            }];

            return;
}
}

        this.setState((prev) => {
return {
...prev,
uploadError: true,
};
        }];
      }];
};
};
  // check Rates for errors
checkForErrors = () => {
const errors = this.state.errors;

    const sectionsWithErrors = new Set();

    for (const field in errors) {
if (Object.prototype.hasOwnProperty.call(errors, field)) {
if (
errors[field] &&
errors[field].value &&
errors[field].value.length > 0 &&
errors[field].sectionName
        } {
sectionsWithErrors.add(errors[field].sectionName);
}
}
}

    return sectionsWithErrors;
};

  createFinishedProduct = () => {
// update values in the product config object
this.productConfig.sections.forEach((section) => {
section.settings.forEach((setting) => {
const settingName = setting.settingCode;
const entry = this.state.settingsMap.get(settingName);
setting.value = entry.value;
      }];
    }};

    return this.productConfig;
};

  getSettingValue = (k) => {
const setting = this.state.settingsMap.get(k);
if (!setting) return null;
return setting.value;
};

  getSettingRequiredState = (k) => {
const templateSetting = this.templateSettingsMap.get(k);
if (!templateSetting) return null;
return templateSetting.requiredForDraft;
};

  addTemplateSetting = (settingCode, templateSetting) => {
this.templateSettingsMap.set(settingCode, templateSetting);
};

  updateSettingValue = (k, v) => {
const setting = this.state.settingsMap.get(k);
if (!setting) return;

    setting.value = v;

    this.changeTracker.trackUpdate(k, v);

    this.setState((state) => {
return {
...state,
settingsMap: state.settingsMap.set(k, setting),
incrementVersion: this.versioningChecker.updateAndCheckShouldIncrement(
k,
          >,
        },
};
    }};
};

  updateError = (k, v, shouldSetErrorLoading = false) => {
/** shouldSetErrorLoading is used set the errorsLoading object
* On save, this prevents the upload and error-checking functionality
* from happening while the error state is still being updated
     >[
const section = this.sectionReferenceMap.get(k);
if (shouldSetErrorLoading) {
this.errorsLoading[k] = true;
}

    this.setState(
(state) => {
return {
...state,
errors: {
...state.errors,
[k]: { sectionName: section ? section : k, value: v },
},
};
},
() => {
if (shouldSetErrorLoading) {
this.errorsLoading[k] = false;
}
},
    ];
};

  getErrorState = (k) => {
if (!this.state.errors[k] || !this.state.errors[k].value) {
return null;
}
}
    return this.state.errors[k].value;
};

  [>
* validationFunc is a void function that uses the context to update
* the errors object state. It takes (context, updatedValue) as params.
   >[
addSettingValidationListener(settingName, validationFunc) {
this.eventEmitter.addListener(settingName, validationFunc);

    const increment = () => {
this.validatorIncrement++;

      this.setState((prev) => {
return {
...prev,
reload: true,
};
      }];
};

    this.eventEmitter.addListener('validate-all', (context, requestedState) => {
const settingValue = context.getSettingValue(settingName);

      if (settingValue !== null && settingValue !== '') {
// if field is populated, always validate
validationFunc(context, settingValue);
increment();
return;
}

      if (requestedState === 'Active') {
/* if the requested state is "Active", always validate the setting.
* It is up to the validators to determine whether the
* field is required. */
validationFunc(context, settingValue);
increment();
return;
}

      const requiredForDraft = context.getSettingRequiredState(settingName);

      if (requiredForDraft) {
validationFunc(context, settingValue);
      else
// ... not required for draft and not populated - reset the error field
context.updateError(settingName, '');
}

      increment();
    }};

    // account for the listener in the validator count
this.validatorCount++;
}

  addValidationListener(func) {
this.eventEmitter.addListener('validate-all', (context, requestedState) => {
func(context, requestedState);

      // keep track of finished validation steps
this.validatorIncrement++;
    }};

    // account for the listener in the validator count
this.validatorCount++;
}

  addImageUploadListener(promiseFunc) {
if (this.latestImageUploadListener.current) {
this.eventEmitter.removeListener(
'upload-hook',
this.latestImageUploadListener.current,
      ];
this.uploaderCount--;
}
const listener = (
context,
productId,
newVersionOfSubcomponent,
recordState,
) => {
promiseFunc(context, productId, newVersionOfSubcomponent, recordState)
.then((data) => {
// console.log(data);
this.newMediaUrl =
data && data.payload ? data.payload.mediaUrl : undefined;
// keep track of finished uploads
this.uploaderIncrement++;

          this.setState((prev) => {
return {
...prev,
reload: true,
};
          }];
        }]
.catch((e) => {
//console.log(e)

          this.setState((prev) => {
return {
...prev,
uploadError: true,
};
          }];
        }];
};
this.eventEmitter.addListener('upload-hook', listener);
this.latestImageUploadListener.current = listener;
// account for the listener in the uploader count
this.uploaderCount++;
}

  // input should be a func that returns a promise from a POST/PUT
addUploadListener(promiseFunc) {
this.eventEmitter.addListener(
'upload-hook',
(context, productId, newVersionOfSubcomponent, recordState) => {
promiseFunc(context, productId, newVersionOfSubcomponent, recordState)
.then((data) => {
//console.log(data)

            // keep track of finished uploads
this.uploaderIncrement++;

            this.setState((prev) => {
return {
...prev,
reload: true,
};
});
          }]
.catch((e) => {
//console.log(e)

            this.setState((prev) => {
return {
...prev,
uploadError: true,
};
            }];
          }];
},
    ];

    // account for the listener in the uploader count
this.uploaderCount++;
}

  notifyChange(settingName, updatedValue) {
this.updateError(settingName, ''); // reset error state for setting prior to validation

    // provides the context to update the form's state
this.eventEmitter.emit(settingName, this, updatedValue);
}

  validateAll(requestedState) {
// provides the context to update the form's state
this.eventEmitter.emit('validate-all', this, requestedState);
}

  triggerUploadHooks(productId, newVersionOfSubcomponent, recordState) {
this.eventEmitter.emit(
'upload-hook',
this,
productId,
newVersionOfSubcomponent,
recordState,
    ];
}

  cacheObject(k, v) {
this.objectCache.set(k, v);
this.eventEmitter.emit(`objectCache.${k}`, this, v);
}

  getCachedObject(k, v) {
return this.objectCache.get(k);
}

  addObjectCacheListener(k, listener) {
return this.eventEmitter.addListener(`objectCache.${k}`, listener);
}

  // allows data-driven form entities to assign a section title to the setting
// ... used to display an erred sections list
addSectionReference = (settingCode, sectionTitle) => {
this.sectionReferenceMap.set(settingCode, sectionTitle);
};

  isAnErrorLoading = () => {
/** Using a direct class attribute instead of state to avoid async setState timing issues
* The original problem this solves is related to the error state being set using setState,
* but the state not being updated in time for the upload & error-check in componentDidUpdate */
const errorsLoading = this.errorsLoading || {};
/** Returns true if any of the errorsLoading values = true */
return Object.values(errorsLoading).reduce(
(previousValue, currentValue) => previousValue || currentValue,
false,
    ];
};

  minMaxValidator = (productConfig) => {
let minLoanAmount;
let maxLoanAmount;
let minCreditLimit;
let maxCreditLimit;
const productSetupSectionSettings = productConfig.sections[0].settings;
productSetupSectionSettings.forEach((section) => {
switch (section.settingCode) {
case 'MIN-LOAN-AMOUNT':
minLoanAmount = parseFloat(section.value);
break;
case 'MAX-LOAN-AMOUNT':
maxLoanAmount = parseFloat(section.value);
break;
case 'MIN-CREDIT-LIMIT':
minCreditLimit = parseFloat(section.value);
break;
case 'MAX-CREDIT-LIMIT':
maxCreditLimit = parseFloat(section.value);
          break:
default:
break;
}

      if (minLoanAmount && maxLoanAmount && minLoanAmount >= maxLoanAmount) {
this.setState((prev) => {
return {
...prev,
uploadError:
'Maximum loan amount cannot be set below minimum loan amount.',
};
        }];
}
if (
minCreditLimit &&
maxCreditLimit &&
minCreditLimit >= maxCreditLimit
      ] {
this.setState((prev) => {
return {
...prev,
uploadError:
'Maximum credit limit cannot be set below minimum credit limit.',
};
        }];
}
    }};
};
}

```
<!-- CODESCAN_FILE_END -->

---

### 248. `C:\DevCode\AstroUI\src\components\CoreProduct\CoreProductForm.jsx`

<!-- CODESCAN_FILE_START -->
```javascript
import { blackColor } from 'assets/jss/material-dashboard-pro-react';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import Button from 'components/CustomButtons/Button';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import React from 'react';
import PrebuiltSections from './prebuilt-sections';
import { SettingFactory } from '../SettingsFactory/SettingFactory';
import { getProductImageUploadSectionSpec } from './CustomSection/utils';

[>>
* @todo convert to typescript
* @todo replace constructor with hooks
* @todo factor out non rendering functionality
>[
export class CoreProductForm extends React.Component {
constructor(props) {
super(props);

    this.settingFactory = new SettingFactory(
props.viewMode,
props.styleClasses,
    ];
this.prebuiltSections = new PrebuiltSections(props);

    // form display columns must a factor of 12 for material UI
this.allowedDisplayColumnValues = new Set([0, 1, 2, 3, 4, 6, 12]);

    this.productTemplateConfig = props.productTemplate;
this.productContext = props.context;

    // build the form
this.layout = [
...this.layoutToArray(this.productTemplateConfig.form.layout),
[['IMAGE-UPLOADER']],
];
this.sectionMap = new Map();
this.productTemplateConfig.sections.forEach((section) => {
this.sectionMap.set(section.sectionCode, section);
    }};
}

  layoutToArray(layout) {
const rows = [];
for (const rowName in layout.row) {
if (Object.prototype.hasOwnProperty.call(layout.row, rowName)) {
const row = layout.row[rowName];
const columns = [];

        for (const colName in row.col) {
if (Object.prototype.hasOwnProperty.call(row.col, colName)) {
const col = row.col[colName];
columns.push(col);
}
}

        if (!this.allowedDisplayColumnValues.has(columns.length)) {
throw new Error(
'Column count in each row must be a factor of 12 (0,1,2,3,4,6,12). Specified row => ' +
JSON.stringify(columns),
          };
}

        rows.push(columns);
}
}

    return rows;
}

  handleSaveClicked = () => {
this.productContext.startUpload('Active'); // trigger validation process
};

  render() {
return (
<div>
{this.createComponents(this.productContext)}

        {this.props.viewMode !== ViewMode.View && (
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12} sm={12} md={12}>
<Button
id="core-product-discard-changes"
color="danger"
simple
onClick={() => {
this.props.formOperations.handleDiscardChanges();
}}
>
Discard Changes
</Button>
<Button
id="core-product-save"
color="success"
onClick={this.handleSaveClicked}
>
Save
</Button>
</GridItem>
</GridContainer>
        }}
</div>
    ];
}

  createComponents(productContext) {
const rows = [];

    this.layout.forEach((columns, rowIndex) => {
const gridWidthForRow = 12 / columns.length;
const cols = [];

      columns.forEach((sections, columnIndex) => {
if (sections.length == 0) {
// push empty cell
cols.push(
<GridItem key={columnIndex} xs={12} md={gridWidthForRow} />,
          };
return;
}

        // create each section within a cell
const gridItems = sections.map((sectionName, sectionIndex) => {
let section = this.sectionMap.get(sectionName);

          if (!section && sectionName === 'IMAGE-UPLOADER') {
section = getProductImageUploadSectionSpec();
}

          if (!section.settings && !section.componentReference) {
throw new Error(
'Section must specify settings are reference a prebuild component => ' +
JSON.stringify(section),
            };
}

          // does the section specify a pre-built component?
if (section.componentReference) {
return (
<div key={sectionIndex}>
{this.prebuiltSections.getComponentBySectionName(
section.componentReference,
                }}
</div>
            };
}

          // create each setting within each section
const settingsForSection = section.settings.map((setting, idx) => {
return {
inHeader: setting.inHeader,
component: (
<GridItem key={idx} xs={12}>
{this.settingFactory.createComponent(setting, productContext)}
</GridItem>
              },
};
          }];

          return (
<Card key={sectionIndex}>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={5}>
<CardText color="cuna1">
<h4>{section.sectionTitle}</h4>
</CardText>
</GridItem>
<GridItem xs={12} sm={7}>
{settingsForSection
.filter(({ inHeader }) => inHeader)
.map((sec, idx) => (
<div key={idx} style={{ color: blackColor }}>
{sec.component}
</div>
                      ]}}
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
{settingsForSection
.filter(({ inHeader }) => !inHeader)
.map(({ component }) => component)}
</CardBody>
</Card>
          };
        }];

        cols.push(
<GridItem key={columnIndex} xs={gridWidthForRow}>
{gridItems}
</GridItem>,
        };
      }];

      if (cols.length > 0) {
rows.push(<GridContainer key={rowIndex}>{cols}</GridContainer>);
}
    }};

    return <GridContainer>{rows}</GridContainer>;
}
}

```
<!-- CODESCAN_FILE_END -->

---

### 249. `C:\DevCode\AstroUI\src\components\CoreProduct\prebuilt-sections.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProduct\prebuilt" -->
```javascript
import React from 'react';
import AncillaryProducts from './AncillaryProducts';
import CreditCard from './CustomSection/Sections/CreditCard';
import PersonalLoan from './CustomSection/Sections/PersonalLoan';
import PLOC from './CustomSection/Sections/PLOC';
import RatesAuto from './CustomSection/Sections/RatesAuto';
import RatesUnsecuredLoan from './CustomSection/Sections/RatesUnsecuredLoan';
import RatesRecreationalVehicle from './CustomSection/Sections/RecreationalVehicle';
import SecuredProductOptions from './CustomSection/Sections/SecuredProductOptions';
import ImageUploaderSection from './CustomSection/Sections/ImageUploaderSection';

export default class PrebuiltSections {
constructor(props) {
this.componentsMap = {
RATES: <RatesAuto context={props.context} viewMode={props.viewMode} />,
RATES_AUTO: (
<RatesAuto context={props.context} viewMode={props.viewMode} />
      ],
'CARD-TYPES': (
<CreditCard context={props.context} viewMode={props.viewMode} />
      ],
RATES_PERSONAL_LOAN: (
<PersonalLoan context={props.context} viewMode={props.viewMode} />
      ],
RATES_PLOC: <PLOC context={props.context} viewMode={props.viewMode} />,
'ANCILLARY-PRODUCTS': <AncillaryProducts {...props} />,

      RATES_NON_AUTO: (
<RatesRecreationalVehicle
context={props.context}
viewMode={props.viewMode}
        [>
      ],

      RATES_UNSECURED_PERSONAL: (
<RatesUnsecuredLoan context={props.context} viewMode={props.viewMode} />
      ],
PRODUCT_TYPES_SECURED: (
<SecuredProductOptions
context={props.context}
viewMode={props.viewMode}
        [>
      ],
'IMAGE-UPLOADER': <ImageUploaderSection {...props} />,
};
}

  getComponentBySectionName(sectionName) {
const component = this.componentsMap[sectionName];

    if (!component) {
throw new Error(
'Could not find prebuilt section component for section => ' +
sectionName,
      ];
}

    return component;
}
}

```
<!-- CODESCAN_FILE_END -->

---

### 250. `C:\DevCode\AstroUI\src\components\CoreProduct\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProduct\types.ts" type=".ts" size="601" lines="28" chars="601" -->
```typescript
export interface SettingOption {
order: number;
value: string;
displayValue: string;
enabled: boolean;
selected: boolean;
}

interface CoreTemplateProductSectionSettings {
settingCode: string;
valueType: string;
value: any;
options?: SettingOption[];
}

export interface CoreTemplateProductSections {
sectionCode: string;
isUsed: boolean;
settings: CoreTemplateProductSectionSettings[];
}

export interface TemplateProductSpecificationJSON {
sections: CoreTemplateProductSections[];
}
export enum ProductConfigSpecialComponentTypes {
'IMAGE_UPLOADER' = 'IMAGE-UPLOADER',
}

```
<!-- CODESCAN_FILE_END -->

---

### 251. `C:\DevCode\AstroUI\src\components\CoreProductsList\__test__\CoreProductDataGrid.test.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import React from 'react';

import { queryByAttribute, screen } from '@testing-library/react';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import { v4 as uuid } from 'uuid';
import { CoreProductDataGrid } from '../CoreProductDataGrid';

describe('CoreProductDataGrid', () => {
const getById = queryByAttribute.bind(null, 'id');
const tenantId = uuid();
const templateVersionOneId = uuid();
const templateVersionTwoId = uuid();
const stateUpdating: string[] = [''];
const productList = [
{
id: '1',
templateId: templateVersionOneId,
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
recordState: 'Draft',
},
{
id: '2',
templateId: templateVersionTwoId,
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
recordState: 'Active',
},
];
const productTemplates = [
{
tenantId: tenantId,
id: templateVersionOneId,
recordState: 'Active',
name: '001',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
},

    {
tenantId: tenantId,
id: templateVersionTwoId,
recordState: 'Active',
name: '001',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 2,
description: '',
isAssigned: 'true',
},
];

  test('Renders a list of core products', async () => {
const props = {
productList,
productTemplates,
stateUpdating,
};

    const wrapper = renderWithMockContext(<CoreProductDataGrid {...props} />);

    const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    const productOneUpgradeButton = getById(wrapper.container, '1_upgrade');
expect(productOneUpgradeButton).toBeInTheDocument();

    const productTwoUpgradeButton = getById(wrapper.container, '2_upgrade');
expect(productTwoUpgradeButton).toBeNull();
  }};

  it('Does not render when no there are no products', async () => {
const props = {
productList: [],
productTemplates,
};

    const { container } = renderWithMockContext(
<CoreProductDataGrid {...props} />,
    ];

    expect(container).toBeEmptyDOMElement();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 252. `C:\DevCode\AstroUI\src\components\CoreProductsList\__test__\CoreProductsList.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductsList\__test__\CoreProductsList.test.tsx" type=".tsx" size="16802" lines="687" chars="16802" -->
```typescript
import React from 'react';

import {
queryByAttribute,
fireEvent,
render,
waitFor,
} from '@testing-library/react';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import { BrowserRouter } from 'react-router-dom';

import CoreProductsList, { matchProductToForm } from '../CoreProductsList';
import { v4 as uuid } from 'uuid';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import {
clickDropdownItem,
getElementById,
getTableRows,
mockFetchResponseOnce,
mockGet,
mockGetOnce,
} from 'components/__test__/TestUtils';

const getById = queryByAttribute.bind(null, 'id');

describe('CoreProductsList', () => {
afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  const mockFormsPayload = {
payload: [
{
name: 'form name 1',
version: '1',
coreProductId: '1',
recordState: 'Active',
lastUpdated: new Date().toLocaleDateString(),
},
{
name: 'form name 2',
version: '2',
coreProductId: '2',
recordState: 'Active',
lastUpdated: new Date().toLocaleDateString(),
      },
    ],
  };

  test.skip('Test population of products list', async () => {
const tenantId = uuid();
const templateId = uuid();

    const props = {
history: {
location: {
// '/admin/tenant/:tenantId/core-products'
pathname: `/admin/tenant/${tenantId}/core-products`,
},
},
match: {
params: {
tenantId,
},
},
};

    // Active records are sorted to the top
const mockProductList = {
payload: [
{
id: '1',
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
subtype: 'New',
recordState: 'Active',
},
{
id: '2',
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
subtype: 'New',
recordState: 'Draft',
},
],
};

    const mockTemplates = {
payload: [
{
tenantId: tenantId,
id: templateId,
recordState: 'Active',
name: '001',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
},
],
};

    const mockstateUpdating = {
stateUpdating: [],
};
};
    mockGetOnce(mockProductList);
mockGet(mockFormsPayload);
mockGetOnce(mockTemplates);
mockGetOnce(mockstateUpdating);

    const wrapper = renderWithMockContext(
<BrowserRouter>
<CoreProductsList {...props} />
</BrowserRouter>,
    ];

    const nameHeader = wrapper.queryByText('Name');
expect(nameHeader);
console.log('before wait');
await waitFor(() => expect(wrapper.queryAllByRole('row')).toHaveLength(3));
const rows = wrapper.getAllByRole('row');
expect(rows.length).toBe(3);

    const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Product1');
expect(productRow1.item(1)).toHaveTextContent('Lending');
expect(productRow1.item(2)).toHaveTextContent('Auto');
expect(productRow1.item(3)).toHaveTextContent('New');
expect(productRow1.item(4)).toHaveTextContent('1');
// Status Toggle Button
expect(productRow1.item(6)).toHaveTextContent('Active');
expect(productRow1.item(7)).toHaveTextContent('form name 1, Version 1');

    expect(productRow2.item(0)).toHaveTextContent('Product2');
expect(productRow2.item(1)).toHaveTextContent('Lending');
expect(productRow2.item(2)).toHaveTextContent('Auto');
expect(productRow2.item(3)).toHaveTextContent('New');
expect(productRow2.item(4)).toHaveTextContent('2');
// Status Toggle Button
expect(productRow2.item(6)).toHaveTextContent('Draft');
expect(productRow2.item(7)).toHaveTextContent('form name 2, Version 2');
  }};

  test.skip('Test select View mode for product', async () => {
const tenantId = uuid();
const templateId = uuid();
const templateId = uuid();
    const props = {
history: {
location: {
// '/admin/tenant/:tenantId/core-products'
pathname: `/admin/tenant/${tenantId}/core-products`,
},
push: () => {},
},
match: {
params: {
tenantId,
},
},
};

    const mockProductList = Promise.resolve({
payload: [
{
id: '1',
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
recordState: 'Draft',
},
{
id: '2',
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
recordState: 'Active',
},
],
    }};

    const mockTemplates = {
payload: [
{
tenantId: tenantId,
id: templateId,
recordState: 'Active',
name: '001',
          category: 'Lending',
          type: 'Auto',
          subtype: 'New',
          version: 1,
          description: -',
isAssigned: 'true',
},
],
};

    mockGetOnce(mockProductList);
mockGetOnce(mockFormsPayload);
mockGetOnce(mockTemplates);

    const wrapper = renderWithMockContext(
<BrowserRouter>
<CoreProductsList {...props} />
</BrowserRouter>,
    ];
const nameHeader = wrapper.queryByText('Name');
expect(nameHeader);
await waitFor(() => expect(wrapper.queryAllByRole('row')).toHaveLength(3));
const rows = wrapper.getAllByRole('row');
const rowToView = rows[1];

    const viewButton: any = getById(wrapper.container, '1_view');
fireEvent.click(viewButton);

    fireEvent.mouseOut(rowToView);
  }};

  test.skip('Test create new product button', async () => {
const mockPush = jest.fn();
const tenantId = uuid();
const templateId = uuid();

    const props = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/core-products`,
},
push: mockPush,
},
match: {
params: {
tenantId,
},
},
};

    const mockProductList = [
{
id: '1',
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
recordState: 'Draft',
},
{
id: '2',
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
recordState: 'Active',

    ];

    // mock fetches
    const mockProductListPromise = Promise.resolve({
      payload: mockProductList,
    }};

    const mockTemplatesPromise = Promise.resolve({
      payload:[
        {
          tenantId: tenantId,
          id: templateId,
          recordstate: 'Active',
          name: '001',
          category: 'Lending',
          type: 'Auto',
          subtype: 'New',
          version: 1,
          description: -',
          isAssigned: 'true',
        },



















return Promise.resolve({
ok: true,
json: () => mockProductListPromise,
        }];
}
};

    const fetchSpy: jest.SpyInstance = jest.spyOn(window, 'fetch');

    fetchSpy
.mockImplementationOnce(mockFetch)
.mockImplementationOnce(mockFetch)
.mockImplementationOnce(mockFetch);

    const wrapper = render(
wrapWithMockContext(
tenantId,
<div id="adminNavCreateBtn">
<BrowserRouter>
<CoreProductsList {...props} />
</BrowserRouter>
</div>,
      ],
    ];
);
    await clickDropdownItem(
wrapper,
'select-coreProductTemplate',
(dropdownItem) => dropdownItem.textContent.includes('001'),
    ];

    expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/core-products/${templateId}/create`,
    ];
  }};

  test.skip('Test click view product', async () => {
const tenantId = uuid();
const templateId = uuid();
const productId = uuid();
const mockPush = jest.fn();

    const props = {
history: {
location: {
// '/admin/tenant/:tenantId/core-products'
pathname: `/admin/tenant/${tenantId}/core-products`,
},
push: mockPush,
listen: jest.fn(),
},
match: {
params: {
tenantId,
},
},
};

    const mockProductList = {
payload: [
{
id: productId,
templateId: templateId,
tenantId: tenantId,
          name: 'Product1',
          version: 1,
          category: 'Lending',
          type: 'Auto',
          recordstate: 'Draft',
        },
        {
          name: 'Product2',
          version: 2,
          category: 'Lending',
          type: 'Auto',
          recordstate: 'Active',
        },
      ],
    };

    const mockTemplates = {
      payload:[
        {
          tenantId: tenantId,
          id: templateId,
          recordstate: 'Active',
          name: '001',
390 category: 'Lending',
391 type: 'Auto',
392 subtype: 'New',
393 version: 1,
394 description: '',
395 isAssigned: 'true',
396 lastUpdated: new Date().toLocaleDateString(),
        },
      ],
    };

    const mockFormsPayload = {
payload: [
{
name: 'form name 1',
version: '1',
coreProductId: productId,
recordState: 'Active',
lastUpdated: new Date().toLocaleDateString(),
},
],
};

    mockGetOnce(mockProductList);
mockGetOnce(mockFormsPayload);
mockGetOnce(mockTemplates);

    const wrapper = renderWithMockContext(
<BrowserRouter>
<CoreProductsList {...props} />
</BrowserRouter>,
    ];

    const nameHeader = wrapper.queryByText('Name');
expect(nameHeader);

    const rows = await getTableRows(wrapper);

    expect(rows.length).toBe(2);

    fireEvent.click(wrapper.getByRole('button', { name: 'view Product1' }));
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/core-products/${templateId}/${productId}/view`,
    ];
  }};

  test.skip('Click edit button for product', async () => {
const tenantId = uuid();
const templateId = uuid();
const productId = uuid();
const mockPush = jest.fn();

    const props = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/core-products`,
},
push: mockPush,
listen: jest.fn(),
},
match: {
params: {
tenantId,
},
},
};

    const mockProductList = {
payload: [
{
id: productId,
templateId: templateId,
tenantId: tenantId,
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
recordState: 'Draft',
},
{
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
recordState: 'Active',
},
],
};

    const mockTemplates = {
payload: [
{
tenantId: tenantId,
id: templateId,
recordState: 'Active',
name: '001',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
          description: -',
          isAssigned: 'true',
          lastUpdated: Date.now(),
        },
],
};

    const mockFormsPayload = {
payload: [
{
name: 'form name 1',
version: '1',
coreProductId: productId,
recordState: 'Active',
lastUpdated: new Date().toLocaleDateString(),
},
],
};

    await mockGetOnce(mockProductList);
await mockGetOnce(mockFormsPayload);
await mockGetOnce(mockTemplates);
await mockGetOnce(mockTemplates);
    const wrapper = renderWithMockContext(
<BrowserRouter>
<CoreProductsList {...props} />
</BrowserRouter>,
    ];

    const nameHeader = wrapper.queryByText('Name');
expect(nameHeader);

    const editButton = getElementById(wrapper, productId + '_edit');
fireEvent.click(editButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/core-products/${templateId}/${productId}/edit`,
    ];
  }};

  test.skip('Error fetching product listing', async () => {
const tenantId = uuid();
const props = {
history: {
location: {
// '/admin/tenant/:tenantId/core-products'
pathname: `/admin/tenant/${tenantId}/core-products`,
},
},
match: {
params: {
tenantId,
},
},
};

    mockFetchResponseOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
} as any);

    const dom = renderWithMockContext(<CoreProductsList {...props} />);

    const errorNotification = await dom.findByRole('full-page-status-error');
expect(errorNotification);
  }};

  test('Should not return any forms where formTemplateType specified', async () => {
const tenantId = uuid();
const templateId = uuid();
const productId1 = uuid();
const productId2 = uuid();
// Active records are sorted to the top
const mockProductList = [
{
id: productId1,
name: 'Product1',
version: 1,
category: 'Lending',
type: 'Auto',
subtype: 'New',
recordState: 'Active',
},
{
id: productId2,
name: 'Product2',
version: 2,
category: 'Lending',
type: 'Auto',
subtype: 'New',
recordState: 'Draft',
},
];

    const mockTemplates = [
{
tenantId: tenantId,
id: templateId,
coreProductId: productId1,
recordState: 'Active',
name: 'NEGATIVE',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
formTemplateType: 'dummy',
},
{
tenantId: tenantId,
id: templateId,
coreProductId: productId2,
recordState: 'Active',
name: 'NEGATIVE',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
formTemplateType: 'dummy',
},
{
tenantId: tenantId,
id: templateId,
coreProductId: productId1,
recordState: 'Active',
name: 'POSITIVE',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
formTemplateType: null,
},
{
tenantId: tenantId,
id: templateId,
coreProductId: productId2,
recordState: 'Active',
name: 'POSITIVE',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
description: '',
isAssigned: 'true',
formTemplateType: '',
},
];
const productFormMatches = matchProductToForm(
mockProductList,
mockTemplates,
    ];
expect(productFormMatches).toHaveLength(2);
expect(productFormMatches).not.toContain(
expect.objectContaining({ currentFormName: 'NEGATIVE' }),
    ];
  }};

  function wrapWithMockContext(tenantId: string, component: any) {
const mockContext = {
tenant: { id: tenantId },
setTenant: () => {},
setPageTitle: () => {},
setDisplayCreateButton: () => {},
setCreateButtonClicked: () => {},
createButtonClicked: true,
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<AuthContext.Provider value={mockAuthContext as any}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
    ];
}
}};

```
<!-- CODESCAN_FILE_END -->

---

### 253. `C:\DevCode\AstroUI\src\components\CoreProductsList\CoreProductDataGrid.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductsList\CoreProductDataGrid.tsx" type=".tsx" size="11515" lines="393" chars="11515" -->
```typescript
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, ICON_TYPES, Spinner, Table } from 'commonui';
import {
SCHeader,
SCStatus,
SCActions,
SCActionButton,
SCActionButtonLink,
} from '../TableStyles';
import { client2 } from 'utils/api-client';

export const CoreProductDataGrid = ({
productList,
setProductList,
stateUpdating,
updateStateUpdating,
productTemplates,
formsLoading,
}: any) => {
const editEligibilitySet = createEditEligibilitySet(productList);
const upgradeEligibilityMap = createUpgradeEligibilityMap(
productTemplates,
productList,
  ];
const push = useNavigate();

  const formatdata = (
products: any,
setProductList: (value: React.SetStateAction<null>) => void,
stateUpdating: string[],
updateStateUpdating: (
value: React.SetStateAction<(string | undefined)[]>,
) => void,
) => {
return products.map(
      [{
id,
name,
version,
category,
subtype,
type,
recordState,
currentFormName,
currentFormVersion,
tenantId,
templateId,
}: any) => {
const editEligible = editEligibilitySet.has(id);
const upgradeEligible = upgradeEligibilityMap.has(id);
const isInactive =
recordState === 'Not-in-use' || recordState === 'not-in-use';
const isActive = recordState === 'Active';
let loanAppForm: any =
currentFormName === ''
? 'None'
: `${currentFormName}, Version ${currentFormVersion}`;
const link = `/admin/tenant/${tenantId}/core-products/${templateId}/${id}`;

        if (formsLoading) {
loanAppForm = (
<Spinner
key={`forms-loading-spinner-${id}`}
data-testid="forms-loading-spinner"
height={24}
width={24}
/>
          };
}

        return {
id,
productName: name,
name: <Link to={`${link}/view`}>{name}</Link>,
version,
category,
subType: subtype,
type,
isActive: recordState && recordState === 'Active',
loanAppForm,
viewProduct: () => push(`${link}/view`),
statusName: isInactive ? 'Inactive' : recordState,
status: (
<SCStatus status={isInactive ? 'Inactive' : recordState}>
{isInactive ? 'Inactive' : recordState}
</SCStatus>
          },
statusAction:
(stateUpdating.findIndex((value: string) => value === id) > -1 && (
<Spinner width={40} height={40} />
)) ||
(isInactive && (
<SCActionButton
id={`${id}_activate`}
aria-label="activate"
title="Activate Core Product"
onClick={async () => {
updateStateUpdating([...stateUpdating, id]);
await setCoreProductStatus(
id,
tenantId,
'Active',
products,
setProductList,
stateUpdating,
updateStateUpdating,
                  ];
}}
color="green"
className="edit"
>
<Icon size={14} name={ICON_TYPES.LARGE_CHECKMARK_WHITE} />
</SCActionButton>
)) ||
(isActive && (
<SCActionButton
id={`${id}_deactivate`}
aria-label="deactivate"
title="Deactivate Core Product"
onClick={async () => {
updateStateUpdating([...stateUpdating, id]);
await setCoreProductStatus(
id,
tenantId,
'Not-in-use',
products,
setProductList,
stateUpdating,
updateStateUpdating,
                  ];
}}
color="red"
className="edit"
>
<Icon size={14} name={ICON_TYPES.CLOSE} />
</SCActionButton>
            }],
actions: (
<SCActions id={id}>
<SCActionButtonLink
to={`${link}/view`}
title="View Product"
id={`${id}_view`}
aria-label={`view ${name}`}
color="blue"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
{editEligible && (
<SCActionButtonLink
to={`${link}/edit`}
title="Edit Product"
id={`${id}_edit`}
aria-label={`edit ${name}`}
color="green"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
              }}
{upgradeEligible && (
<SCActionButtonLink
to={`/admin/tenant/${tenantId}/core-products/${upgradeEligibilityMap.get(
id,
)}/${id}/upgrade`}
title="Upgrade Product"
id={`${id}_upgrade`}
aria-label={`upgrade ${name}`}
color="orange"
>
<Icon size={20} name={ICON_TYPES.UPLOAD_CLOUD} />
</SCActionButtonLink>
)}
</SCActions>
          },
};
},
    ];
};
// configure the create button action
if (productList.length > 0) {
const staticColumn = {
filterable: false,
sortable: false,
};
return (
<Table
data={formatdata(
productList,
setProductList,
stateUpdating,
updateStateUpdating,
        }}
filterable
sortable
pageSize={25}
defaultSort={{ column: 'status', direction: 'asc' }}
columns={[
{
Header: <SCHeader>Name</SCHeader>,
accessor: 'name',
serialize: ({ productName }) => productName,
filterable: true,
sortable: true,
},
{
Header: <SCHeader>Category</SCHeader>,
accessor: 'category',
filterable: true,
},
{
Header: <SCHeader>Type</SCHeader>,
accessor: 'type',
filterable: true,
},
{
Header: <SCHeader>Sub-Type</SCHeader>,
accessor: 'subType',
filterable: true,
},
{
Header: <SCHeader>Version</SCHeader>,
accessor: 'version',
filterable: false,
},
{
...staticColumn,
Header: <SCHeader>Toggle Record State</SCHeader>,
accessor: 'statusAction',
filterable: false,
},
{
...staticColumn,
Header: <SCHeader>Status</SCHeader>,
accessor: 'status',
serialize: ({ statusName }) => statusName,
filterable: true,
},
{
Header: <SCHeader>Loan Application Form</SCHeader>,
accessor: 'loanAppForm',
filterable: false,
},
{
...staticColumn,
Header: '',
accessor: 'actions',
maxWidth: '180px',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
      [>
    ];
} else {
return null;
}

  function createUpgradeEligibilityMap(
productTemplates: any,
productList: any,
  ] {
const availableTemplates = productTemplates.filter(
(template: any) => template.recordState === 'Active',
    ];

    const eligibleProducts: any = [];

    productList.forEach((product: any) => {
const templateId = product.templateId;

      const currentTemplate = availableTemplates.find(
(template: any) => template.id === templateId,
      ];

      if (
        !currentTemplate ll
!currentTemplate.version ||
!currentTemplate.category ||
!currentTemplate.type ||
!currentTemplate.subtype
      ]
return;

      const versionedTemplates = availableTemplates.filter(
(template: any) =>
template.category.toUpperCase() ===
currentTemplate.category.toUpperCase() &&
template.type.toUpperCase() === currentTemplate.type.toUpperCase() &&
template.subtype.toUpperCase() ===
currentTemplate.subtype.toUpperCase(),
      ];

      let latestTemplate: any;
let maxVersion = -1;

      // find the latest version of the product's template
for (let i = 0; i < versionedTemplates.length; i++) {
const versionedTemplate = versionedTemplates[i];

        if (
          !versionedTemplate.version Il
versionedTemplate.version <= currentTemplate.version
) {
continue;
}

        if (versionedTemplate.version < maxVersion) continue;

        maxVersion = versionedTemplate.version;
latestTemplate = versionedTemplate;
}

      if (!latestTemplate) return;

      eligibleProducts.push([product.id, latestTemplate.templateId]);
    }};

    return new Map(eligibleProducts);
}

  function createEditEligibilitySet(productList: any) {
const eligibleProducts: any = [];

    productList.forEach((product: any) => {
const productsWithSameName = productList.filter(
(prod: any) =>
prod.id !== product.id &&
prod.name.toUpperCase() === product.name.toUpperCase(),
      ];

      if (
productsWithSameName.some((prod: any) => prod.version > product.version)
      ] {
// if the product is not the latest version, then it cannot be edited
return;
}

      eligibleProducts.push(product.id);
    }};

    return new Set(eligibleProducts);
}

  async function setCoreProductStatus(
id: string,
tenantId: string,
status: string,
productList: any,
setProductList: (value: React.SetStateAction<null>) => void,
stateUpdating: string[],
updateStateUpdating: (
value: React.SetStateAction<(string | undefined)[]>,
) => void,
): Promise<void> {
const config = {
headers: { 'X-TENANT-ID': tenantId },
body: { status },
};

    client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products/${id}/status`,
'PUT',
config,
    ]
.then((res) => {
// Set new status from response
if (res.payload.length > 0) {
const updatedItem = res.payload.find((item: any) => {
return item.id === id;
          }];
const products = productList.map((value: any) => {
if (value.id === updatedItem.id) {
value.recordState = updatedItem.recordState;
}
return value;
          }];
setProductList(products);
}
      }]
.finally(() => {
const newArr = Array.from(stateUpdating);
const index = stateUpdating.findIndex((value: string) => value === id);
if (index > -1) {
newArr.splice(index, 1);
}
// Remove spinner on success or failure
updateStateUpdating(newArr);
      }];
}
};

```
<!-- CODESCAN_FILE_END -->

---

### 254. `C:\DevCode\AstroUI\src\components\CoreProductsList\CoreProductsList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductsList\CoreProductsList.tsx" type=".tsx" size="7626" lines="251" chars="7626" -->
```typescript
import React, { useEffect, useState } from 'react';
import { client2 } from 'utils/api-client';
import { useAppContext } from 'context/app-context';
import { DynamicInputField, Spinner, ToggleButton } from 'commonui';

import { CoreProductDataGrid } from 'components/CoreProductsList/CoreProductDataGrid';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { SCFilters, SCTableContainer } from './styles';
import { DateTime } from 'luxon';
import { RecordState } from '../../types';
import { useParams } from 'react-router-dom';
import { useCreateCoreProductModal } from './CreateCoreProductModal';

const LOAN_FORM_ACTIVE_STATE = 'Active';

const getTenantLoanForms = async (
afterDate: string,
config: any,
handleErr: (err: React.SetStateAction<null>) => void,
): Promise<any[]> => {
return new Promise((resolve) => {
client2(
`${
process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL
}loan-forms?afterDate=${DateTime.fromISO(
afterDate,
).toISO()}&formRecordState=Active`,
'GET',
config,
    ]
.then((res) => resolve(res.payload))
.catch(handleErr);
  }};
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const matchProductToForm = (products: any[], forms: any[]) => {
  [>>
* Forms ordered by creation date, so reverse to allow use of .find().
* Per https://dev.azure.com/cunamutual/H2IC/_workitems/edit/2405336, we
* should not include forms that have the formTemplateType specified.
   >[
const searchForms = forms.reverse().filter((form) => !form.formTemplateType);

  return products.map((p) => {
const matchedForm = searchForms.find(
      [[} =>
f.coreProductId === p.id && f.recordState === LOAN_FORM_ACTIVE_STATE,
    ];

    const currentFormName = matchedForm ? matchedForm.name : '';
const currentFormVersion = matchedForm ? matchedForm.version : '';

    return {
...p,
currentFormName,
currentFormVersion,
};
  }};
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function CoreProductsList(props: any) {
const [productList, setProductList] = useState<any[] | null>(null);
const [productTemplates, setProductTemplates] = useState(null);

  const [loading, setLoading] = useState(true);
const [formsLoading, setFormsLoading] = useState(false);
const [errorResponse, setErrorResponse] = useState(null);
const [stateUpdating, updateStateUpdating] = useState([]);
const [showActiveCoreProducts, setShowActiveCoreProducts] = useState(true);

  const {
tenant,
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
setCoreProduct,
setDisplayLoadButton,
} = useAppContext();

  const today = new Date();
const aMonthAgo = new Date(today.valueOf() - 1000 * 60 * 60 * 24 * 30);

  const [dateFilter, setDateFilter] = React.useState(
DateTime.fromJSDate(aMonthAgo).toFormat('MM/dd/yyyy'),
  ];

  const params = useParams();
const loadLoanForms = async () => {
const tenantId = params.tenantId;
const config = { headers: { 'X-TENANT-ID': tenantId } }; // TODO
const forms = await getTenantLoanForms(
dateFilter,
config,
(err: React.SetStateAction<null>) => {
setErrorResponse(err);
},
    ];

    const products = matchProductToForm(productList || [], forms);
setProductList([...products]);
setFormsLoading(false);
};

  useEffect(() => {
if (!createButtonClicked) return;
setCreateButtonClicked(false);
}, [createButtonClicked]);

  useEffect(() => {
setDisplayLoadButton(loading);
if (!loading) return;

    const tenantId = params.tenantId;
const titleList = new Map();

    if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(`Core Products`, `/admin/tenant/${tenantId}/core-products`);
setCoreProduct(undefined);

    setPageTitle(titleList);

    // TODO -> need to implement sequential page fetch
const config = { headers: { 'X-TENANT-ID': tenantId } }; // TODO

    const requestedRecordStates = showActiveCoreProducts
? [RecordState.Active]
: [RecordState.Active, RecordState.NotInUse, RecordState.Draft];
const recordStateQuery = new URLSearchParams(
requestedRecordStates.map((recordState) => [
'recordState[]',
recordState,
      ]],
    ];

    client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products?${recordStateQuery}`,
'GET',
config,
    ]
.then(async (data) => {
const forms = await getTenantLoanForms(dateFilter, config, (err) => {
setErrorResponse(err);
setLoading(false);
        }];

        const products = matchProductToForm(data.payload, forms);
const filteredProducts = products.filter(
({ lastUpdated }) =>
DateTime.fromISO(lastUpdated) >
DateTime.fromFormat(dateFilter, 'MM/dd/yyyy'),
        };
setProductList([...filteredProducts]);

        client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}tenant-core-product-templates`,
'GET',
config,
        }
.then((data) => {
const productTemplates = data.payload.filter(
({ recordState }: any) => recordState === RecordState.Active,
            };

            setProductTemplates(productTemplates);
setLoading(false);
setDisplayCreateButton(true);
          }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
          }];
      }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
      }];
}, [loading, showActiveCoreProducts]);
}, [loading, showActiveCoreProducts]);
  useEffect(() => {
if (!formsLoading && productList && productList.length > 0) {
setFormsLoading(true);
loadLoanForms();
}
}, [dateFilter, (productList ?? []).length]);

  if (errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  useCreateCoreProductModal(
tenant?.id ?? '',
createButtonClicked,
productTemplates ?? [],
  ];

  return (
<div>
<SCTableContainer>
<SCFilters>
<DynamicInputField
validateAllFields
dataField={{
fieldType: 'date',
fieldCode: 'date-filter',
fieldLabel: 'Application Forms after date',
}}
value={dateFilter}
onChange={(_, newDate) => {
setDateFilter(newDate);
}}
          [>
<ToggleButton
selectedValue={showActiveCoreProducts ? 'active' : 'all'}
onChange={(_name, value) => {
setShowActiveCoreProducts(value === 'active');
setLoading(true);
}}
options={[
{ label: 'active', value: 'active' },
{ label: 'all', value: 'all' },
]}
size={'Large' as any}
          [>
</SCFilters>
{loading ? (
<Spinner />
        } ; {
<CoreProductDataGrid
productList={productList ?? []}
setProductList={setProductList}
stateUpdating={stateUpdating}
updateStateUpdating={updateStateUpdating}
productTemplates={productTemplates ?? []}
formsLoading={formsLoading}
{...props}
          [>
        }}
</SCTableContainer>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 255. `C:\DevCode\AstroUI\src\components\CoreProductsList\CreateCoreProductModal.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductsList\CreateCoreProductModal.tsx" type=".tsx" size="1419" lines="57" chars="1419" -->
```typescript
import React from 'react';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate, generatePath } from 'react-router-dom';
import { useDynamicModal } from 'components/DynamicModal';

const useCreateCoreProductModal = (
tenantId: string,
showModal: boolean,
productTemplates: Record<string, string>[] = [],
) => {
const group: any = {
groupCode: 'CreateProduct',
groupTitle: '',
hidden: false,
required: true,
dataFields: [
{
fieldCode: 'productTemplateId',
fieldType: 'single-select',
fieldLabel: 'Select Product Template',
options: [
...productTemplates.map(({ id, name, version }) => ({
label: `${name}  (Version ${version})`,
value: id,
          }]},
],
},
],
};

  const canContinue = (data: any) => {
return !!data?.productTemplateId;
};
const navigate = useNavigate();
const onContinueBtnClick = (state: any) => {
navigate(
generatePath(Paths.CoreProductTemplate, {
tenantId,
templateId: state?.data?.productTemplateId,
viewMode: 'create',
      }],
    ];
};
useDynamicModal({
title: 'Create Core Product',
height: '400px',
showModal,
fieldGroups: [group],
canContinue,
continueBtnText: 'Create Core Product',
onContinueBtnClick,
fullPageModal: true,
  }};
};

export { useCreateCoreProductModal };

```
<!-- CODESCAN_FILE_END -->

---

### 256. `C:\DevCode\AstroUI\src\components\CoreProductsList\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductsList\styles.ts" type=".ts" size="271" lines="16" chars="271" -->
```typescript
import styled from 'styled-components';

const SCTableContainer = styled.div`
> div {
margin-bottom: 24px;
}
`;

const SCFilters = styled.div`
display: flex;
justify-content: space-between;
align-items: flex-end;
`;

export { SCFilters, SCTableContainer };

```
<!-- CODESCAN_FILE_END -->

---

### 257. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\__test__\CoreProducts.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\__test__\CoreProducts.test.tsx" type=".tsx" size="974" lines="25" chars="974" -->
```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import * as API from 'API/sendAPIRequests';
import { MockContextWrapper } from 'components/__mock__/mock-context';
import {
mockCoreProductTemplateA,
  mockCorePlroductTemplateB,
} from 'components/__mock__/fakeCoreProductTemplates';
import { CoreProductTemplates } from '../CoreProductTemplates';

describe('CoreProductTemplates', () => {
const coreProductTemplateSpy: jest.SpyInstance = jest.spyOn(
API,
'sendCoreProductTemplateAPIRequest',
  ];
it('should load and render a list of sub products', async () => {
coreProductTemplateSpy.mockResolvedValue({
payload: [mockCoreProductTemplateA, mockCoreProductTemplateB],
    }};
render(<CoreProductTemplates />, { wrapper: MockContextWrapper as any });
// We expect there to a be a header row and 2 sub products
await waitFor(() => expect(screen.getAllByRole('row').length).toEqual(3));
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 258. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\__test__\useCoreProducts.test.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\__test__\useCoreProducts.test.ts" type=".ts" size="1578" lines="47" chars="1578" -->
```typescript
import { renderHook } from '@testing-library/react-hooks';
import { MockContextWrapper } from 'components/__mock__/mock-context';
import {
mockCoreProductTemplateA,
mockCoreProductTemplateB,
} from 'components/__mock__/fakeCoreProductTemplates';
import { useCoreProductTemplates } from '../useCoreProductTemplates';
import * as API from 'API/sendAPIRequests';

describe('useCoreProductTemplates', () => {
const coreProductTemplateSpy: jest.SpyInstance = jest.spyOn(
API,
'sendCoreProductTemplateAPIRequest',
  ];
it('should load core product templates', async () => {
coreProductTemplateSpy.mockResolvedValue({
payload: [mockCoreProductTemplateA, mockCoreProductTemplateB],
    }};
const { result, waitForNextUpdate } = renderHook(
() => useCoreProductTemplates(),
{
wrapper: MockContextWrapper,
},
    ];

    expect(result.current.isLoading).toEqual(true);
await waitForNextUpdate();
expect(result.current.coreProductTemplates).toHaveLength(2);
expect(result.current.isLoading).toEqual(false);
  }};
it('should fail to load core product templates', async () => {
const error = { message: 'error' };
coreProductTemplateSpy.mockRejectedValue(error);
const { result, waitForNextUpdate } = renderHook(
() => useCoreProductTemplates(),
{
wrapper: MockContextWrapper,
},
    ];

    expect(result.current.isLoading).toEqual(true);
await waitForNextUpdate();
expect(result.current.error).toEqual(error);
expect(result.current.isLoading).toEqual(false);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 259. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\CoreProductTemplates.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\CoreProductTemplates.tsx" type=".tsx" size="2963" lines="105" chars="2963" -->
```typescript
import React from 'react';
import { DateTime } from 'luxon';
import { Spinner, Table } from 'commonui';
import { SCLoading } from 'layouts/styles';
import FullPageStatus from '../FullPageStatus/FullPageStatus';
import { IFormattedRow, ICoreProductTemplate } from './types';
import { useCoreProductTemplates } from './useCoreProductTemplates';
import { SCHeader, SCStatus } from 'components/TableStyles';
import { Documentation, IDocumentation } from '../Documentation';

const documentation: IDocumentation = {
documentation: [
'Core Product Templates contain a JSON structure specifying how a Core Product can be configured for a tenant.',
'These templates are added upon deploy of ProductConfigGenerators. They can also be added manually for development purposes.',
'Every Core Product must be based on one-and-only-one Core Product Template, but multiple instances of Core Products may be created in each tenant from each Core Product Template.',
],
links: [
{
label: 'Further Documentation',
url: 'https://dev.azure.com/cunamutual/H2IC/_git/ProductConfigGenerators?path=/product-specs/CoreProductLogicalModel.md&_a=preview',
},
],
};

const staticColumn = {
filterable: false,
sortable: false,
};

const columns = [
{
Header: 'Last Updated',
accessor: 'lastUpdated',
serialize: ({ lastUpdatedValue }: any) => lastUpdatedValue,
filterable: false,
},
{
Header: 'Name',
accessor: 'name',
},
{
Header: 'Type',
accessor: 'type',
},
{
Header: 'SubType',
accessor: 'subtype',
},
{
Header: 'Version',
accessor: 'version',
maxWidth: '130px',
filterable: false,
},
{
...staticColumn,
Header: 'Record State',
accessor: 'status',
maxWidth: '100px',
},
];

const formatRows = (
CoreProductTemplates: ICoreProductTemplate[],
): IFormattedRow[] =>
CoreProductTemplates.map(
({ recordState, lastUpdatedDate, ...coreProduct }) => ({
...coreProduct,
lastUpdated: DateTime.fromISO(lastUpdatedDate).toRelative() ?? '',
lastUpdatedValue: new Date(lastUpdatedDate).valueOf(),
status: <SCStatus status={recordState}>{recordState}</SCStatus>,
    }},
  ];

const CoreProductTemplates = (): JSX.Element => {
const { error, isLoading, coreProductTemplates } = useCoreProductTemplates();
if (error) {
return <FullPageStatus errorResponse={error} />;
}

  return (
    >>
<Documentation {...documentation} />
{isLoading ? (
<SCLoading>
<Spinner />
</SCLoading>
      ] ; [
<Table
data={formatRows(coreProductTemplates)}
filterable
sortable
columns={columns.map(({ Header, ...column }) => ({
...column,
Header: <SCHeader>{Header}</SCHeader>,
          }]}}
defaultSort={{ column: 'lastUpdated', direction: 'desc' }}
        [>
      ]}
</>
  ];
};

export { CoreProductTemplates };

```
<!-- CODESCAN_FILE_END -->

---

### 260. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\index.ts" type=".ts" size="108" lines="4" chars="108" -->
```typescript
export * from './CoreProductTemplates';
export * from './types';
export * from './useCoreProductTemplates';

```
<!-- CODESCAN_FILE_END -->

---

### 261. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\types.ts" -->
type=".ts" size="552" lines="26" chars="552" -->
export interface ICoreProductTemplate {
id: string;
category: string;
recordState: string;
name: string;
description: string;
subType: string;
type: string;
version: number;
versionDescription: string;
lastUpdatedDate: string;
}

export interface IUseCoreProductTemplatesPayload {
error?: Error;
isLoading: boolean;
coreProductTemplates: ICoreProductTemplate[];
}

export interface IFormattedRow extends Partial<ICoreProductTemplate> {
id: string;
lastUpdated: string;
lastUpdatedValue: number;
status: JSX.Element;
}

```
<!-- CODESCAN_FILE_END -->

---

### 262. `C:\DevCode\AstroUI\src\components\CoreProductTemplates\useCoreProductTemplates.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CoreProductTemplates\useCoreProductTemplates.ts" type=".ts" size="1420" lines="43" chars="1420" -->
```typescript
import { useEffect, useState } from 'react';
import { Config, HttpMethod } from 'utils/api-client';
import { useAppContext } from 'context/app-context';
import { IUseCoreProductTemplatesPayload } from './types';
import { sendCoreProductTemplateAPIRequest } from 'API';
import { Paths } from 'layouts/RouterSwitch';

const useCoreProductTemplates = (): IUseCoreProductTemplatesPayload => {
const [coreProductTemplates, setCoreProductTemplates] = useState([]);
const [isLoading, setLoading] = useState(true);
const [error, setError] = useState<Error>();
const config: Config = { headers: { 'X-TENANT-ID': '' } };

  const { setDisplayCreateButton, setPageTitle } = useAppContext();
const loadCoreProductTemplates = async (): Promise<void> => {
try {
const { payload } = await sendCoreProductTemplateAPIRequest(
HttpMethod.GET,
config,
      ];

      setLoading(false);
setCoreProductTemplates(payload);
} catch (error) {
setLoading(false);
setError(error as any as Error);
}
};

  useEffect(() => {
const titleList = new Map();
titleList.set('System > ', Paths.System);
titleList.set('Core Product Templates', Paths.SystemCoreProductTemplates);
setPageTitle(titleList);
setDisplayCreateButton(false);
loadCoreProductTemplates();
  },[};

  return { error, isLoading, coreProductTemplates };
};

export { useCoreProductTemplates };

```
<!-- CODESCAN_FILE_END -->

---

### 263. `C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\CreateMerchant.test.jsx`

<!-- CODESCAN_FILE_START -->
```javascript
import React from 'react';
import {
queryByAttribute,
fireEvent,
screen,
waitFor,
} from '@testing-library/react';

import CreateMerchant from '../CreateMerchant';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import * as RouterDom from 'react-router-dom';

const mockMerchant = {
payload: {
merchantTypeId: 1,
merchantTypeCode: 'CU',
merchantTypeName: 'Credit Union',
recordState: 'Draft',
cuicCustomerNumber: 'R34533CVB',
legalName: 'Aurora Credit Union 1',
postalName: 'Aurora CU ',
branchNumber: 'Branch Number 1',
legalStatus: 'Liquidated',
operationalStatus: 'Open for Business',
addresses: [
{
addressType: 'Physical',
line1: '674 Park Hill Cr',
line2: 'Apt. 6793',
line3: 'Suite 6094',
city: 'Lisle',
county: 'DuPage',
state: 'Illinois',
postalCode: '65033',
country: 'USA',
},
{
addressType: 'Mailing',
line1: '123 Red Brick Ln',
line2: 'Suite 690',
line3: 'PO Box 34212',
city: 'San Marcos',
county: 'San Diego',
state: 'CA',
postalCode: '70903',
country: 'USA',
},
],
phoneNumber: '6790986754',
startDate: '10/08/2019',
endDate: '10/09/2019',
leagueMember: false,
createdBy: 'orizun',
lastUpdatedBy: 'admin',
id: 'e35ed93e-9669-4afa-af6d-dc5523d3a38e',
createdTimestamp: '10/15/2019 8:48:13 PM',
lastUpdatedTimestamp: '10/15/2019 8:48:13 PM',
resourceUrl:
'http://23.100.230.87/merchants/e35ed93e-9669-4afa-af6d-dc5523d3a38e',
},
result: {
correlationId: 'd689224e-5722-4e10-9dd6-486babb9145c',
code: 0,
message: 'The request completed successfully',
apiVer: 'V1.0.1',
count: 1,
itemTotal: 0,
page: 0,
pageSize: 25,
pageTotal: 0,
},
};

const TEST_TIMEOUT = 20000;

const props = {
match: {
params: {},
},
history: [],
};

const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: jest.fn().mockReturnValue({}),
}}];

describe('CreateMerchant', () => {
const fetchSpy = jest.spyOn(window, 'fetch');

  beforeEach(() => {
jest.clearAllMocks();
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
merchantId: 'merch-id',
    }}];
const mockJsonPromise = Promise.resolve(mockMerchant);

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
    }};
  }};

  test(
'Should load create merchant when merchant id is not available',
async () => {
const getByName = queryByAttribute.bind(null, 'name');

      const tenant = {
id: 'aaa-bb-cc',
};

      jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};

      const dom = renderWithMockTenant(tenant, <CreateMerchant />);
const line1 = getByName(dom.container, 'operationalStatus');
expect(line1.value).toBe('');
const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
});
expect(legalName.value).toBe('');
},
TEST_TIMEOUT,
  ];

  test(
'Should default to status from tenant',
async () => {
const getByName = queryByAttribute.bind(null, 'name');
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};

      const dom = renderWithMockTenant(tenant, <CreateMerchant />);
const operStatus = getByName(dom.container, 'operationalStatus');
expect(operStatus.value).toBe('Open for Business');
const legalStatus = getByName(dom.container, 'legalStatus');
expect(legalStatus.value).toBe('Active');
const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];
expect(legalName.value).toBe('');
},
TEST_TIMEOUT,
  ];

  test(
'Should load Create Merchant in edit mode',
async () => {
// mock out window.fetch for the test
jest.clearAllMocks();
const mockJsonPromise = Promise.resolve(mockMerchant);

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
      }];
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
merchantId: 'merch-id',
      }]};

      renderWithMockTenant(tenant, <CreateMerchant />);
await screen.findByLabelText('Operational Status Input');
await screen.findByText('Open for Business');
// expect(setPageTitleMock).toBeCalledWith("Test Tenant: Aurora Credit Union 1")
},
TEST_TIMEOUT,
  ];

  test(
'Should have same postal name when legal name is changed and postal name empty',
async () => {
const mockJsonPromise = Promise.resolve(mockMerchant);
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
      }];
renderWithMockTenant(tenant, <CreateMerchant {...props} />);
const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];

      fireEvent.change(legalName, { target: { value: 'New Legal Name' } });
await waitFor(() =>
expect(screen.getByLabelText('Postal Name').value).toBe(
'New Legal Name',
        },
      ];
},
TEST_TIMEOUT,
  ];

  test(
'Should show error text for fields',
async () => {
const getByArialabel = queryByAttribute.bind(null, 'aria-label');
const tenant = {
id: 'aaa-bb-cc',
};

      const dom = renderWithMockTenant(tenant, <CreateMerchant {...props} />);

      const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];

      fireEvent.change(legalName, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];

      await screen.findByText('Legal Name should be up to 50 characters');

      const postalName = screen.getByLabelText('Postal Name');
fireEvent.change(postalName, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxyyy',
},
      }];
await screen.findByText('Postal Name should be up to 50 characters');

      const phoneNumber = screen.getByLabelText('Phone Number');
fireEvent.change(phoneNumber, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];

      await screen.findByText('Phone number should be up to 30 characters.');

      const cuicCustomerNumber = screen.getByLabelText('CUIC Customer Number');
fireEvent.change(cuicCustomerNumber, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];
await screen.findByText(
'CUIC Customer Number should be up to 15 characters.',
      ];

      const startDate = screen.getByLabelText('Start Date');
fireEvent.change(startDate, { target: { value: '20/20/2020' } });
fireEvent.change(startDate, { target: { value: '20/20/2020' } });
      const endDate = screen.getByLabelText('End Date');
fireEvent.change(endDate, { target: { value: '20/20/2020' } });

      const saveButton = await screen.findByText('Save');
fireEvent.click(saveButton);

      await screen.findByText('Start Date is invalid. Should be mm/dd/yyyy'),
await screen.findByText('End Date is invalid. Should be mm/dd/yyyy');
await screen.findByText('Please fix form errors before submitting.');

      const closeButton = getByArialabel(dom.container, 'Close');
expect(closeButton);
fireEvent.click(closeButton);

      await screen.findByText('Please fix form errors before submitting.');
},
TEST_TIMEOUT,
  ];

  test(
'Should show error text for fields while save',
async () => {
const getById = queryByAttribute.bind(null, 'id');

      const tenant = {
id: 'aaa-bb-cc',
};

      const dom = renderWithMockTenant(tenant, <CreateMerchant {...props} />);
const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];
fireEvent.change(legalName, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];

      await screen.findByText('Legal Name should be up to 50 characters');

      const postalName = screen.getByLabelText('Postal Name');
fireEvent.change(postalName, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxyyy',
},
      }];

      await screen.findByText('Postal Name should be up to 50 characters');

      const phoneNumber = getById(dom.container, 'phoneNumber');
fireEvent.change(phoneNumber, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];
await screen.findByText('Phone number should be up to 30 characters.');

      const cuicCustomerNumber = screen.getByLabelText('CUIC Customer Number');
fireEvent.change(cuicCustomerNumber, {
target: {
value:
'New Legal Namexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
},
      }];

      await screen.findByText(
'CUIC Customer Number should be up to 15 characters.',
      ];

      const startDate = screen.getByLabelText('Start Date');
fireEvent.change(startDate, { target: { value: '20/20/2020' } });

      const endDate = screen.getByLabelText('End Date');
fireEvent.change(endDate, { target: { value: '20/20/2020' } });

      const saveButton = await screen.findByText('Save');
fireEvent.click(saveButton);

      await screen.findByText('Start Date is invalid. Should be mm/dd/yyyy');
await screen.findByText('End Date is invalid. Should be mm/dd/yyyy');
await screen.findByText('Please fix form errors before submitting.');

      const closeButton = screen.getByRole('button', { name: 'Close' });
expect(closeButton);
fireEvent.click(closeButton);

      await screen.findByText('Please fix form errors before submitting.');
},
TEST_TIMEOUT,
  ];

  test(
'Should show error text for fields while save draft',
async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};
renderWithMockTenant(tenant, <CreateMerchant />);

      const saveButton = await screen.findByText('Save Draft');
fireEvent.click(saveButton);

      await screen.findByText('Please fix form errors before submitting.');
await screen.findByText('Legal Name is required.');
},
TEST_TIMEOUT,
  ];

  test(
'Should be successful save draft',
async () => {
const mockJsonPromise = Promise.resolve({ response: 'ok' });

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
      }];

      jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};

      renderWithMockTenant(tenant, <CreateMerchant {...props} />);

      const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];
fireEvent.change(legalName, { target: { value: 'Hello Merchant' } });

      const branchNumber = screen.getByLabelText('Branch Number', {
exact: false,
      }];
fireEvent.change(branchNumber, { target: { value: 'Branch Number 1' } });

      const saveDraftButton = await screen.findByText('Save Draft');
fireEvent.click(saveDraftButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
const args = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1];
expect(JSON.parse(args.body).id).toBeUndefined();

      await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant',
        },
      ];
},
TEST_TIMEOUT,
  ];

  test(
'Should be failed save draft',
async () => {
const failedSave = {
result: {
errors: [
{
code: 'ERR_DUP_LEGAL_NAME',
message: 'Duplicate Merchant name is found.',
timestamp: '10/17/2019 5:02 AM',
},
],
},
};

      jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
      }]};

      const mockJsonPromise = Promise.resolve(JSON.stringify(failedSave));

      fetchSpy.mockResolvedValue({
ok: false,
text: () => mockJsonPromise,
      }];

      renderWithMockTenant(tenant, <CreateMerchant />);

      const legalName = await screen.findByRole('textbox', {
name: 'Legal Name',
      }];
fireEvent.change(legalName, { target: { value: 'Hello Merchant' } });

      const branchNumber = screen.getByLabelText('Branch Number', {
exact: false,
      }];
fireEvent.change(branchNumber, { target: { value: 'Branch Number 1' } });

      const saveDraftButton = await screen.findByText('Save Draft');
fireEvent.click(saveDraftButton);
await screen.findByText(
'Enter a merchant name that is not already in use, or consider updating the existing Hello Merchant merchant.',
      ];
},
TEST_TIMEOUT,
  ];

  test(
'Should display and hide discard message',
async () => {
renderWithMockTenant(tenant, <CreateMerchant />);

      const discardButton = await screen.findByText('Discard Changes');
fireEvent.click(discardButton);
const confirmButton = await screen.findByText('Yes, Discard!');
fireEvent.click(confirmButton);

      await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant',
        },
      ];
},
TEST_TIMEOUT,
  ];

  test(
'Should display and cancel discard message',
async () => {
renderWithMockTenant(tenant, <CreateMerchant />);
const discardButton = await screen.findByText('Discard Changes');
fireEvent.click(discardButton);
const cancel = await screen.findByText('Cancel');
fireEvent.click(cancel);
await waitFor(() => {
expect(
screen.queryByText('Your changes will be lost!'),
).not.toBeInTheDocument();
      }];
},
TEST_TIMEOUT,
  ];

  test(
'Should load Create Merchant in edit mode and click save draft',
async () => {
// mock out window.fetch for the test
jest.clearAllMocks();
const mockJsonPromise = Promise.resolve(mockMerchant);

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
      }];

      renderWithMockTenant(tenant, <CreateMerchant />);
await screen.findByText('Please Wait...');
await screen.findAllByRole('textbox');
await screen.findByLabelText('Operational Status Input');
await screen.findByText('Open for Business');
// expect(setPageTitleMock).toBeCalledWith("Test Tenant: Aurora Credit Union 1")
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

      const mockJsonPromise2 = Promise.resolve({ response: 'ok' });

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise2,
      }];

      const saveDraftButton = await screen.findByText('Save Draft');
fireEvent.click(saveDraftButton);
// Called one to load "merch-id", a second time to save the draft
await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
const args = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1];
expect(JSON.parse(args.body).id).toBeUndefined();
expect(args.method).toBe('PUT');

      await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant',
        },
      ];
},
TEST_TIMEOUT,
  ];

  test(
'Should load Create Merchant in edit mode and click save',
async () => {
// mock out window.fetch for the test
jest.clearAllMocks();
const mockJsonPromise = Promise.resolve(mockMerchant);

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
      }];

      renderWithMockTenant(tenant, <CreateMerchant />);

      await screen.findAllByRole('textbox');
await screen.findByLabelText('Operational Status Input');
await screen.findByText('Open for Business');
// expect(setPageTitleMock).toBeCalledWith("Test Tenant: Aurora Credit Union 1")

      const mockJsonPromise2 = Promise.resolve({ response: 'ok' });

      fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise2,
      }];

      const saveDraftButton = await screen.findByText('Save');
fireEvent.click(saveDraftButton);
// Called one to load "merch-id", a second time to save the draft
await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
const args = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1];
expect(JSON.parse(args.body).id).toBeUndefined();
expect(args.method).toBe('PUT');
expect(JSON.parse(args.body).recordState).toBe('Active');

      await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant',
        },
      ];
},
TEST_TIMEOUT,
  ];
}};

```
<!-- CODESCAN_FILE_END -->

---

### 264. `C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MailingAddress.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MailingAddress.test.jsx" type=".jsx" size="6281" lines="195" chars="6281" -->
```javascript
import React from 'react';
import {
render,
queryByAttribute,
fireEvent,
findByLabelText,
waitFor,
} from '@testing-library/react';

import MailingAddress from '../MailingAddress';

afterEach(() => {
jest.clearAllMocks();
}};

test('Should load Mailing Address Component', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const mockTenants = [
{
name: 'test credit union',
},
];

  const merchantTemplate = {
Mailing_line1: '',
Mailing_line2: '',
Mailing_line3: '',
Mailing_city: '',
Mailing_county: '',
Mailing_state: '',
Mailing_postalCode: '',
Mailing_country: '',
};

  const merchantData = {
Mailing_line1: 'aa',
Mailing_line2: 'bb',
Mailing_line3: '',
Mailing_city: 'xx',
Mailing_county: 'cook',
Mailing_state: 'il',
Mailing_postalCode: '55',
Mailing_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Mailing',
};
const dom = render(<MailingAddress {...props} />);
//dom.querySelector('#Mail')
const line1 = getById(dom.container, 'Mailing_line1');
const line2 = getById(dom.container, 'Mailing_line2');
const line3 = getById(dom.container, 'Mailing_line3');
const city = getById(dom.container, 'Mailing_city');
const county = getById(dom.container, 'Mailing_county');
const state = getById(dom.container, 'Mailing_state');
const postalCode = getById(dom.container, 'Mailing_postalCode');
const country = getById(dom.container, 'Mailing_country');

  expect(line1.value).toBe('aa');
expect(line2.value).toBe('bb');
expect(line3.value).toBe('');
expect(city.value).toBe('xx');
expect(county.value).toBe('cook');
expect(state.value).toBe('il');
expect(postalCode.value).toBe('55');
expect(country.value).toBe('usa');
}};

test('Should handle change in text fields', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const merchantTemplate = {
Mailing_line1: '',
Mailing_line2: '',
Mailing_line3: '',
Mailing_city: '',
Mailing_county: '',
Mailing_state: '',
Mailing_postalCode: '',
Mailing_country: '',
};

  const merchantData = {
Mailing_line1: 'aa',
Mailing_line2: 'bb',
Mailing_line3: '',
Mailing_city: 'xx',
Mailing_county: 'cook',
Mailing_state: 'il',
Mailing_postalCode: '55',
Mailing_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const handleChangeMock = jest.fn((x) => x);
const validateChangeMock = jest.fn((x) => x);

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Mailing',
handleChange: handleChangeMock,
validateChange: validateChangeMock,
};

  const dom = render(<MailingAddress {...props} />);
const line1 = getById(dom.container, 'Mailing_line1');
const line2 = getById(dom.container, 'Mailing_line2');
const line3 = getById(dom.container, 'Mailing_line3');
const city = getById(dom.container, 'Mailing_city');
const county = getById(dom.container, 'Mailing_county');
const state = getById(dom.container, 'Mailing_state');
const postalCode = getById(dom.container, 'Mailing_postalCode');
const country = getById(dom.container, 'Mailing_country');

  expect(line1.value).toBe('aa');

  fireEvent.change(line1, { target: { value: '123 Main Street' } });
fireEvent.change(line2, { target: { value: 'Suite 200' } });
fireEvent.change(line3, { target: { value: 'xxxx' } });
fireEvent.change(city, { target: { value: 'demo city' } });
fireEvent.change(county, { target: { value: 'dupage' } });
fireEvent.change(state, { target: { value: 'WI' } });
fireEvent.change(postalCode, { target: { value: '89786' } });
fireEvent.change(country, { target: { value: 'Canada' } });

  expect(handleChangeMock).toHaveBeenCalledTimes(8);
}};

test('Should show error text for fields', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const mockTenants = [
{
name: 'test credit union',
},
];

  const merchantTemplate = {
Mailing_line1: { isInvalid: true, message: 'invalid line1' },
Mailing_line2: { isInvalid: true, message: 'invalid line2' },
Mailing_line3: { isInvalid: true, message: 'invalid line3' },
Mailing_city: { isInvalid: true, message: 'invalid city' },
Mailing_county: { isInvalid: true, message: 'invalid county' },
Mailing_state: { isInvalid: true, message: 'invalid state' },
Mailing_postalCode: { isInvalid: true, message: 'invalid postalcode' },
Mailing_country: { isInvalid: true, message: 'invalid country' },
};

  const merchantData = {
Mailing_line1: 'aa',
Mailing_line2: 'bb',
Mailing_line3: '',
Mailing_city: 'xx',
Mailing_county: 'cook',
Mailing_state: 'il',
Mailing_postalCode: '55',
Mailing_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Mailing',
};
const dom = render(<MailingAddress {...props} />);
//dom.querySelector('#Mail')
const line1 = getById(dom.container, 'Mailing_line1-text');
const line2 = getById(dom.container, 'Mailing_line2-text');
const line3 = getById(dom.container, 'Mailing_line3-text');
const city = getById(dom.container, 'Mailing_city-text');
const county = getById(dom.container, 'Mailing_county-text');
const state = getById(dom.container, 'Mailing_state-text');
const postalCode = getById(dom.container, 'Mailing_postalCode-text');
const country = getById(dom.container, 'Mailing_country-text');

  expect(line1).toHaveTextContent('invalid line1');
expect(line2).toHaveTextContent('invalid line2');
expect(line3).toHaveTextContent('invalid line3');
expect(city).toHaveTextContent('invalid city');
expect(county).toHaveTextContent('invalid county');
expect(state).toHaveTextContent('invalid state');
expect(postalCode).toHaveTextContent('invalid postalcode');
expect(country).toHaveTextContent('invalid country');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 265. `C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MerchantHelper.test.js`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MerchantHelper.test.js" type=".js" size="2495" lines="98" chars="2495" -->
```javascript
import { unflattenAddress, populateTemplate } from '../MerchantHelper';
import * as addsame from 'helpers/addresshelper';

test('Should load Both Address Component', async () => {
const formData = {
Physical_line1: 'aaa',
Mailing_line1: 'bbb',
legalName: 'merchant',
id: '',
};

  const rval = await unflattenAddress(formData);

  expect(rval.legalName).toBe('merchant');
expect(rval.addresses.find((x) => x.addressType === 'Physical').line1).toBe(
'aaa',
  ];
expect(rval.addresses.find((x) => x.addressType === 'Mailing').line1).toBe(
'bbb',
  ];
}};

test('Should load Only Mailing Address Component', async () => {
const formData = {
Mailing_line1: 'bbb',
legalName: 'merchant',
id: '',
};

  const rval = await unflattenAddress(formData);

  expect(rval.legalName).toBe('merchant');
expect(
rval.addresses.find((x) => x.addressType === 'Physical'),
).toBeUndefined();
expect(rval.addresses.find((x) => x.addressType === 'Mailing').line1).toBe(
'bbb',
  ];
}};

test('Should load Only Physical Address Component', async () => {
const formData = {
Physical_line1: 'aaa',
legalName: 'merchant',
id: '',
};

  const rval = await unflattenAddress(formData);

  expect(rval.legalName).toBe('merchant');
expect(rval.addresses.find((x) => x.addressType === 'Physical').line1).toBe(
'aaa',
  ];
expect(
rval.addresses.find((x) => x.addressType === 'Mailing'),
).toBeUndefined();
}};

test('Should popuate Template Only Physical Address Component', () => {
addsame.addressSame = jest.fn().mockImplementation(() => true);
const template = {};
const formData = {
legalName: 'merchant',
addresses: [
{
addressType: 'Physical',
line1: 'aaa',
},
],
};

  const rval = populateTemplate(formData, template, jest.fn());

  expect(rval.legalName).toBe('merchant');
expect(rval.Physical_line1).toBe('aaa');
expect(rval.Mailing_line1).toBeUndefined();
}};

test('Should popuate Template Only Mailing Address Component', () => {
addsame.addressSame = jest.fn().mockImplementation(() => true);
const template = {};
const formData = {
legalName: 'merchant',
addresses: [
{
addressType: 'Mailing',
line1: 'aaa',
},
],
};

  const rval = populateTemplate(formData, template, jest.fn());

  expect(rval.legalName).toBe('merchant');
expect(rval.Mailing_line1).toBe('aaa');
expect(rval.Physical_line1).toBeUndefined();
}};

```
<!-- CODESCAN_FILE_END -->

---

### 266. `C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MerchantValidation.test.js`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\MerchantValidation.test.js" type=".js" size="962" lines="36" chars="962" -->
```javascript
import { merchantValidator } from '../MerchantValidation';

test('should be valid date', async () => {
const rval = await merchantValidator().validateField(
'startDate',
'01/01/2001',
  ];
expect(rval.isInvalid).toBeFalsy();
}};

test('should be valid date if empty', async () => {
const rval = await merchantValidator().validateField('startDate', '');
expect(rval.isInvalid).toBeFalsy();
}};

test('should be valid date', async () => {
const rval = await merchantValidator().validateField('endDate', '20/20/2001');
expect(rval.isInvalid).toBeTruthy();
}};

test('should be all numeric', async () => {
const rval = await merchantValidator().validateField(
'Physical_postalCode',
'12345',
  ];
expect(rval.isInvalid).toBeFalsy();
}};

test('should be all numeric true if empty', async () => {
const rval = await merchantValidator().validateField(
'Physical_postalCode',
    ` `,
  ];
expect(rval.isInvalid).toBeFalsy();
}};

```
<!-- CODESCAN_FILE_END -->

---

### 267. `C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\PhysicalAddress.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\__test__\PhysicalAddress.test.jsx" type=".jsx" size="6362" lines="195" chars="6362" -->
```javascript
import React from 'react';
import {
render,
queryByAttribute,
fireEvent,
findByLabelText,
waitFor,
} from '@testing-library/react';

import PhysicalAddress from '../PhysicalAddress';

afterEach(() => {
jest.clearAllMocks();
}};

test('Should load Physical Address Component', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const mockTenants = [
{
name: 'test credit union',
},
];

  const merchantTemplate = {
Physical_line1: '',
Physical_line2: '',
Physical_line3: '',
Physical_city: '',
Physical_county: '',
Physical_state: '',
Physical_postalCode: '',
Physical_country: '',
};

  const merchantData = {
Physical_line1: 'aa',
Physical_line2: 'bb',
Physical_line3: '',
Physical_city: 'xx',
Physical_county: 'cook',
Physical_state: 'il',
Physical_postalCode: '55',
Physical_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Physical',
};
const dom = render(<PhysicalAddress {...props} />);
//dom.querySelector('#Mail')
const line1 = getById(dom.container, 'Physical_line1');
const line2 = getById(dom.container, 'Physical_line2');
const line3 = getById(dom.container, 'Physical_line3');
const city = getById(dom.container, 'Physical_city');
const county = getById(dom.container, 'Physical_county');
const state = getById(dom.container, 'Physical_state');
const postalCode = getById(dom.container, 'Physical_postalCode');
const country = getById(dom.container, 'Physical_country');

  expect(line1.value).toBe('aa');
expect(line2.value).toBe('bb');
expect(line3.value).toBe('');
expect(city.value).toBe('xx');
expect(county.value).toBe('cook');
expect(state.value).toBe('il');
expect(postalCode.value).toBe('55');
expect(country.value).toBe('usa');
}};

test('Should handle change in text fields', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const merchantTemplate = {
Physical_line1: '',
Physical_line2: '',
Physical_line3: '',
Physical_city: '',
Physical_county: '',
Physical_state: '',
Physical_postalCode: '',
Physical_country: '',
};

  const merchantData = {
Physical_line1: 'aa',
Physical_line2: 'bb',
Physical_line3: '',
Physical_city: 'xx',
Physical_county: 'cook',
Physical_state: 'il',
Physical_postalCode: '55',
Physical_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const handleChangeMock = jest.fn((x) => x);
const validateChangeMock = jest.fn((x) => x);

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Physical',
handleChange: handleChangeMock,
validateChange: validateChangeMock,
};

  const dom = render(<PhysicalAddress {...props} />);
const line1 = getById(dom.container, 'Physical_line1');
const line2 = getById(dom.container, 'Physical_line2');
const line3 = getById(dom.container, 'Physical_line3');
const city = getById(dom.container, 'Physical_city');
const county = getById(dom.container, 'Physical_county');
const state = getById(dom.container, 'Physical_state');
const postalCode = getById(dom.container, 'Physical_postalCode');
const country = getById(dom.container, 'Physical_country');

  expect(line1.value).toBe('aa');

  fireEvent.change(line1, { target: { value: '123 Main Street' } });
fireEvent.change(line2, { target: { value: 'Suite 200' } });
fireEvent.change(line3, { target: { value: 'xxxx' } });
fireEvent.change(city, { target: { value: 'demo city' } });
fireEvent.change(county, { target: { value: 'dupage' } });
fireEvent.change(state, { target: { value: 'WI' } });
fireEvent.change(postalCode, { target: { value: '89786' } });
fireEvent.change(country, { target: { value: 'Canada' } });

  expect(handleChangeMock).toHaveBeenCalledTimes(8);
}};

test('Should show error text for fields', async () => {
// mock out window.fetch for the test
const getById = queryByAttribute.bind(null, 'id');
const mockTenants = [
{
name: 'test credit union',
},
];

  const merchantTemplate = {
Physical_line1: { isInvalid: true, message: 'invalid line1' },
Physical_line2: { isInvalid: true, message: 'invalid line2' },
Physical_line3: { isInvalid: true, message: 'invalid line3' },
Physical_city: { isInvalid: true, message: 'invalid city' },
Physical_county: { isInvalid: true, message: 'invalid county' },
Physical_state: { isInvalid: true, message: 'invalid state' },
Physical_postalCode: { isInvalid: true, message: 'invalid postalcode' },
Physical_country: { isInvalid: true, message: 'invalid country' },
};

  const merchantData = {
Physical_line1: 'aa',
Physical_line2: 'bb',
Physical_line3: '',
Physical_city: 'xx',
Physical_county: 'cook',
Physical_state: 'il',
Physical_postalCode: '55',
Physical_country: 'usa',
};

  //const [errorState, setErrorState] = React.useState(merchantTemplate)

  const props = {
errorState: merchantTemplate,
data: merchantData,
addType: 'Physical',
};
const dom = render(<PhysicalAddress {...props} />);
//dom.querySelector('#Mail')
const line1 = getById(dom.container, 'Physical_line1-text');
const line2 = getById(dom.container, 'Physical_line2-text');
const line3 = getById(dom.container, 'Physical_line3-text');
const city = getById(dom.container, 'Physical_city-text');
const county = getById(dom.container, 'Physical_county-text');
const state = getById(dom.container, 'Physical_state-text');
const postalCode = getById(dom.container, 'Physical_postalCode-text');
const country = getById(dom.container, 'Physical_country-text');

  expect(line1).toHaveTextContent('invalid line1');
expect(line2).toHaveTextContent('invalid line2');
expect(line3).toHaveTextContent('invalid line3');
expect(city).toHaveTextContent('invalid city');
expect(county).toHaveTextContent('invalid county');
expect(state).toHaveTextContent('invalid state');
expect(postalCode).toHaveTextContent('invalid postalcode');
expect(country).toHaveTextContent('invalid country');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 268. `C:\DevCode\AstroUI\src\components\CreateMerchant\CreateMerchant.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import { FormHelperText } from '@material-ui/core';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import Button from 'components/CustomButtons/Button';
import CustomInput from 'components/CustomInput/CustomInput';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
// @material-ui/icons
// core components
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Snackbar from 'components/Snackbar/Snackbar';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import { useAppContext } from 'context/app-context';
import { copyAddresses } from 'helpers/addresshelper';
import React, { useEffect, useState } from 'react';
import SweetAlert from 'react-bootstrap-sweetalert';
import { useTranslation } from 'react-i18next';
//import FakeMerchants from 'components/__mock__/fakeMerchants';
import { client2 } from 'utils/api-client';
import { isEmptyString } from '../../helpers/validations';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import MailingAddress from './MailingAddress';
import { populateTemplate, unflattenAddress } from './MerchantHelper';
import { merchantValidator } from './MerchantValidation';
import PhysicalAddress from './PhysicalAddress';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

const useStyles = makeStyles(styles);
const useStyles2 = makeStyles(sweetAlertStyle);

const CreateMerchant = () => {
const classes = useStyles();
const classes2 = useStyles2();

  const savedCallback = React.useRef<any>();

  const merchantId = useParams().merchantId;
//There should be a tenant in context by now.
const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();
const [bc, setBC] = useState(false);
const [serverMsg, setserverMsg] = useState<any>(null);

  const merchantTemplate = {
recordState: '',
id: '',
cuicCustomerNumber: '',
merchantTypeId: '1',
operationalStatus:
tenant && tenant.operationalStatus ? tenant.operationalStatus : '',
legalStatus: tenant && tenant.legalStatus ? tenant.legalStatus : '',
legalName: '',
postalName: '',
branchNumber: '',
phoneNumber: '',
startDate: '',
endDate: '',
Physical_line1: '',
Physical_line2: '',
Physical_line3: '',
Physical_city: '',
Physical_county: '',
Physical_state: '',
Physical_postalCode: '',
Physical_country: '',
Mailing_line1: '',
Mailing_line2: '',
Mailing_line3: '',
Mailing_city: '',
Mailing_county: '',
Mailing_state: '',
Mailing_postalCode: '',
Mailing_country: '',
};

  const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [formData, setFormData] = useState(merchantTemplate);
const [errorState, setErrorState] = useState<any>(merchantTemplate);

  const [alert, setAlert] = useState<any>(null);
const [disableCUIC, setDisableCUIC] = useState(false);
//Used to indicate if it is create vs. update function.
//Used to indicate if it is create vs. update function.
//Default: create
const [createState, setCreateState] = useState(true);

  const showNotification = () => {
if (!bc) {
setBC(true);
setTimeout(function () {
setBC(false);
}, 6000);
}
};

  const [sameAddress, setSameAddress] = useState(true);
const [formRecordState, setFormRecordState] = useState('');
const push = useNavigate();

  useEffect(() => {
setDisplayCreateButton(false);
//Call this only if merchant is available.  This will be true in case you are in edit mode for merchant.
//Otherwise, create an empty form.
setLoading(true);

    let merchantName = 'New Merchant';
let tenantId = ``;
const titleList = new Map();
if (tenant) {
tenantId = tenant.id;
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(`Merchants > `, `/admin/tenant/${tenantId}/merchant`);
}
if (merchantId !== undefined) {
//Remove this and make actual service call...
// const [merchant] = new FakeMerchants().findMerchant(merchantId)
// setFormData(populateTemplate(merchant, merchantTemplate))
// merchantName = merchant.legalName
// setPageTitle( (tenant ? (tenant.name + ' : ') : '')  + merchantName )
// setLoading(false)
client2(
`${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants/${merchantId}`,
      ]
.then((data) => {
merchantName = data.payload.legalName;
setCreateState(false);
const formattedData = populateTemplate(
data.payload,
merchantTemplate,
setSameAddress,
          };

          isEmptyString
.isValid(formattedData.cuicCustomerNumber)
.then((isEmpty) => {
// if the CUIC field is empty or the merchant is NOT active, make CUIC editable
if (isEmpty || formattedData.recordState !== 'Active') return;
setDisableCUIC(true);
            }];

          setFormData(formattedData);
titleList.set(
merchantName,
`/admin/tenant/${tenantId}/merchant/${merchantId}/edit`,
          };
setPageTitle(titleList);
setCreateState(false);
setLoading(false);
        }]
.catch((error) => {
setErrorResponse(error);
setLoading(false);
        }];
} else {
titleList.set(
`New Merchant`,
`/admin/tenant/${tenantId}/merchant/create`,
      ];
setPageTitle(titleList);
setLoading(false);
}

    // return function cleanup() {
//     console.log("do clean up here...")
//     clearTimeout(savedCallback.current())
// };
}, [merchantId]);

  if (!tenant || tenant === undefined) {
console.log('tenant is null...redirecting to tenant selection');
return <Navigate replace to="/admin/tenant" />;
}

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  const handleChange = (event: any) => {
const { id, value, name } = event.target;
const key = id ? id : name;
//console.log("id " + key + " value " + value)
setFormData((prev) => {
return {
...prev,
[key]: value,
};
    }};
};

  const validateChange = async (event: any) => {
const { id, value, name } = event.target;
const key = id ? id : name;
//console.log('value in validate change... ' + value)
const valStatus = await merchantValidator().validateField(key, value);
setErrorState((prev: any) => {
return {
...prev,
[key]: valStatus,
};
    }};
};

  const saveClicked = async () => {
//Reset server error
setserverMsg(null);

    const merchantData = sameAddress ? copyAddresses(formData) : formData;

    const saveData = {
...merchantData,
recordState: 'Active',
tenantId: tenant.id,
};
//console.log(JSON.stringify(unflattenAddress(saveData, sameAddress)))
const { isValid, ...validation } = await merchantValidator().validate(
saveData,
    ];
if (!isValid) {
setErrorState(validation);
//alert("form is not valid..please fix the errors before submitting")
showNotification();
} else {
// let merchantId = new FakeMerchants().saveMerchant(unflattenAddress(saveData,sameAddress))
// console.log(merchantId)
// push(`/admin/tenant/${tenant.id}/merchant`)
const toBeSavedData: any = await unflattenAddress(saveData);
const url = createState
? `${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants?tenantId=${tenant.id}`
: `${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants/${toBeSavedData.id}`;

      //Delete the id from the object when updating since it takes key as url param
if (!createState) {
delete toBeSavedData.id;
}
client2(url, createState ? 'POST' : 'PUT', { body: toBeSavedData })
.then(() => {
push(`/admin/tenant/${tenant.id}/merchant`);
        }]
.catch((e) => handleErrorFromApi(e));
}
};

  const handleErrorFromApi = (err: any) => {
const errorObj = JSON.parse(err.message);
const errorsList = errorObj.result.errors;
if (errorsList && errorsList.length > 0) {
let dupMerchant = null;
for (let i = 0; i < errorsList.length; i++) {
if (errorsList[i].message === 'Duplicate Merchant name is found.') {
dupMerchant = errorsList[i];
errorsList.splice(i, 1);
i--;
}
}
console.log(
'HANDLEERRORFROMAPI: ',
JSON.stringify(errorsList),
dupMerchant,
      ];
if (dupMerchant) {
setErrorState((prev: any) => {
return {
...prev,
['legalName']: {
isInvalid: true,
message: `Enter a merchant name that is not already in use, or consider updating the existing ${formData.legalName} merchant.`,
},
};
        }];
}

      //If there are still other errors remaining in the list, show in the top of the page.
if (errorsList && errorsList.length > 0) {
setserverMsg(
<div id="serverError">
<h4>
Server returned error while processing data. Please fix the
following error and try again.
</h4>
<ul>
{errorsList.map((e: any, index: number) => (
<li key={index}>{e.message}</li>
              }]}
</ul>
</div>,
        };
}
}

    const id = setTimeout(() => setserverMsg(null), 20000);
savedCallback.current = id;
};

  const saveDraftClicked = async () => {
//Reset server error
setserverMsg(null);

    const merchantData = sameAddress ? copyAddresses(formData) : formData;

    const saveData = {
...merchantData,
recordState: 'Draft',
tenantId: tenant.id,
};

    const { isValid, ...validation } =
await merchantValidator().validateForDraft(saveData);

    if (!isValid) {
setErrorState(validation);
//alert("form is not valid..please fix the errors before submitting")
showNotification();
    else
//let merchantId = new FakeMerchants().saveMerchant(unflattenAddress(saveData))
const toBeSavedData: any = await unflattenAddress(saveData);
const url = createState
? `${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants?tenantId=${tenant.id}`
: `${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants/${toBeSavedData.id}`;

      //Delete the id from the object when updating since it takes key as url param
if (!createState) {
delete toBeSavedData.id;
}

      console.log('save draft here', toBeSavedData);
client2(url, createState ? 'POST' : 'PUT', { body: toBeSavedData })
.then((data) => {
console.log(data);
push(`/admin/tenant/${tenant.id}/merchant`);
        }]
.catch((e) => {
//console.log(e)
handleErrorFromApi(e);
        }];
}
};
const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={classes2.button + ' ' + classes2.success}
cancelBtnCssClass={classes2.button + ' ' + classes2.danger}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
push(`/admin/tenant/${tenant.id}/merchant`);
};

  return (
<div>
{alert}
<GridContainer>
<form>
{serverMsg && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={serverMsg}
close={true}
color="danger"
closeNotification={() => setserverMsg(null)}
/>
</GridItem>
</GridContainer>
          }}
<GridContainer>
<GridItem xs={12} sm={2} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>
Merchant Information
</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="createMerchant"
label="Legal Name"
htmlFor="legalName"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="legalName"
success={!errorState.legalName.isInvalid}
error={errorState.legalName.isInvalid}
helperText={
errorState.legalName.isInvalid
? errorState.legalName.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: 'Active' === formData.recordState,
onChange: (e) => {
const { value } = e.target;
if (
formData.postalName === formData.legalName
                                 } {
setFormData((prev) => {
return {
...prev,
['postalName']: value,
};
                                   }];
}
handleChange(e);
validateChange(e);
},
// onBlur: e => {
//     if( formData.postalName === null || formData.postalName.length === 0 ) {
//         setFormData( (prev) => {
//             return {
                                                   ..prev.
//                 ['postalName']: formData.legalName
                              [[ }
                              [[ }]
                              [[ }
                              [[ },
value: formData.legalName,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="Postal Name"
htmlFor="postalName"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="postalName"
success={!errorState.postalName.isInvalid}
error={errorState.postalName.isInvalid}
helperText={
errorState.postalName.isInvalid
? errorState.postalName.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: formData.postalName,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="Branch Number"
htmlFor="branchNumber"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="branchNumber"
success={!errorState.branchNumber.isInvalid}
error={errorState.branchNumber.isInvalid}
helperText={
errorState.branchNumber.isInvalid
? errorState.branchNumber.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: formData.branchNumber,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="Phone Number"
htmlFor="phoneNumber"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="phoneNumber"
success={!errorState.phoneNumber.isInvalid}
error={errorState.phoneNumber.isInvalid}
helperText={
errorState.phoneNumber.isInvalid
? errorState.phoneNumber.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: formData.phoneNumber,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="CUIC Customer Number"
htmlFor="cuicCustomerNumber"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="cuicCustomerNumber"
success={!errorState.cuicCustomerNumber.isInvalid}
error={errorState.cuicCustomerNumber.isInvalid}
helperText={
errorState.cuicCustomerNumber.isInvalid
? errorState.cuicCustomerNumber.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: disableCUIC,
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: formData.cuicCustomerNumber,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="createMerchant"
label="Type"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<FormControl
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
error={errorState.merchantTypeId.isInvalid}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
name="merchantTypeId"
value={formData.merchantTypeId}
onChange={handleChange}
onBlur={validateChange}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
<MenuItem
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value="1"
>
Credit Union
</MenuItem>
</Select>
</FormControl>
{errorState.merchantTypeId.isInvalid && (
<FormHelperText error id="merchantTypeCode-text">
{errorState.merchantTypeId.message}
</FormHelperText>
                          }}
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="Start Date"
htmlFor="startDate"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="startDate"
success={!errorState.startDate.isInvalid}
error={errorState.startDate.isInvalid}
helperText={
errorState.startDate.isInvalid
? errorState.startDate.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
placeholder: 'mm/dd/yyyy',
onChange: handleChange,
onBlur: validateChange,
value: formData.startDate,
}}
                          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="End Date"
htmlFor="endDate"
                          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="endDate"
success={!errorState.endDate.isInvalid}
error={errorState.endDate.isInvalid}
helperText={
errorState.endDate.isInvalid
? errorState.endDate.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
placeholder: 'mm/dd/yyyy',
onChange: handleChange,
onBlur: validateChange,
value: formData.endDate,
}}
                          [>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
<GridItem xs={12} sm={2} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Status</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer style={{ marginBottom: '-24px' }}>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createMerchant"
label="System Status"
                          [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p className={classes.staticFormControl}>
{formData.recordState
? formData.recordState
: 'New'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={false}
styleType="createMerchant"
label="Legal Status"
                          [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
name="legalStatus"
value={formData.legalStatus}
onChange={handleChange}
onBlur={validateChange}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
{[
'Active',
'Merged',
'Liquidated',
'Inactive',
'In Process of Merging',
'In Process of Liquidating',
'Conservatorship',
'Purchase',
'Assumption',
].map((m) => (
<MenuItem
key={m}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m}
>
                                  {>}
</MenuItem>
                               }]}
</Select>
</FormControl>
{errorState.legalStatus?.isInvalid && (
<FormHelperText error id="legalStatus-text">
{errorState.legalStatus?.message}
</FormHelperText>
                          }}
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={false}
styleType="createMerchant"
label="Operational Status"
                          [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
aria-label="Operational Status Input"
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={formData.operationalStatus}
name="operationalStatus"
onChange={handleChange}
onBlur={validateChange}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
{[
'Open for Business',
'Transitioning out of Business',
'Open for Business with Special Handling',
'Closed for Business',
].map((m) => (
<MenuItem
key={m}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m}
>
                                  {>}
</MenuItem>
                               }]}
</Select>
</FormControl>
{errorState.operationalStatus?.isInvalid && (
<FormHelperText error id="operationalStatus-text">
{errorState.operationalStatus?.message}
</FormHelperText>
                          }}
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Addresses</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={12} md={11}>
<div className={classes.block}>
<FormControlLabel
control={
<Switch
checked={sameAddress}
onChange={(event) =>
setSameAddress(event.target.checked)
}
value="sameAddress"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
/>
}
classes={{
label: classes.label,
}}
label="Same Address for Physical and Mailing"
                            [>
</div>
</GridItem>
</GridContainer>
<PhysicalAddress
handleChange={handleChange}
errorState={errorState}
data={formData}
addType="Physical"
stateType="text"
countryType="text"
validateChange={validateChange}
                      [>
{!sameAddress ? (
<MailingAddress
handleChange={handleChange}
errorState={errorState}
data={formData}
addType="Mailing"
stateType="text"
countryType="text"
validateChange={validateChange}
                        [>
                        : nully
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12} sm={12} md={12}>
<Button
id="create-merchant-discard-changes"
color="danger"
simple
onClick={discardChangesWarning}
>
Discard Changes
</Button>
{'Active' !== formData.recordState && (
<Button
id="create-merchant-save-draft"
style={{
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={saveDraftClicked}
disabled={'Active' === formData.recordState}
>
Save Draft
</Button>
              }}
<Button
id="create-merchant-save"
color="success"
onClick={saveClicked}
>
Save
</Button>
<Snackbar
place="bc"
color="danger"
message="Please fix form errors before submitting."
open={bc}
closeNotification={() => setBC(false)}
close
/>
</GridItem>
</GridContainer>
</form>
</GridContainer>
</div>
  ];
};

export default CreateMerchant;

```
<!-- CODESCAN_FILE_END -->

---

### 269. `C:\DevCode\AstroUI\src\components\CreateMerchant\MailingAddress.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\MailingAddress.tsx" type=".tsx" size="9072" lines="290" chars="9072" -->
```typescript
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomInput from 'components/CustomInput/CustomInput';
// core components
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';

const useStyles = makeStyles(styles);

export default function MailingAddress(props: any) {
const classes = useStyles();

  const { errorState, validateChange, handleChange, stateType, countryType } =
props;
return (
<div style={{ paddingTop: '30px' }}>
<GridContainer>
<GridItem xs={12} sm={2} md={3}>
<span style={{ fontWeight: 'bold' }}>{props.addType}</span>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="Line 1"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_line1`}
success={!errorState.Mailing_line1.isInvalid}
error={errorState.Mailing_line1.isInvalid}
helperText={
errorState.Mailing_line1.isInvalid
? errorState.Mailing_line1.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_line1,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="Line 2"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_line2`}
success={!errorState.Mailing_line2.isInvalid}
error={errorState.Mailing_line2.isInvalid}
helperText={
errorState.Mailing_line2.isInvalid
? errorState.Mailing_line2.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_line2,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="Line 3"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_line3`}
success={!errorState.Mailing_line3.isInvalid}
error={errorState.Mailing_line3.isInvalid}
helperText={
errorState.Mailing_line3.isInvalid
? errorState.Mailing_line3.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_line3,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="City / Locale"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_city`}
success={!errorState.Mailing_city.isInvalid}
error={errorState.Mailing_city.isInvalid}
helperText={
errorState.Mailing_city.isInvalid
? errorState.Mailing_city.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_city,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="County"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_county`}
success={!errorState.Mailing_county.isInvalid}
error={errorState.Mailing_county.isInvalid}
helperText={
errorState.Mailing_county.isInvalid
? errorState.Mailing_county.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_county,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="State / Province"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_state`}
success={!errorState.Mailing_state.isInvalid}
error={errorState.Mailing_state.isInvalid}
helperText={
errorState.Mailing_state.isInvalid
? errorState.Mailing_state.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: props.data.Mailing_state,
onChange: (e) => {
handleChange(e);
validateChange(e);
},
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="Zip / Postal Code"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_postalCode`}
success={!errorState.Mailing_postalCode.isInvalid}
error={errorState.Mailing_postalCode.isInvalid}
helperText={
errorState.Mailing_postalCode.isInvalid
? errorState.Mailing_postalCode.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Mailing_postalCode,
}}
          [>
</GridItem>
</GridContainer>

      <GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="Country"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_country`}
success={!errorState.Mailing_country.isInvalid}
error={errorState.Mailing_country.isInvalid}
helperText={
errorState.Mailing_country.isInvalid
? errorState.Mailing_country.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: props.data.Mailing_country,
onChange: (e) => {
handleChange(e);
validateChange(e);
},
}}
          [>
</GridItem>
</GridContainer>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 270. `C:\DevCode\AstroUI\src\components\CreateMerchant\MerchantHelper.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\MerchantHelper.ts" type=".ts" size="1725" lines="76" chars="1725" -->
```typescript
import { isEmptyString } from '../../helpers/validations';
import { addressSame } from 'helpers/addresshelper';

const unflattenAddress = async (formData: any) => {
const rval: any = {};
const pa: any = {};
const ma: any = {};

  for (const k in formData) {
if (k.includes('Physical_')) {
pa[k.replace('Physical_', '')] = formData[k];
} else if (k.includes('Mailing_')) {
ma[k.replace('Mailing_', '')] = formData[k];
} else {
rval[k] = formData[k];
}
}

  rval['addresses'] = [];

  if (Object.keys(pa).length !== 0) {
pa['addressType'] = 'Physical';
rval.addresses.push(pa);
}

  if (Object.keys(ma).length !== 0) {
ma['addressType'] = 'Mailing';
rval.addresses.push(ma);
}

  if (await isEmptyString.isValid(rval.id)) {
delete rval.id;
}
return rval;
};

const populateTemplate = (
formData: any,
template: any,
setSameAddress: any,
) => {
const rval = {
...template,
};

  for (const key in formData) {
if ('addresses' === key) {
const pa = formData.addresses.find(
(address: any) => address.addressType === 'Physical',
      ];
if (pa) {
// eslint-disable-next-line no-var
for (var k in pa) {
rval['Physical_' + k] = pa[k];
}
}
const ma = formData.addresses.find(
(address: any) => address.addressType === 'Mailing',
      ];
if (ma) {
for (k in ma) {
rval['Mailing_' + k] = ma[k];
}
}
setSameAddress(addressSame(pa, ma));
} else {
//Copy rest of the values as it is from formData into template
rval[key] = formData[key];
}
}

  return rval;
};

export { unflattenAddress, populateTemplate };

```
<!-- CODESCAN_FILE_END -->

---

### 271. `C:\DevCode\AstroUI\src\components\CreateMerchant\MerchantValidation.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreateMerchant\MerchantValidation.ts" type=".ts" size="6377" lines="268" chars="6377" -->
```typescript
import {
isEmptyStringCheck,
isValidDate,
maxLengthCheck,
zipNumericOnlyNonEmpty,
} from 'helpers/validations';
import FormValidator from 'utils/FormValidator';

const merchantValidator: () => FormValidator = () => {
return new FormValidator([
{
field: 'legalName',
method: isEmptyStringCheck,
validWhen: false,
message: 'Legal Name is required.',
},
{
field: 'branchNumber',
method: isEmptyStringCheck,
validWhen: false,
message: 'Branch number is required.',
},
{
field: 'startDate',
method: isValidDate,
validWhen: true,
message: 'Start Date is invalid. Should be mm/dd/yyyy',
},
{
field: 'endDate',
method: isValidDate,
validWhen: true,
message: 'End Date is invalid. Should be mm/dd/yyyy',
},
{
field: 'legalName',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'Legal Name should be up to 50 characters',
},
{
field: 'merchantTypeId',
method: isEmptyStringCheck,
validWhen: false,
message: 'Type is required.',
required: 'Active',
},
{
field: 'postalName',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'Postal Name should be up to 50 characters',
},
{
field: 'phoneNumber',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Phone number should be up to 30 characters.',
},
{
field: 'cuicCustomerNumber',
method: maxLengthCheck,
arg: 15,
validWhen: true,
message: 'CUIC Customer Number should be up to 15 characters.',
},
{
field: 'Physical_line1',
method: isEmptyStringCheck,
validWhen: false,
message: 'Line 1 is required.',
required: 'Active',
},
{
field: 'Physical_line1',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 1 should be up to 30 characters',
},
{
field: 'Physical_line2',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 2 should be up to 30 characters',
},
{
field: 'Physical_line3',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 3 should be up to 30 characters',
},
{
field: 'Physical_city',
method: isEmptyStringCheck,
validWhen: false,
message: 'City is required.',
required: 'Active',
},
{
field: 'Physical_city',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'City should be up to 50 characters',
},
{
field: 'Physical_county',
method: maxLengthCheck,
arg: 35,
validWhen: true,
message: 'County should be up to 35 characters',
},
{
field: 'Physical_state',
method: isEmptyStringCheck,
validWhen: false,
message: 'State is required.',
required: 'Active',
},
{
field: 'Physical_state',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'State should be up to 50 characters',
},
{
field: 'Physical_postalCode',
method: isEmptyStringCheck,
validWhen: false,
message: 'Zip is required.',
required: 'Active',
},
{
field: 'Physical_postalCode',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 1 should be up to 30 characters',
},
{
field: 'Physical_line2',
      method: zipNumericOnlyNonEmpty.
validWhen: true,
      message: 'Zip should contain only numbers',
},
{
field: 'Physical_line3',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 3 should be up to 30 characters',
},
{
field: 'Physical_city',
method: isEmptyStringCheck,
validWhen: false,
message: 'Country is required.',
required: 'Active',
},
{
field: 'Mailing_line1',
method: isEmptyStringCheck,
validWhen: false,
message: 'Line 1 is required.',
required: 'Active',
},
{
field: 'Mailing_line1',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 1 should be up to 30 characters',
},
{
field: 'Mailing_line2',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 2 should be up to 30 characters',
},
{
field: 'Mailing_line3',
method: maxLengthCheck,
arg: 30,
validWhen: true,
message: 'Line 3 should be up to 30 characters',
},
{
field: 'Mailing_city',
method: isEmptyStringCheck,
validWhen: false,
message: 'City is required.',
required: 'Active',
},
{
field: 'Mailing_city',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'City should be up to 50 characters',
},
{
field: 'Mailing_county',
method: maxLengthCheck,
arg: 35,
validWhen: true,
message: 'County should be up to 35 characters',
},
{
field: 'Mailing_state',
method: isEmptyStringCheck,
validWhen: false,
message: 'State is required.',
required: 'Active',
},
{
field: 'Mailing_state',
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'State should be up to 50 characters',
},
{
field: 'Mailing_postalCode',
method: isEmptyStringCheck,
validWhen: false,
message: 'Zip is required.',
required: 'Active',
},
{
field: 'Mailing_postalCode',
method: maxLengthCheck,
arg: 10,
validWhen: true,
message: 'Zip should be up to 10 characters',
},
{
field: 'Mailing_postalCode',
method: zipNumericOnlyNonEmpty,
validWhen: true,
message: 'Zip should contain only numbers',
},
{
field: 'Mailing_country',
method: maxLengthCheck,
arg: 35,
validWhen: true,
message: 'Country should be up to 35 characters.',
},
{
field: 'Mailing_country',
method: isEmptyStringCheck,
validWhen: false,
message: 'Country is required.',
required: 'Active',
},
  ]};
};

export { merchantValidator };

```
<!-- CODESCAN_FILE_END -->

---








































            id={'${props.addType}_line1'}
            success={!errorState.Physical_line1.isInvalid}
            error={errorState.Physical_line1.isInvalid}
            helperText={
              errorState.Physical_line1.isInvalid
                ? errorState.Physical_line1.message
                  undefined
            }
            formControlProps={{
              fullwidth: true,
            }}
            inputProps={{
              type: 'text',
              onChange:(e) => {
                handleChange(e):
                validateChange(e);
              },
              value: props.data.Physical_line1,
            }}

        </GridItem>
      </GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="Line 2"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_line2`}
success={!errorState.Physical_line2.isInvalid}
error={errorState.Physical_line2.isInvalid}
helperText={
errorState.Physical_line2.isInvalid
? errorState.Physical_line2.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Physical_line2,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="Line 3"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_line3`}
success={!errorState.Physical_line3.isInvalid}
error={errorState.Physical_line3.isInvalid}
helperText={
errorState.Physical_line3.isInvalid
? errorState.Physical_line3.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Physical_line3,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="City / Locale"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_city`}
success={!errorState.Physical_city.isInvalid}
error={errorState.Physical_city.isInvalid}
helperText={
errorState.Physical_city.isInvalid
? errorState.Physical_city.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Physical_city,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="physicalAddress"
label="County"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_county`}
success={!errorState.Physical_county.isInvalid}
error={errorState.Physical_county.isInvalid}
           IhelperText={
errorState.Physical_county.isInvalid
? errorState.Physical_county.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Physical_county,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="State / Province"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_state`}
success={!errorState.Physical_state.isInvalid}
error={errorState.Physical_state.isInvalid}
helperText={
errorState.Physical_state.isInvalid
? errorState.Physical_state.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: props.data.Physical_state,
onChange: (e) => {
handleChange(e);
validateChange(e);
},
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="Zip / Postal Code"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_postalCode`}
success={!errorState.Physical_postalCode.isInvalid}
error={errorState.Physical_postalCode.isInvalid}
helperText={
errorState.Physical_postalCode.isInvalid
? errorState.Physical_postalCode.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
onChange: (e) => {
handleChange(e);
validateChange(e);
},
value: props.data.Physical_postalCode,
}}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
required={true}
styleType="physicalAddress"
label="Country"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id={`${props.addType}_country`}
success={!errorState.Physical_country.isInvalid}
error={errorState.Physical_country.isInvalid}
helperText={
errorState.Physical_country.isInvalid
? errorState.Physical_country.message
: undefined
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: props.data.Physical_country,
onChange: (e) => {
handleChange(e);
validateChange(e);
},
}}
          [>
</GridItem>
</GridContainer>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 273. `C:\DevCode\AstroUI\src\components\CreditScoreRanges\__test__\CreditScoreRanges.test.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithMockTenant } from 'components/__mock__/mock-context';
import CreditScoreRanges from '../CreditScoreRanges';
import * as APIClient from 'utils/api-client';
import { createMemoryHistory } from 'history';

jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: () => ({
tenantId: 'tenantId',
  }},
}}];

describe('should test the CreditScoreRanges comonent', () => {
afterEach(() => {
jest.clearAllMocks();
  }};

  const client2Spy = jest.spyOn(APIClient, 'client2');

  const fetchedRanges = {
payload: {
creditRange_0_Name: 'Awesome',
creditRange_0_High: '999',
creditRange_0_Low: '1',
creditRange_1_Name: 'Swell',
creditRange_1_High: '851',
creditRange_1_Low: '801',
creditRange_2_Name: 'POW',
creditRange_2_High: '798',
creditRange_2_Low: '751',
defaultCategory: 'creditRange_2',
creditRange_3_Name: 'ZINGER',
creditRange_3_High: '748',
creditRange_3_Low: '701',
creditRange_4_Name: 'LANDSLIDE',
creditRange_4_High: '698',
creditRange_4_Low: '651',
},
};

  test('Successful save with values changed and credit ranges added', async () => {
const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
legalName: 'Test CU',
};

    const props = {
match: {
path: '',
isExact: true,
url: '',
params: {
tenantId: mockTenant.id,
},
},
};

    client2Spy.mockResolvedValueOnce(fetchedRanges).mockResolvedValueOnce({
ok: true,
json: () => {},
    }};

    renderWithMockTenant(mockTenant, <CreditScoreRanges />);

    await screen.findByText('Please Wait...');

    const saveButton = screen.getByText('Save');

    const addButton = screen.getByText('Add');

    // await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-0'), {
target: { value: 'Excellent' },
    }};

    await fireEvent.change(screen.getByTestId('high-0'), {
target: { value: 850 },
    }};

    await fireEvent.change(screen.getByTestId('low-0'), {
target: { value: 801 },
    }};

    // await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-1'), {
target: { value: 'Great' },
    }};

    await fireEvent.change(screen.getByTestId('high-1'), {
target: { value: 799 },
    }};

    await fireEvent.change(screen.getByTestId('low-1'), {
target: { value: 750 },
    }};

    // await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-2'), {
target: { value: 'Good' },
    }};

    await fireEvent.change(screen.getByTestId('high-2'), {
target: { value: 749 },
    }};

    await fireEvent.change(screen.getByTestId('low-2'), {
target: { value: 700 },
    }};

    // await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-3'), {
target: { value: 'Ok' },
    }};

    await fireEvent.change(screen.getByTestId('high-3'), {
target: { value: 699 },
    }};

    await fireEvent.change(screen.getByTestId('low-3'), {
target: { value: 650 },
    }};

    await fireEvent.change(screen.getByTestId('category-4'), {
target: { value: 'ZOOM' },
    }};

    await fireEvent.change(screen.getByTestId('high-4'), {
target: { value: 499 },
    }};

    await fireEvent.change(screen.getByTestId('low-4'), {
target: { value: 401 },
    }};

    await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-5'), {
target: { value: 'Blah' },
    }};

    await fireEvent.change(screen.getByTestId('high-5'), {
target: { value: 356 },
    }};

    await fireEvent.change(screen.getByTestId('low-5'), {
target: { value: 200 },
    }};
await fireEvent.click(addButton);

    await fireEvent.change(screen.getByTestId('category-6'), {
target: { value: 'BEEP' },
    }};

    await fireEvent.change(screen.getByTestId('high-6'), {
target: { value: 199 },
    }};

    await fireEvent.change(screen.getByTestId('low-6'), {
target: { value: 150 },
    }};

    const defaultButton = screen.getByTestId('default-button-2');
fireEvent.click(defaultButton);

    await fireEvent.click(saveButton);

    expect(client2Spy).toHaveBeenNthCalledWith(
      2.
`${process.env.REACT_APP_TENANT_API_BASE_URL}tenant-score-ranges/${mockTenant.id}`,
'PUT',
{
body: expect.objectContaining({
creditRange_0_Name: 'Excellent',
creditRange_0_High: '850',
creditRange_0_Low: '801',
creditRange_1_Name: 'Great',
creditRange_1_High: '799',
creditRange_1_Low: '750',
creditRange_2_Name: 'Good',
creditRange_2_High: '749',
creditRange_2_Low: '700',
creditRange_3_Name: 'Ok',
creditRange_3_High: '699',
creditRange_3_Low: '650',
creditRange_4_Name: 'ZOOM',
creditRange_4_High: '499',
creditRange_4_Low: '401',
creditRange_5_Name: 'Blah',
creditRange_5_High: '356',
creditRange_5_Low: '200',
creditRange_6_Name: 'BEEP',
creditRange_6_High: '199',
creditRange_6_Low: '150',
defaultCategory: 'creditRange_2',
        }],
},
    ];
}, 5000);

  test.skip('Form errors', async () => {
const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

    client2Spy.mockResolvedValueOnce(fetchedRanges).mockResolvedValueOnce({
ok: true,
json: () => {},
    }};

    const props = {
match: {
path: '',
isExact: true,
url: '',
params: {
tenantId: mockTenant.id,
},
},
};

    renderWithMockTenant(mockTenant, <CreditScoreRanges />);

    await screen.findByText('Please Wait...');

    const saveButton = screen.getByText('Save');

    // excellent high is 4 digits (too many)
fireEvent.change(screen.getByTestId('excellent-high'), {
target: { value: 1234 },
    }};
fireEvent.change(screen.getByTestId('excellent-low'), {
target: { value: 111 },
    }};
fireEvent.change(screen.getByTestId('very-good-high'), {
target: { value: 222 },
    }};
fireEvent.change(screen.getByTestId('very-good-low'), {
target: { value: 333 },
    }};
fireEvent.change(screen.getByTestId('good-high'), {
target: { value: 444 },
    }};
fireEvent.change(screen.getByTestId('good-low'), {
target: { value: 555 },
    }};
fireEvent.change(screen.getByTestId('average-high'), {
target: { value: 666 },
    }};
fireEvent.change(screen.getByTestId('average-low'), {
target: { value: 777 },
    }};
fireEvent.change(screen.getByTestId('below-average-high'), {
target: { value: 888 },
    }};
fireEvent.change(screen.getByTestId('below-average-low'), {
target: { value: 999 },
    )

    fireEvent.click(saveButton);

    const alert = screen.getByText('Please fix form errors before submitting.');
expect(alert).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Close' });
expect(closeButton);
fireEvent.click(closeButton);
  }};

  test('Data fetch error', async () => {
const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

    client2Spy.mockRejectedValueOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
    }};

    renderWithMockTenant(mockTenant, <CreditScoreRanges />);

    await screen.findByText('Please Wait...');

    const errorNotification = await screen.findByRole('full-page-status-error');
expect(errorNotification).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Close' });
expect(closeButton).toBeInTheDocument();
fireEvent.click(closeButton);
  }};

  test('Should display and hide discard message', async () => {
const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

    const history = createMemoryHistory({
initialEntries: [`/admin/tenant/${mockTenant.id}/credit-score-ranges`],
    }};

    client2Spy.mockResolvedValueOnce(fetchedRanges);

    renderWithMockTenant(mockTenant, <CreditScoreRanges />);

    await screen.findByText('Please Wait...');

    history.push(`/admin/tenant/${mockTenant.id}/view`);

    const discardButton = screen.getByRole('button', {
name: 'Discard Changes',
    }};
expect(discardButton).toBeInTheDocument();
fireEvent.click(discardButton);
const confirmButton = screen.getByRole('button', { name: 'Yes, Discard!' });
expect(confirmButton).toBeInTheDocument();
fireEvent.click(confirmButton);
  }};

  test('Should display and cancel discard message', async () => {
const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

    client2Spy.mockResolvedValueOnce(fetchedRanges);

    renderWithMockTenant(mockTenant, <CreditScoreRanges />);

    await screen.findByText('Please Wait...');

    const discardButton = screen.getByRole('button', {
name: 'Discard Changes',
    }};
expect(discardButton).toBeInTheDocument();
fireEvent.click(discardButton);

    const dialogue = await screen.findByText('Your changes will be lost!');
expect(dialogue).toBeInTheDocument();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
fireEvent.click(cancel);

    expect(dialogue).not.toBeInTheDocument();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 274. `C:\DevCode\AstroUI\src\components\CreditScoreRanges\CreditScoreRanges.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreditScoreRanges\CreditScoreRanges.tsx" type=".tsx" size="16332" lines="548" chars="16332" -->
```typescript
import { makeStyles } from '@material-ui/core';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import { Table, BasicInput, Checkbox, Icon, ICON_TYPES } from 'commonui';
import { CardSection } from 'components/Card/CardSection';
import Button from 'components/CustomButtons/Button';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridItem from 'components/Grid/GridItem';
import Snackbar from 'components/Snackbar/Snackbar';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import { fieldMaxLength } from 'components/SystemRoles/validate-role';
import { useAppContext } from 'context/app-context';
import React, { useEffect, useState } from 'react';
import SweetAlert from 'react-bootstrap-sweetalert';
import { useNavigate, useParams } from 'react-router-dom';
import { client2 } from 'utils/api-client';
import { SCActionButton, SCHeader } from '../TableStyles';
import { CreditScoreData, ICreditRow } from './types';

const useStyles2 = makeStyles(sweetAlertStyle);

const CreditScoreRanges = (): JSX.Element => {
const classes2 = useStyles2();
const push = useNavigate();

  const [serverMsg, setServerMsg] = useState<boolean>(false);
const [bc, setBC] = useState(false);
const [alert, setAlert] = useState<boolean>(false);

  const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();

  const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState<null | Error | undefined>(
null,
  ];
const [rangeData, setRangeData] = useState<CreditScoreData>({
tenantId: '',
defaultCategory: '',
  }};
const [selected, setSelected] = useState('');
const params = useParams();

  const getErrorSetter = (key: string) => {
return (errorExists: boolean) => {
setErrors((prev) => {
prev[key] = errorExists;
return { ...prev };
      }];
};
};

  const finalData: CreditScoreData = {
tenantId: rangeData.tenantId,
defaultCategory: selected,
};

  const updateDefault: (v: string) => void = (v: string) => {
setRangeData((prev) => {
return {
...prev,
defaultCategory: v,
};
    }};
};

  const [formattedCreditRanges, setFormattedCreditRanges] = useState<
ICreditRow[]
  >{[]];

  // NEED TO HANDLE ERRORS STILL -JOE
const [errors, setErrors] = useState<{ [key: string]: boolean }>({
input: false,
  }};

  // if incoming data from tenant services, parse through and setFormattedCreditRanges with proper data
const formatRelevantIncomingData = (
currentIncomingData: Record<string, unknown>,
) => {
const nameRegex = /\b(\w*Name\w*)\b/;
const highRegex = /\b(\w*High\w*)\b/;
const lowRegex = /\b(\w*Low\w*)\b/;
const arrSize = 3;
const values = [];
const arrrWithSets = [];
for (const [key, value] of Object.entries(currentIncomingData)) {
if (
`${key}`.match(nameRegex) ||
`${key}`.match(lowRegex) ||
`${key}`.match(highRegex)
      ] {
values.push(`${value}`);
}
}
for (let i = 0; i < values.length; i += arrSize) {
const set = values.slice(i, i + arrSize);
if (set[0] !== 'null' && set[0] !== 'TEST') {
arrrWithSets.push({
id: `creditRange_${arrrWithSets.length}`,
key: `creditRange_${arrrWithSets.length}`,
category: set[0],
high: set[2],
low: set[1],
        }];
}
}
setFormattedCreditRanges(arrrWithSets);
};

  const deleteRow = (rowId: string | number, arr: ICreditRow[]): any => {
setFormattedCreditRanges(arr.filter((row) => row.id !== rowId));
};

  const createUniqueId = (arr: ICreditRow[]): any => {
const currentIds = [];
const idPrefix = 'creditRange';
if (arr.length) {
for (let i = 0; i < arr.length; i++) {
currentIds.push(arr[i].id);
}
for (let j = 0; j <= currentIds.length; j++) {
currentIds.sort();
if (currentIds[j] !== `${idPrefix}_${j}`) return `${idPrefix}_${j}`;
}
} else return `${idPrefix}_0`;
};

  const createNewRow = (oldData: ICreditRow[]) => {
const newRow: ICreditRow = {
id: createUniqueId(oldData),
key: createUniqueId(oldData),
selected: false,
category: '',
high: '',
low: '',
};
setFormattedCreditRanges([...oldData, newRow]);
};

  const formatData = (rowData: ICreditRow[]) => {
return (
rowData &&
rowData.map(({ id, key }, index) => {
return {
id,
key,
selected: (
<Checkbox
color={'primary'}
value={id}
id={id + '_check'}
data-testId={`default-button-${index}`}
checked={selected === id}
onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
const value = e.target.value;
setSelected(value);
updateDefault(value);
}}
/>
          },
category: (
<EditableValue
id={`category-${index}`}
name={`category-${index}`}
testId={`category-${index}`}
isErred={errors[`category-${index}`]}
setError={getErrorSetter(`category-${index}`)}
placeholder="Category"
value={rowData ? `${rowData[index].category}` : ''}
required="true"
type="text"
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
const value = e.target.value;
const dataToUpdate = [...rowData];
dataToUpdate[index].category = value;
setFormattedCreditRanges(dataToUpdate);
}}
/>
          },
high: (
<EditableValue
id={`high-${index}`}
testId={`high-${index}`}
isErred={errors[`high-${index}`]}
setError={getErrorSetter(`high-${index}`)}
maxLength={fieldMaxLength.creditRange}
placeholder="High"
value={rowData ? rowData[index].high : ''}
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
setErrors({ input: false });
const value = e.target.value;
const dataToUpdate = [...rowData];
dataToUpdate[index].high = value;
setFormattedCreditRanges(dataToUpdate);
}}
disabled={false}
/>
          },
low: (
<EditableValue
id={`low-${index}`}
testId={`low-${index}`}
isErred={errors[`low-${index}`]}
setError={getErrorSetter(`low-${index}`)}
maxLength={fieldMaxLength.creditRange}
placeholder="Low"
value={
formattedCreditRanges ? formattedCreditRanges[index].low : ''
}
required={true}
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
setErrors({ input: false });
const value = e.target.value;
const dataToUpdate = [...rowData];
dataToUpdate[index].low = value;
setFormattedCreditRanges(dataToUpdate);
}}
/>
          },
delete: (
<SCActionButton
id={`${id}_delete`}
aria-label="delete"
title="Delete Credit Range"
onClick={() => {
setErrors({ input: false });
deleteRow(id, rowData);
}}
color="red"
className="edit"
>
<Icon size={14} name={ICON_TYPES.CLOSE} />
</SCActionButton>
          },
};
      }]
    ];
};

  const titleList = new Map();

  //call service to get the list of credit score ranges for tenant.
useEffect(() => {
setDisplayCreateButton(false);
if (!loading) return;

    const tenantId = params?.tenantId;

    if (tenantId) {
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
        };
titleList.set(
`Credit Score Ranges`,
`/admin/tenant/${tenant?.id}/credit-score-ranges`,
      ];
//Enable for Dev testing
client2(
`${process.env.REACT_APP_TENANT_API_BASE_URL}public/tenant-score-ranges/${tenantId}`,
      ]
.then((incomingData) => {
incomingData.payload.defaultCategory = incomingData.payload
.defaultCategory
? setSelected(incomingData.payload.defaultCategory)
            ; ` `;
setRangeData((prev) => {
return {
...prev,
defaultCategory: incomingData.payload.defaultCategory
? incomingData.payload.defaultCategory
                 'creditRange_o',
};
});
setRangeData(incomingData.payload);
formatRelevantIncomingData(incomingData.payload);

          setLoading(false);
        }]
.catch((error) => {
console.log(error);
setLoading(false);
setErrorResponse(error);
        }];
setPageTitle(titleList);
}
}, [loading]);

  const showNotification: () => void = () => {
if (!bc) {
setBC(true);
setTimeout(function () {
setBC(false);
}, 6000);
}
};

  const validate: () => boolean = () => {
for (const field in errors) {
if (Object.prototype.hasOwnProperty.call(errors, field)) {
if (errors[field]) return false;
}
}

    return true;
};

  const saveClicked: () => void = () => {
// Reset server error
setServerMsg(false);

    formattedCreditRanges.forEach((range) => {
if (+!range.high.match(intRegex) || +!range.low.match(intRegex)) {
setErrors({ input: true });
}
    }};

    const isValid = validate();

    if (!isValid) {
showNotification();
} else {
if (tenant && tenant.id) {
const url = `${process.env.REACT_APP_TENANT_API_BASE_URL}tenant-score-ranges/${tenant.id}`;

        if (formattedCreditRanges) {
const newDataMapped = formattedCreditRanges.map(
({ id, category, high, low }) => {
return {
[`${id}_Name`]: category,
[`${id}_High`]: high,
[`${id}_Low`]: low,
};
},
          };

          for (let i = 0; i <= newDataMapped.length; i++) {
Object.assign(finalData, newDataMapped[i]);
}
setRangeData(finalData);
}

        if (finalData) {
//Delete the id from the object when updating since it takes key as url param
delete finalData.tenantId;
}

        client2(url, 'PUT', { body: finalData })
.then((data) => {
console.log(data);
push(`/admin/tenant/${tenant.id}/view`);
          }]
.catch(() => {
setServerMsg(true);
          }];
}
}
};

  const discardChangesWarning: () => void = () => {
setAlert(true);
};

  const hideAlert: () => void = () => {
setAlert(false);
};

  const discardChanges: () => void = () => {
setAlert(false);
if (tenant && tenant.id) {
push(`/admin/tenant/${tenant.id}/view`);
}
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  if (!rangeData) {
console.log('data is null for score ranges ');
return (
<Snackbar
style={{ top: '50%' }}
place="tc"
color="danger"
message="Error while processing request. Please try again."
open={true}
closeNotification={() => {}}
close
      [>
    ];
}

  return (
<div>
{alert && (
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={classes2.button + ' ' + classes2.success}
cancelBtnCssClass={classes2.button + ' ' + classes2.danger}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>
      ]}
<div role="creditScoreRangesGrid">
{loading && <p>Please wait...</p>}
{serverMsg && (
<div>
<div>
<SnackbarContent
message={
<div id="serverError">
<h4>
Server returned error while processing data. Please try
again.
</h4>
</div>
}
close={true}
color="danger"
closeNotification={() => setServerMsg(false)}
/>
</div>
</div>
        }}
<GridItem xs={8}>
<Button
key={'creditScoreRangesAdd'}
id="credit-score-ranges-add"
color="success"
onClick={() =>
formattedCreditRanges.length < 10
? createNewRow(formattedCreditRanges)
: null
}
>
Add
</Button>
<CardSection title="Credit Score Ranges">
<Table
data={formatData(formattedCreditRanges)}
filterable={false}
sortable={false}
columns={[
{
Header: <SCHeader> Default </SCHeader>,
accessor: 'selected',
filterable: false,
sortable: false,
},
{
Header: <SCHeader> Category </SCHeader>,
accessor: 'category',
filterable: false,
sortable: true,
},
{
Header: <SCHeader> High </SCHeader>,
accessor: 'high',
filterable: true,
sortable: true,
},
{
Header: <SCHeader> Low </SCHeader>,
accessor: 'low',
filterable: false,
},
{
Header: <SCHeader> Delete </SCHeader>,
accessor: 'delete',
filterable: false,
sortable: false,
},
]}
showPaginationTop={false}
showPaginationBottom={false}
className="-highlight"
/>
</CardSection>
</GridItem>
</div>
<div style={{ textAlign: 'right' }}>
<div>
<Button
id="credit-score-ranges-discard"
color="danger"
simple
onClick={discardChangesWarning}
>
Discard Changes
</Button>
<Button
id="credit-score-ranges-save"
color="success"
onClick={saveClicked}
>
Save
</Button>
<Snackbar
place="bc"
color="danger"
message="Please fix form errors before submitting."
open={bc}
closeNotification={() => setBC(false)}
close
          [>
</div>
</div>
</div>
  ];
};

const intRegex = /^[\d]{3}$/;

function EditableValue(props: any): JSX.Element {
return (
<BasicInput
id={props.id}
type={props.type}
placeholder={props.placeholder}
error={props.isErred}
label={props.label}
data-testid={props.testId}
value={props.value}
disabled={props.disabled}
maxLength={props.maxLength}
//       onChange={(event: any) => {
//         if (!event.target.value) {
//           props.setError(true);
                 f else
//           props.setError(!intRegex.test(event.target.value));
      [[ }
      [[
//         props.onChange;
      [[ }}
onChange={props.onChange}
    [>
  ];
}

export default CreditScoreRanges;

```
<!-- CODESCAN_FILE_END -->

---

### 275. `C:\DevCode\AstroUI\src\components\CreditScoreRanges\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CreditScoreRanges\types.ts" -->
```typescript
import { IRow } from 'commonui';

export interface CreditScoreData {
tenantId?: string | null;
defaultCategory: string | null;
[propName: string]: string | null | undefined;
}

export interface ICreditRow extends IRow {
id: string;
category: string;
high: string;
low: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 276. `C:\DevCode\AstroUI\src\components\CustomButtons\Button.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomButtons\Button.tsx" type=".tsx" size="1606" lines="71" chars="1606" -->
```typescript
import React from 'react';
import classNames from 'classnames';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';

import styles from 'assets/jss/material-dashboard-pro-react/components/buttonStyle';
import ButtonColor from './ButtonColor';

const useStyles = makeStyles(styles);

interface Props {
color?: ButtonColor;
round?: boolean;
children?: React.ReactChild | React.ReactChild[];
fullWidth?: boolean;
disabled?: boolean;
simple?: boolean;
size?: 'sm' | 'lg';
block?: boolean;
link?: boolean;
justIcon?: boolean;
className?: string;
muiClasses?: any;
// All other props
[x: string]: any;
}

const RegularButton: React.FunctionComponent<Props> = (props) => {
const classes = useStyles();

  const {
color,
round,
children,
fullWidth,
disabled,
simple,
size,
block,
link,
justIcon,
className,
muiClasses,
...rest
} = props;

  const btnClasses = classNames({
[classes.button]: true,
[size ? classes[size] : classes['size']]: size,
[color ? classes[color] : classes['color']]: color,
[classes.round]: round,
[classes.fullWidth]: fullWidth,
[classes.disabled]: disabled,
[classes.simple]: simple,
[classes.block]: block,
[classes.link]: link,
[classes.justIcon]: justIcon,
[className ? className : 'className']: className,
  }};

  return (
<Button classes={muiClasses} className={btnClasses} {...rest}>
{children}
</Button>
  ];
};

RegularButton.displayName = 'RegularButton';

export default RegularButton;

```
<!-- CODESCAN_FILE_END -->

---

### 277. `C:\DevCode\AstroUI\src\components\CustomButtons\ButtonColor.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomButtons\ButtonColor.ts" type=".ts" size="311" lines="23" chars="311" -->
```typescript
type ButtonColor =
| 'primary'
| 'info'
| 'success'
| 'warning'
| 'danger'
| 'rose'
| 'white'
| 'twitter'
| 'facebook'
| 'google'
| 'linkedin'
| 'pinterest'
| 'youtube'
| 'tumblr'
| 'github'
| 'behance'
| 'dribbble'
| 'reddit'
| 'transparent';

export default ButtonColor;

```
<!-- CODESCAN_FILE_END -->

---

### 278. `C:\DevCode\AstroUI\src\components\CustomDropdown\CustomDropdown.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomDropdown\CustomDropdown.jsx" type=".jsx" size="5781" lines="216" chars="5781" -->
```javascript
import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
// nodejs library to set properties for components
import PropTypes from 'prop-types';

// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import MenuItem from '@material-ui/core/MenuItem';
import MenuList from '@material-ui/core/MenuList';
import ClickAwayListener from '@material-ui/core/ClickAwayListener';
import Paper from '@material-ui/core/Paper';
import Grow from '@material-ui/core/Grow';
import Divider from '@material-ui/core/Divider';
import Popper from '@material-ui/core/Popper';
// core components
import Button from 'components/CustomButtons/Button';

import styles from 'assets/jss/material-dashboard-pro-react/components/customDropdownStyle.js';

const useStyles = makeStyles(styles);

export default function CustomDropdown(props) {
const [anchorEl, setAnchorEl] = React.useState(null);
const classes = useStyles();
const handleClick = (event) => {
if (anchorEl && anchorEl.contains(event.target)) {
setAnchorEl(null);
} else {
setAnchorEl(event.currentTarget);
}
};
const handleClose = (event) => {
if (anchorEl.contains(event.target)) {
return;
}
setAnchorEl(null);
};
const handleCloseMenu = (param) => {
setAnchorEl(null);
if (props && props.onClick) {
props.onClick(param);
}
};
const {
buttonText,
buttonIcon,
dropdownList,
buttonProps,
dropup,
dropdownHeader,
caret,
hoverColor,
dropPlacement,
rtlActive,
noLiPadding,
innerDropDown,
navDropdown,
} = props;
const caretClasses = classNames({
[classes.caret]: true,
[classes.caretDropup]: dropup && !anchorEl,
[classes.caretActive]: Boolean(anchorEl) && !dropup,
[classes.caretRTL]: rtlActive,
  }};
const dropdownItem = classNames({
[classes.dropdownItem]: true,
[classes[hoverColor + 'Hover']]: true,
[classes.noLiPadding]: noLiPadding,
[classes.dropdownItemRTL]: rtlActive,
  }};
const dropDownMenu = (
<MenuList role="menu" className={classes.menuList}>
{dropdownHeader !== undefined ? (
<MenuItem
onClick={() => handleCloseMenu(dropdownHeader)}
className={classes.dropdownHeader}
>
{dropdownHeader}
</MenuItem>
) : null}
{dropdownList.map((prop, key) => {
if (prop.divider) {
return (
<Divider
key={key}
onClick={() => handleCloseMenu('divider')}
className={classes.dropdownDividerItem}
/>
          };
} else if (
prop.props !== undefined &&
prop.props['data-ref'] === 'multi'
        } {
return (
<MenuItem
key={key}
className={dropdownItem}
style={{ overflow: 'visible', padding: 0 }}
>
              (prop)
</MenuItem>
          };
}
return (
<MenuItem
key={key}
onClick={() => handleCloseMenu(prop)}
className={dropdownItem}
>
            (prop)
</MenuItem>
        };
      }]}
</MenuList>
  ];
return (
<div className={innerDropDown ? classes.innerManager : classes.manager}>
<div className={buttonText !== undefined ? '' : classes.target}>
<Button
aria-label="Notifications"
aria-owns={anchorEl ? 'menu-list' : null}
aria-haspopup="true"
{...buttonProps}
onClick={handleClick}
>
{buttonIcon !== undefined ? (
<props.buttonIcon className={classes.buttonIcon} />
           ):nully
{buttonText !== undefined ? buttonText : null}
{caret ? <b className={caretClasses} /> : null}
</Button>
</div>
<Popper
open={Boolean(anchorEl)}
anchorEl={anchorEl}
transition
disablePortal
placement={dropPlacement}
className={classNames({
[classes.popperClose]: !anchorEl,
[classes.popperResponsive]: true,
[classes.popperNav]: Boolean(anchorEl) && navDropdown,
        }]}
>
{() => (
<Grow
in={Boolean(anchorEl)}
id="menu-list"
style={
dropup
? { transformOrigin: '0 100% 0' }
: { transformOrigin: '0 0 0' }
}
>
<Paper className={classes.dropdown}>
{innerDropDown ? (
dropDownMenu
               } ; {
<ClickAwayListener onClickAway={handleClose}>
{dropDownMenu}
</ClickAwayListener>
              }}
</Paper>
</Grow>
        }}
</Popper>
</div>
  ];
}

CustomDropdown.defaultProps = {
caret: true,
dropup: false,
hoverColor: 'primary',
};

CustomDropdown.propTypes = {
hoverColor: PropTypes.oneOf([
'dark',
'primary',
'info',
'success',
'warning',
'danger',
'rose',
  ]},
buttonText: PropTypes.node,
buttonIcon: PropTypes.object,
dropdownList: PropTypes.array,
buttonProps: PropTypes.object,
dropup: PropTypes.bool,
dropdownHeader: PropTypes.node,
rtlActive: PropTypes.bool,
caret: PropTypes.bool,
dropPlacement: PropTypes.oneOf([
'bottom',
'top',
'right',
'left',
'bottom-start',
'bottom-end',
'top-start',
'top-end',
'right-start',
'right-end',
'left-start',
'left-end',
  ]},
noLiPadding: PropTypes.bool,
innerDropDown: PropTypes.bool,
navDropdown: PropTypes.bool,
// This is a function that returns the clicked menu item
onClick: PropTypes.func,
};

```
<!-- CODESCAN_FILE_END -->

---

### 279. `C:\DevCode\AstroUI\src\components\CustomFormLabel\__test__\CustomFormLabel.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomFormLabel\__test__\CustomFormLabel.test.jsx" type=".jsx" size="275" lines="10" chars="275" -->
```javascript
import { render } from '@testing-library/react';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel';

test('Renders', () => {
const customFormLabel = render(<CustomFormLabel label="Test" />);

  expect(customFormLabel.findByLabelText('Test'));
}};

```
<!-- CODESCAN_FILE_END -->

---

### 280. `C:\DevCode\AstroUI\src\components\CustomFormLabel\CustomFormLabel.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomFormLabel\CustomFormLabel.tsx" type=".tsx" size="2551" lines="118" chars="2551" -->
```typescript
import { FormLabel } from '@material-ui/core';
import { FormLabelBaseProps } from '@material-ui/core/FormLabel';
import { InfoIcon, Markdown } from 'commonui';
import SettingsInfoIcon from 'components/SettingsInfoIcon/SettingsInfoIcon';
import React from 'react';
import styled from 'styled-components';

interface Props extends FormLabelBaseProps {
error?: boolean;
disabled?: boolean;
filled?: boolean;
focused?: boolean;
required?: boolean;
label: string;
styleType?: any;
helpText?: string;
}

const CustomFormLabel: React.FunctionComponent<Props> = (props) => {
const { label, helpText, styleType, ...rest } = props;

  let style = {};
switch (styleType) {
case 'dropDownFactory':
case 'radioButtonFactory':
    case 'checkistFactory': {
style = {
paddingTop: '0px',
paddingBottom: '28px',
fontWeight: 'bold',
};
break;
}
case 'ruleSetAttributes':
case 'statusMappings': {
style = {
paddingTop: '0px',
paddingBottom: '0px',
fontWeight: 'bold',
};
break;
}
case 'physicalAddress':
case 'mailingAddress':
case 'eligibility':
case 'addressCard':
case 'createTenant':
case 'viewTenant':
case 'viewMerchant':
case 'createMerchant': {
style = {
fontWeight: 'bold',
};
break;
}

    case 'loanAppFormsList': {
style = {
paddingTop: '8px',
fontWeight: 'bold',
};
break;
}
case 'tenantBranding': {
style = {
paddingTop: '14px',
fontWeight: 'bold',
};
break;
}
case 'tenantBrandingLogo': {
style = {
paddingTop: '25px',
fontWeight: 'bold',
};
break;
}
case 'viewTenantOperationalStatus':
case 'viewMerchantStatus':
case 'ratesTerm': {
style = {
paddingTop: '16px',
paddingBottom: '0px',
fontWeight: 'bold',
};
break;
}
case 'viewSetting': {
style = {
paddingTop: '6px',
float: 'right',
textAlign: 'right',
fontWeight: 'bold',
};
break;
}
case 'textFieldFactory':
case 'rates':
default: {
style = {
paddingTop: '6px',
paddingBottom: '0px',
fontWeight: 'bold',
};
break;
}
}

  return (
<FormLabel {...(rest as any)} style={style}>
<SettingsInfoIcon label={label} helpText={helpText} />
{label}
</FormLabel>
  ];
};

export default CustomFormLabel;

```
<!-- CODESCAN_FILE_END -->

---

### 281. `C:\DevCode\AstroUI\src\components\CustomInput\__test__\CustomInput.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomInput\__test__\CustomInput.test.jsx" type=".jsx" size="579" lines="27" chars="579" -->
```javascript
import React from 'react';
import CustomInput from '../CustomInput';
import { render } from '@testing-library/react';

test('Renders', async () => {
const props = {
id: 'custom-input',
error: true,
formControlProps: {
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
},
inputProps: {
disabled: false,
value: '',
type: 'text',
onChange: () => {},
},
helperText: 'Invalid date',
};
const customInput = render(<CustomInput {...props} />);

  await customInput.findByRole('custom-input');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 282. `C:\DevCode\AstroUI\src\components\CustomInput\CustomInput.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomInput\CustomInput.tsx" type=".tsx" size="3451" lines="121" chars="3451" -->
```typescript
import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import FormControl, { FormControlProps } from '@material-ui/core/FormControl';
import InputLabel, { InputLabelProps } from '@material-ui/core/InputLabel';
import FormHelperText from '@material-ui/core/FormHelperText';
import Input, { InputProps } from '@material-ui/core/Input';
import { stringValueToInteger } from './utils';

import styles from 'assets/jss/material-dashboard-pro-react/components/customInputStyle.js';

const useStyles = makeStyles(styles as any);

interface CustomInputProps {
labelText?: React.ReactNode;
labelProps?: InputLabelProps;
id?: string;
inputProps?: InputProps;
formControlProps?: FormControlProps;
inputRootCustomClasses?: string;
error?: boolean;
success?: boolean;
white?: boolean;
integerField?: boolean;
helperText?: React.ReactNode;
}

export default function CustomInput(props: CustomInputProps) {
const classes = useStyles();
const {
formControlProps,
labelText,
id,
labelProps,
inputProps,
error,
white,
inputRootCustomClasses = '',
success,
integerField,
helperText,
} = props;

  const labelClasses = classNames({
         + classes.labelRootErrorl: error,
[' ' + classes.labelRootSuccess]: success && !error,
  }};
const underlineClasses = classNames({
[classes.underlineError]: error,
[classes.underlineSuccess]: success && !error,
[classes.underline]: true,
[classes.whiteUnderline]: white,
  }};
const marginTop = classNames({
[inputRootCustomClasses]: inputRootCustomClasses !== undefined,
  }};
const inputClasses = classNames({
[classes.input]: true,
[classes.whiteInput]: white,
  }};
let formControlClasses;
if (formControlProps !== undefined) {
formControlClasses = classNames(
formControlProps.className,
classes.formControl,
    ];
} else {
formControlClasses = classes.formControl;
}
if (inputProps && inputProps.value === null) inputProps.value = '';
const helpTextClasses = classNames({
[classes.labelRootError]: error,
[classes.labelRootSuccess]: success && !error,
  }};
// console.log('Helper text =======> ' + id + '' + helperText);
return (
<FormControl
{...formControlProps}
className={`${formControlClasses} form-control-custom`}
role={'custom-input'}
>
{labelText !== undefined ? (
<InputLabel
className={classes.labelRoot + ' ' + labelClasses}
htmlFor={id}
{...labelProps}
>
{labelText}
</InputLabel>
      ):nully
<Input
classes={{
input: inputClasses,
root: marginTop,
disabled: classes.disabled,
underline: underlineClasses,
}}
id={id}
{...inputProps}
type={integerField ? 'number' : undefined}
value={
integerField
? `${stringValueToInteger(inputProps?.value as string)}`
: inputProps?.value
}
      [>
{helperText !== undefined ? (
<FormHelperText
role={`${id}-text`}
id={id + '-text'}
className={`${helpTextClasses} form-control-helper-text-custom`}
>
{helperText}
</FormHelperText>
      ):nully
</FormControl>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 283. `C:\DevCode\AstroUI\src\components\CustomInput\utils.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\CustomInput\utils.ts" type=".ts" size="435" lines="12" chars="435" -->
```typescript
[>>
* stringValueToInteger
* @summary
* Convert an input's string value into an integer.
* Used to format data for the CustomInput if integerField = true
* (this happens for case field type = integer in CustomSectionEditField and PrebuiltCustomSectionEditField)
>[
export const stringValueToInteger = (stringVal: string): number => {
const intValue = parseInt(stringVal || '0', 10);
return isNaN(intValue) ? 0 : intValue;
};

```
<!-- CODESCAN_FILE_END -->

---

### 284. `C:\DevCode\AstroUI\src\components\Decisioning\api\api.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\api\api.ts" type=".ts" size="5628" lines="265" chars="5628" -->
```typescript
import { client2, HttpMethod } from 'utils/api-client';
import * as API from './types';

const BASE_URL =
process.env.REACT_APP_DECISIONING_API_BASE_URL ??
'REACT_APP_DECISIONING_API_BASE_URL HAS NOT BEEN SET';

const getRuleSetTemplateEP = (templateType: string): string =>
`${BASE_URL}rule-set-templates/${templateType}`;

const addRuleEP = `${BASE_URL}rule`;
const updateRuleEP = (ruleId: string): string => `${BASE_URL}rule/${ruleId}`;
const deleteRuleEP = (ruleId: string): string => `${BASE_URL}rule/${ruleId}`;

const getRuleSetsEP = `${BASE_URL}rule-sets`;
const getRuleSetEP = (ruleSetId: string): string =>
`${BASE_URL}rule-set/${ruleSetId}`;
const deleteRuleSetEP = (ruleSetId: string): string =>
`${BASE_URL}rule-set/${ruleSetId}`;
const postRuleSetEP = `${BASE_URL}rule-set`;

const putRuleSetAttribute = (ruleSetId: string, attributeId: string): string =>
`${BASE_URL}rule-set/${ruleSetId}/attributes/${attributeId}`;

interface ApiResponse<T> {
payload: T;
result: {
code: number;
message: string;
apiVer: string;
correlationId: string;
errors: any[];
};
}

interface CallResponse<T> {
error: boolean;
errorMessage: string;
payload: T;
}

interface ICallEP {
endpoint: string;
method: string;
config: { headers: any };
defaultPayload: [] | Record<string, never>;
}

const callEndpoint = async <T>({
endpoint,
method,
config,
defaultPayload,
}: ICallEP): Promise<CallResponse<T>> => {
try {
const response = (await client2(
endpoint,
method,
config,
)) as ApiResponse<T>;

    if (response.result.code !== 0) {
Promise.resolve({
error: true,
errorMessage: response.result.message || '',
payload: defaultPayload as T,
      }];
}

    return Promise.resolve({
error: false,
errorMessage: '',
payload: response.payload,
    }};
} catch (e) {
if (e instanceof Error) {
return Promise.resolve({
error: true,
errorMessage: e.message,
payload: defaultPayload as T,
      }];
}

    return Promise.resolve({
error: true,
errorMessage: JSON.stringify(e),
payload: defaultPayload as T,
    }};
}
};

export const fetchRuleSetTemplate = async (
tenantId: string,
type: string,
): Promise<CallResponse<API.RuleSetTemplate>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: getRuleSetTemplateEP(type),
method: HttpMethod.GET,
config,
defaultPayload: {},
  }};
};

export const addRule = async (
tenantId: string,
body: API.ApiAddRule,
): Promise<CallResponse<any>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
body,
};

  return callEndpoint({
endpoint: addRuleEP,
method: HttpMethod.POST,
config,
defaultPayload: {},
  }};
};

export const updateRule = async (
tenantId: string,
ruleId: string,
body: API.ApiUpdateRule,
): Promise<CallResponse<any>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
body,
};

  return callEndpoint({
endpoint: updateRuleEP(ruleId),
method: HttpMethod.PUT,
config,
defaultPayload: {},
  }};
};

export const deleteRule = async (
tenantId: string,
ruleId: string,
): Promise<CallResponse<any>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: deleteRuleEP(ruleId),
method: HttpMethod.DELETE,
config,
defaultPayload: {},
  }};
};

export const fetchRuleSet = async (
tenantId: string,
ruleSetId: string,
): Promise<CallResponse<API.ApiGetRuleSetResult>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: getRuleSetEP(ruleSetId),
method: HttpMethod.GET,
config,
defaultPayload: {},
  }};
};

export const fetchRuleSets = async (
tenantId: string,
coreProductId?: string,
): Promise<CallResponse<API.RuleSetData[]>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
};
const corePI = coreProductId ? `CORE_PRODUCT_ID=${coreProductId}` : undefined;
const tenantPI = `TENANT_ID=${tenantId}`;
const endpoint = corePI
? `${getRuleSetsEP}?${corePI}&${tenantPI}` // Only CoreProduct given
: `${getRuleSetsEP}?$${tenantPI}`; // CoreProduct not given

  return callEndpoint({
endpoint,
method: HttpMethod.GET,
config,
defaultPayload: [],
  }};
};

export const createRuleSet = async (
tenantId: string,
body: API.ApiAddRuleSet,
): Promise<CallResponse<API.ApiGetRuleSetResult>> => {
const config = {
body,
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: postRuleSetEP,
method: HttpMethod.POST,
config,
defaultPayload: {},
  }};
};

export const deleteRuleSet = async (
tenantId: string,
ruleSetId: string,
): Promise<CallResponse<any>> => {
const config = {
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: deleteRuleSetEP(ruleSetId),
method: HttpMethod.DELETE,
config,
defaultPayload: {},
  }};
};

export const updateRuleSetAttribute = async (
tenantId: string,
ruleSetId: string,
attributeId: string,
body: API.ApiUpdateRuleSetAttribute,
): Promise<CallResponse<any>> => {
const config = {
body,
headers: {
'X-TENANT-ID': tenantId,
},
};

  return callEndpoint({
endpoint: putRuleSetAttribute(ruleSetId, attributeId),
method: HttpMethod.PUT,
config,
defaultPayload: {},
  }};
};

```
<!-- CODESCAN_FILE_END -->

---

### 285. `C:\DevCode\AstroUI\src\components\Decisioning\api\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\api\index.ts" type=".ts" size="23" lines="2" chars="23" -->
```typescript
export * from './api';

```
<!-- CODESCAN_FILE_END -->

---
---
### 286. `C:\DevCode\AstroUI\src\components\Decisioning\api\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\api\types.ts" type=".ts" size="1735" lines="90" chars="1735" -->
```typescript
import { Core } from 'commonui';

type RuleStructure = Core.RuleStructure;

export type ApiGetRuleResult = {
ruleId: string;
version: number;
type: string;
name: string;
ruleStructure: RuleStructure;
createDate: string;
createdBy: string;
};

export interface ApiAddRule {
ruleName: string;
ruleType: string;
ruleSetId: string;
ruleStructure: RuleStructure;
}

export interface ApiUpdateRule {
ruleName?: string;
ruleStructure: RuleStructure;
}

export type RuleSetType = string;
export interface RuleSetTemplate {
version: number;
type: RuleSetType;
name: string;
rules: RuleStructure[];
attributes: string[];
}
export interface RuleData {
ruleId: string;
ruleStructure: RuleStructure;
}
}
export interface RuleSetData {
name: string;
ruleSetId: string;
ruleSetType: RuleSetType;
createDate: string;
createdBy: string;
}

export interface RuleSetAttribute {
ruleSetAttributeId: string;
ruleSetId: string;
ruleSetAttributeType: string;
ruleSetAttributeValue: string;
}

export interface ApiGetRuleSetResult {
ruleSet: RuleSetData;
rules: RuleData[];
attributes: RuleSetAttribute[];
}

export interface ApiAddRuleSet {
ruleSetId: string;
name: string;
ruleSetType: RuleSetType;
rules: {
ruleId: string;
ruleStructure: RuleStructure;
}[];
ruleSetAttributes: {
ruleSetAttributeType: string;
ruleSetAttributeValue: string;
}[];
}

export interface Association {
id: string;
idType: string;
}

export interface RuleSetTemplateData {
name: string;
type: string;
}
export type GetRuleSetTemplatesResult = RuleSetTemplateData[];

export interface ApiUpdateRuleSetAttribute {
ruleSetAttributeType: string;
ruleSetAttributeValue: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 287. `C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\index.ts" type=".ts" size="43" lines="2" chars="43" -->
```typescript
export { NewRuleSet } from './NewRuleSet';

```
<!-- CODESCAN_FILE_END -->

---

### 288. `C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\NewRuleSet.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\NewRuleSet.tsx" type=".tsx" size="2830" lines="103" chars="2830" -->
```typescript
import React, { useState } from 'react';
import { StaticNotification } from 'commonui';
import { Button } from 'commonui';
import { useNewRuleSet } from './useNewRuleSet';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { VIEW_MODES } from '../constants';
import { RuleSetAttributes } from '../RuleSetAttributes';
import {
SCAddButtonWrapper,
SCButtonWrapper,
SCSectionWrapper,
} from './styles';
import { INewRuleSetProps } from './types';

export const NewRuleSet = ({
tenantId,
productId,
refreshRuleSets,
}: INewRuleSetProps): JSX.Element => {
const {
getActiveRuleSetAttributes,
attributeController,
saveRuleSet,
error: apiError,
isLoading: multiRulePageIsLoading,
globalRulesInError,
} = useNewRuleSet({
isNew: true,
tenantId,
productId,
  }};
const [showForm, setShowForm] = useState(false);
const [isSavingAll, setIsSavingAll] = useState(false);
const isLoading = multiRulePageIsLoading || !tenantId;

  if (isLoading || apiError) {
return (
<FullPageStatus
errorResponse={apiError !== undefined ? new Error(apiError) : undefined}
      [>
    ];
}

  return (
    >>
{!showForm ? (
<SCAddButtonWrapper>
<Button
buttonStyle="Transparent"
onClick={() => {
setShowForm(true);
}}
>
Add New Ruleset
</Button>
</SCAddButtonWrapper>
) : (
        >>
{globalRulesInError && (
<StaticNotification message={'Please fix errors before saving'} />
          }}
<SCSectionWrapper>
<h2>Create Rule Set</h2>
<RuleSetAttributes
attributes={getActiveRuleSetAttributes()}
tenantId={tenantId}
ruleSetId={''}
viewMode={VIEW_MODES.TEMPLATE}
onSaveOverride={() => {
setShowForm(false);
}}
controllerOverride={attributeController}
refreshRuleSets={() => {}}
/>
<SCButtonWrapper>
<Button
onClick={async () => {
setIsSavingAll(true);
await saveRuleSet(getActiveRuleSetAttributes());
refreshRuleSets();
setIsSavingAll(false);
setShowForm(false);
}}
>
{isSavingAll ? 'Saving...' : 'Save'}
</Button>
</SCButtonWrapper>
<SCButtonWrapper>
<Button
onClick={() => {
setShowForm(false);
}}
>
Cancel
</Button>
</SCButtonWrapper>
</SCSectionWrapper>
        >[>
      ]}
</>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 289. `C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\styles.ts" type=".ts" size="522" lines="30" chars="522" -->
```typescript
import styled from 'styled-components';

export const SCAddButtonWrapper = styled.div`
margin: 5px 15px 15px 0px;
button {
width: 250px;
height: 80px;
font-size: 24px;
}

  button:hover {
transform: scale(1.1);
}
`;

export const SCButtonWrapper = styled.div`
display: inline-block;
margin: 5px 15px 0px 0px;
button {
min-width: 100px;
}
`;

export const SCSectionWrapper = styled.div`
border-bottom: 1px solid black;
border-radius: 10px;
padding: 10px;
margin-bottom: 10px;
`;

```
<!-- CODESCAN_FILE_END -->

---

### 290. `C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\types.ts" type=".ts" size="1127" lines="49" chars="1127" -->
```typescript
import { Core } from 'commonui';
import { RuleSetAttribute } from '../api/types';
import { AttributeController } from '../RuleSetAttributes/types';

export interface INewRuleSetProps {
tenantId: string;
productId: string;
refreshRuleSets: () => void;
}

type RuleStructure = Core.RuleStructure;
type RuleMode = Core.RuleMode;

export interface RuleSetData {
ruleSetId?: string;
name: string;
type: string;
attributes?: string[];
}

export interface IInternalRuleMetadata {
title: string;
mode: RuleMode;
isSaving: boolean;
isRemoving: boolean;
isNew?: boolean;
inError?: boolean;
id?: string;
copy?: RuleStructure;
}

export interface UseNewRuleSetParams {
isNew: boolean;
ruleSetId: string;
ruleSetType: string;
tenantId: string;
productId: string;
}

export interface IUseNewRuleSet {
error?: string;
saveRuleSet: (attributes?: RuleSetAttribute[]) => Promise<void>;
isLoading: boolean;
globalRulesInError: boolean;
ruleSetAttributes: RuleSetAttribute[];
getActiveRuleSetAttributes: () => RuleSetAttribute[];
attributeController: (index: number) => AttributeController;
}

```
<!-- CODESCAN_FILE_END -->

---

### 291. `C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\useNewRuleSet.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\NewRuleSet\useNewRuleSet.tsx" type=".tsx" size="4354" lines="159" chars="4354" -->
```typescript
import { useEffect, useState } from 'react';
import * as API from '../api';
import { RuleSetAttribute } from '../api/types';
import { useMultipleRules } from 'commonui';
import { v4 as uuid } from 'uuid';
import { useObjectArray } from '../useObjectArray';
import { checkNodeForErrors } from '../utils';
import { useRuleSetUrls } from '../useRuleSetUrls';
import {
useRuleSetAttributes,
buildNewRuleSetAttributes,
} from '../RuleSetAttributes';
import { ATTRIBUTE_TYPES } from '../constants';
import {
IInternalRuleMetadata,
IUseNewRuleSet,
RuleSetData,
UseNewRuleSetParams,
} from './types';

export const useNewRuleSet = ({
ruleSetId = '',
ruleSetType = 'blank-ruleset',
tenantId = '',
productId,
}: Partial<UseNewRuleSetParams>): IUseNewRuleSet => {
const { mapUpdates: mapRuleDataUpdates, update: updateRuleState } =
useObjectArray<IInternalRuleMetadata>();
const { rules } = useMultipleRules();
const {
ruleSetAttributes,
getActiveRuleSetAttributes,
setAttributes,
attributeController,
} = useRuleSetAttributes({
initialAttributes: [],
ruleSetId,
tenantId,
  }};
const [ruleSetTemplate, setRuleSetTemplate] = useState<RuleSetData>();
const [error, setError] = useState<string | undefined>();
const [isLoading, setIsLoading] = useState(true);
const [globalRulesInError, setGlobalRulesInError] = useState(false);
const { goToRuleSetList } = useRuleSetUrls({ tenantId, productId });

  useEffect(() => {
if (!tenantId) {
return;
}

    const loadRuleSet = async (): Promise<void> => {
if (!tenantId) {
return;
}
const response = await API.fetchRuleSet(tenantId, ruleSetId as string);
if (response.error) {
setError(response.errorMessage);
setIsLoading(false);
return;
}
const { ruleSet, attributes } = response.payload;
setRuleSetTemplate({
name: ruleSet.name,
type: ruleSet.ruleSetType,
ruleSetId: ruleSet.ruleSetId,
      }];
setAttributes(attributes);
setIsLoading(false);
};

    const loadRuleSetTemplate = async (): Promise<void> => {
const response = await API.fetchRuleSetTemplate(
tenantId,
ruleSetType as string,
      ];
if (response.error) {
setError(response.errorMessage);
setIsLoading(false);
return;
}

      setRuleSetTemplate(response.payload);
setIsLoading(false);
const attr = buildNewRuleSetAttributes(response.payload.attributes, {
productId,
tenantId,
      }];
setAttributes(attr);
};

    if (ruleSetId) {
loadRuleSet();
} else if (ruleSetType) {
loadRuleSetTemplate();
}
}, [tenantId]);

  const saveRuleSet = async (
attributes?: RuleSetAttribute[],
): Promise<void> => {
const localRuleSetAttributes = attributes ?? ruleSetAttributes;
const ruleSetType = localRuleSetAttributes.find(
(att) => att.ruleSetAttributeType === ATTRIBUTE_TYPES.RULE_TYPE,
)?.ruleSetAttributeValue;

    if (!ruleSetTemplate) {
throw new Error('Can only save all if working with a rule set!');
}
if (!ruleSetType) {
throw new Error('Ruleset type must be set before saving');
}
if (!tenantId) {
throw new Error('Need tenantId set to save all!');
}

    let rulesInError = false;
rules.forEach((rule, index) => {
if (checkNodeForErrors(rule.node)) {
rulesInError = true;
updateRuleState(index, { inError: true });
}
    }};

    setGlobalRulesInError(rulesInError);
if (rulesInError) return;

    const { name } = ruleSetTemplate;
const ruleIds = rules.map(() => uuid());
const ruleSetId = uuid();
await API.createRuleSet(tenantId, {
ruleSetId,
ruleSetType,
name,
rules: rules.map((rule, i) => ({
ruleId: ruleIds[i],
ruleStructure: rule,
      }]},
ruleSetAttributes: localRuleSetAttributes,
}).then((resp) => {
if (resp.error) {
setError(resp.errorMessage);
return;
}
mapRuleDataUpdates((_, i) => ({ mode: 'view', id: ruleIds[i] }));
goToRuleSetList();
    }};
};

  return {
error,
saveRuleSet,
isLoading,
globalRulesInError,
ruleSetAttributes,
getActiveRuleSetAttributes,
attributeController,
  };
};

```
CODESCAN_FILE_END

---

292. 'C:\DevCode\AstroUI\src\components\Decisioning\RuleList\constants.ts'

<!-- CODESCAN_FILE_START path="C: \DevCode\AstroUI\src\components\Decisioning\RuleList\constants.ts" type=".ts" size="1054" 1ines="74" chars="1054" -->
   'typescript
import { IRuleoperatorData } from 'commonui';

export const strOperators: IRuleOperatorData[] = [
{
label: 'Equals',
operator: 'equal',
},
{
label: "Doesn't Equal",
operator: 'notEqual',
},
];

export const arrOperators: IRuleOperatorData[] = [
{
label: 'In',
operator: 'in',
},
{
label: 'Not in',
operator: 'notIn',
},
];

export const numOperators: IRuleOperatorData[] = [
{
label: 'Equals',
operator: 'equal',
},
{
label: "Doesn't Equal",
operator: 'notEqual',
},
{
label: '>',
operator: 'greaterThan',
},
{
label: '>=',
operator: 'greaterThanInclusive',
},
{
label: '<',
operator: 'lessThan',
},
{
label: '<=',
operator: 'lessThanInclusive',
},
];

export const selectFactOptions = [
{
label: 'Pass',
value: 'PASS',
},
{
label: 'Fail',
value: 'FAIL',
},
{
label: 'Unknown',
value: 'UNKNOWN',
},
{
label: 'True',
value: 'true',
},
{
label: 'False',
value: 'false',
},
];

```
<!-- CODESCAN_FILE_END -->

---

### 293. `C:\DevCode\AstroUI\src\components\Decisioning\RuleList\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleList\index.ts" type=".ts" size="70" lines="3" chars="70" -->
```typescript
export { RuleList } from './RuleList';
export * from './useRuleList';

```
<!-- CODESCAN_FILE_END -->

---

### 294. `C:\DevCode\AstroUI\src\components\Decisioning\RuleList\RuleList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleList\RuleList.tsx" type=".tsx" size="2176" lines="78" chars="2176" -->
```typescript
import { ErrorMessage, Button, Rule } from 'commonui';
import React from 'react';
import {
SCAddRuleAction,
SCRuleActionsButtonContainer,
SCRuleBtn,
} from '../styles';
import { RuleMetadata } from '../types';
import { ruleSetErrorMsg } from '../utils';
import { IRuleList } from './types';
import { useRuleList } from './useRuleList';

export const RuleList = ({ ruleSetId, tenantId }: IRuleList): JSX.Element => {
const {
ruleStates,
isLoading,
isNewRuleMode,
newRule,
editRule,
saveRule,
cancelRule,
removeRule,
ruleController,
} = useRuleList({ ruleSetId, tenantId });

  const isAnotherRuleEditing = Boolean(
ruleStates.find((i) => i.mode === 'edit'),
  ];

  const mapRuleState = (
{ title, isSaving, isRemoving, mode, inError = false }: RuleMetadata,
i: number,
): JSX.Element => {
const isEditMode = mode === 'edit';
const canSwitchToEditMode = !isEditMode && !isAnotherRuleEditing;

    return (
<React.Fragment key={`rule-${title}-${i}`}>
{<Rule {...ruleController(i)} mode={mode} />}
{inError && <ErrorMessage error={ruleSetErrorMsg(title)} showIcon />}
{canSwitchToEditMode && (
          >>
<SCRuleBtn onClick={() => editRule(i)}>Edit</SCRuleBtn>
<SCRuleBtn onClick={() => removeRule(i)}>
{isRemoving ? 'Removing...' : 'Remove Rule'}
</SCRuleBtn>
          >[>
        }}
{isEditMode && (
<SCRuleBtn
onClick={async () => {
await saveRule(i);
}}
>
{isSaving ? 'Saving...' : 'Save'}
</SCRuleBtn>
        }}
        {isEditMode && !isSaving &&(
          <SCRuleBtn onClick={() => cancelRule(i)}>Cancel</SCRuleBtn>
        }}
      </React.Fragment>
    ];
};

  return (
    >>
<SCRuleActionsButtonContainer>
<SCAddRuleAction isDisabled={isNewRuleMode} onClick={newRule}>
<Button buttonStyle="Transparent">
{isLoading ? 'Loading...' : 'Add New Rule'}
</Button>
</SCAddRuleAction>
</SCRuleActionsButtonContainer>
{ruleStates?.map(mapRuleState)}
</>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 295. `C:\DevCode\AstroUI\src\components\Decisioning\RuleList\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleList\types.ts" type=".ts" size="666" lines="26" chars="666" -->
```typescript
import { Core, SetConditionsHandler } from 'commonui';
import { RuleMetadata } from '../types';

export interface IRuleList {
ruleSetId: string;
tenantId: string;
}

export interface IUseRuleList {
ruleStates: RuleMetadata[];
ruleController: (index: number) => {
facts: Core.IFact[];
setConditions: SetConditionsHandler;
ruleNode: Core.RootConditionNode;
mode: Core.RuleMode;
};
newRule: () => void;
saveRule: (index: number) => Promise<void>;
removeRule: (index: number) => Promise<void>;
editRule: (index: number) => void;
isNewRuleMode: boolean;
error?: string;
cancelRule: (index: number) => void;
isLoading: boolean;
}

```
<!-- CODESCAN_FILE_END -->

---

### 296. `C:\DevCode\AstroUI\src\components\Decisioning\RuleList\useRuleList.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleList\useRuleList.ts" type=".ts" size="6795" lines="255" chars="6795" -->
```typescript
import { Core, useMultipleRules } from 'commonui';
import React, { useEffect, useState } from 'react';
import * as API from '../api';
import { useObjectArray } from '../useObjectArray';
import { sortBy } from 'lodash';
import { checkNodeForErrors } from '../utils';
import { IRuleList, IUseRuleList } from './types';
import { IInternalRuleMetadata, RuleMetadata } from '../types';
import { buildBlankRule } from './utils';
import { useAppContext } from 'context/app-context';

type RuleStructure = Core.RuleStructure;
type RuleMode = Core.RuleMode;

export type UseRuleList = ReturnType<typeof useRuleList>;

const replaceInList = function <T>(
setter: React.Dispatch<React.SetStateAction<T[]>>,
index: number,
value: T,
): void {
setter((prev) => {
const newList = [...prev];
newList.splice(index, 1, value);
return newList;
  }};
};

export const useRuleList = ({
ruleSetId,
tenantId,
}: IRuleList): IUseRuleList => {
const { coreProduct } = useAppContext();
const {
objs: ruleStateArr,
setArray: setRuleStateArr,
update: updateRuleState,
} = useObjectArray<IInternalRuleMetadata>();

  const { rules, ruleController, setRules } = useMultipleRules();

  const [error, setError] = useState<string | undefined>();
const [isLoading, setIsLoading] = useState(true);
const [isNewRuleMode, setIsNewRuleMode] = useState(false);

  const loadRuleSet = async (): Promise<void> => {
if (!tenantId) {
return;
}
const r = await API.fetchRuleSet(tenantId, ruleSetId as string);
if (r.error) {
setError(r.errorMessage);
return;
}
const { rules: incomingRules } = r.payload;
const sortedRules = sortBy(incomingRules, ['name']);
setRules(sortedRules.map((ir) => ir.ruleStructure));
setRuleStateArr(
sortedRules.map((r) => ({
title: r.ruleStructure.node.title,
id: r.ruleId,
mode: 'view',
isSaving: false,
isRemoving: false,
isNew: false,
      }]},
    ];
};

  useEffect(() => {
if (tenantId) {
setIsLoading(true);
loadRuleSet();
setIsLoading(false);
}
}, [tenantId]);

  const handleSaveRequest = (
response: { error: boolean; errorMessage: string },
index: number,
): void => {
if (response.error) {
setError(response.errorMessage);
updateRuleState(index, { r: response, loading: false });
} else {
setError(undefined);
updateRuleState(
index,
{ mode: 'view', isNew: false, loading: false },
true,
      ];
}
};

  const saveRule = async (index: number): Promise<void> => {
if (!tenantId) {
throw new Error('Need tenantId set to save rule!');
}

    if (!ruleSetId) {
throw new Error('Need ruleSetId before rule can be saved!');
}
const { id: ruleId, title: ruleName, isNew } = ruleStateArr[index];

    if (!rules[index].node.nodes.length) {
updateRuleState(index, { inError: true }, true);
console.error('Rule is empty');
return;
}
const inError = checkNodeForErrors(rules[index].node);
if (inError) {
updateRuleState(index, { inError }, true);
console.error('useRuleList:saveRule', inError);
return;
}
if (isNew) {
await API.addRule(tenantId, {
ruleName,
ruleType: '',
ruleSetId,
ruleStructure: rules[index],
      }]
.then((response: { error: boolean; errorMessage: string }) => {
handleSaveRequest(response, index);
setIsNewRuleMode(false);
        }]
.then(async () => await loadRuleSet())
.catch((e) => {
console.error('useRuleList:updateRule', e);
        }];
} else if (!ruleId) {
throw new Error(
`Attempting to save a rule that does not have an id:${JSON.stringify({
index,
ruleStateArr,
})} `,
      ];
} else {
await API.updateRule(tenantId, ruleId, {
ruleStructure: rules[index],
      }]
.then((r: any) => handleSaveRequest(r, index))
.catch((e) => {
console.error('useRuleList:updateRule', e);
        }];
}
};

  const editRule = (index: number): void => {
const currentRule = rules[index];
    const copy = JSoN.parse(JsoN.stringify(currentRule));
updateRuleState(index, { copy, mode: 'edit' });
};

const cancelRule = (index: number): void => {
    setIsNewRuleMode(false);
const ruleState = ruleStateArr[index];
    const copy = rulestate.copy ll [l
if (!ruleState.copy) {
console.error({
useRuleList: 'a copy of this rule set was not created correctly': `${JSON.stringify(
[index, ruleStateArr ]`,
        }}`,
      ];
}
    const copiedCopy = JsoN.parse(JsoN.stringify(copy));

if (ruleState.isNew) {
const newRuleStateArr = ruleStateArr.filter((r) => !r.isNew);
      const newRules = rules.filter((_r, i) => i !== index);

      setRuleStateArr(newRuleStateArr);
setRules(newRules);
return;
}

    updateRuleState(index, { mode: 'view', inError: false });
replaceInList<RuleStructure>(setRules, index, copiedCopy);
};

  const removeRule = async (index: number): Promise<void> => {
if (!tenantId) {
return;
}

    setIsLoading(true);

    const { id: ruleId = '' } = ruleStateArr[index];

    updateRuleState(index, { ...ruleStateArr[index], isRemoving: true });

    await API.deleteRule(tenantId, ruleId)
.then((resp: any) => {
if (resp.error) {
setIsLoading(false);
setError(resp.errorMessage);
return;
}
const newRuleStateArr = ruleStateArr.filter((r) => ruleId !== r.id);
const newRules = rules.filter((_r, i) => i !== index);

        setRuleStateArr(newRuleStateArr);
setRules(newRules);

        loadRuleSet();
setIsLoading(false);
      }]
.catch((e) => {
console.error('useRuleList:deleteRule', e);
setIsLoading(false);
      }];
};

  const newRule = (): void => {
if (!tenantId) {
return;
}

    if (isNewRuleMode) {
return;
}

    setIsNewRuleMode(true);
const blankRule = buildBlankRule(coreProduct?.sections ?? []);
const newRuleState = {
title: blankRule.node.title,
mode: 'edit' as RuleMode,
isSaving: false,
isRemoving: false,
isNew: true,
copy: { ...blankRule },
};

    const newRules = [blankRule, ...rules];

    const ruleStates: IInternalRuleMetadata[] = [newRuleState, ...ruleStateArr];

    setRules(newRules);
setRuleStateArr(ruleStates);
};

  return {
ruleStates: ruleStateArr as RuleMetadata[],
ruleController,
newRule,
saveRule,
removeRule,
editRule,
isNewRuleMode,
error,
cancelRule,
isLoading,
};
};

```
<!-- CODESCAN_FILE_END -->

---
---
### 297. `C:\DevCode\AstroUI\src\components\Decisioning\RuleList\utils.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleList\utils.ts" type=".ts" size="1479" lines="59" chars="1479" -->
```typescript
import { numOperators, selectFactOptions, strOperators } from './constants';
import { IFact, IRuleOperatorData, RuleStructure } from 'commonui';
import { CoreTemplateProductSections } from '../../CoreProduct/types';

const getOperators = (type: IFact['type']): IRuleOperatorData[] => {
switch (type) {
case 'number':
return numOperators;
case 'percentage':
return numOperators;
case 'select':
return strOperators;
case 'string':
return strOperators;
default:
return [];
}
};

const getFactsFromCoreProductSettings = (
sections: CoreTemplateProductSections[],
): IFact[] => {
const factCodeSettings = sections.find(
(item) => item.sectionCode === 'DECISIONING-FACT-CODES',
  ];
return (
factCodeSettings?.settings
.map((setting) => {
return {
fact: setting.settingCode,
type: setting.value,
label: setting.settingCode,
operators: getOperators(setting.value),
options: selectFactOptions,
};
      }]
.filter((fact) => fact.type.toLowerCase() !== 'disabled') ?? []
  ];
};

const buildBlankRule = (
sections: CoreTemplateProductSections[],
): RuleStructure => {
return {
version: 1,
mode: 'edit',
facts: getFactsFromCoreProductSettings(sections),
node: {
title: 'New Rule',
type: 'logicGroup',
isRuleActive: true,
logicType: 'all',
nodes: [],
},
};
};

export { buildBlankRule };

```
<!-- CODESCAN_FILE_END -->

---

### 298. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\attributeTypeUtils.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\attributeTypeUtils.ts" type=".ts" size="2156" lines="79" chars="2156" -->
```typescript
import { IOption } from 'commonui';
import { RuleSetAttribute } from '../api/types';
import {
APPLICATION_TYPE_LIST,
APPLICANT_TYPE_LIST,
ATTRIBUTE_TYPES,
APPLICANT_TYPE_OPTIONS,
APPLICATION_TYPE_OPTIONS,
RULE_TYPE_LIST,
RULE_TYPE_OPTIONS,
} from '../constants';

export const UNEDITABLE_ATTRIBUTE_TYPES: string[] = [
ATTRIBUTE_TYPES.CORE_PRODUCT_ID.valueOf(),
ATTRIBUTE_TYPES.TENANT_ID.valueOf(),
];

export const getAttributeTypeList = (
type: string,
opt: OptBuildNewRuleSetAttributesParams,
): string[] => {
switch (type) {
case ATTRIBUTE_TYPES.RULE_TYPE:
return RULE_TYPE_LIST;
case ATTRIBUTE_TYPES.APPLICANT_TYPE:
return APPLICANT_TYPE_LIST;
case ATTRIBUTE_TYPES.APPLICATION_TYPE:
return APPLICATION_TYPE_LIST;
case ATTRIBUTE_TYPES.CORE_PRODUCT_ID:
return [opt.productId ?? ''];
case ATTRIBUTE_TYPES.TENANT_ID:
return [opt.tenantId ?? ''];
default:
return [];
}
};

export const getAttributeOptions = (type: string): IOption[] => {
switch (type) {
case ATTRIBUTE_TYPES.RULE_TYPE:
return RULE_TYPE_OPTIONS;
case ATTRIBUTE_TYPES.APPLICANT_TYPE:
return APPLICANT_TYPE_OPTIONS;
case ATTRIBUTE_TYPES.APPLICATION_TYPE:
return APPLICATION_TYPE_OPTIONS;
default:
return [];
}
};

export const convertAttributeTypeToLabel = (type: string): string => {
const split = type.split('_');
const capitalized = split.map((word) => {
return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }};

  return capitalized.join(' ').replace(' Id', '');
};

export interface OptBuildNewRuleSetAttributesParams {
tenantId?: string;
productId?: string;
}

export const buildNewRuleSetAttributes = (
attributes: string[],
opt: OptBuildNewRuleSetAttributesParams,
): RuleSetAttribute[] => {
return attributes.map((attribute, index) => {
const attributeTypeList = getAttributeTypeList(attribute, opt);
return {
ruleSetId: `${index}`,
ruleSetAttributeId: `${index}`,
ruleSetAttributeType: attribute,
ruleSetAttributeValue: attributeTypeList[0] ? attributeTypeList[0] : '',
};
  }};
};

```
<!-- CODESCAN_FILE_END -->

---

### 299. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\index.ts" type=".ts" size="135" lines="4" chars="135" -->
```typescript
export { RuleSetAttributes } from './RuleSetAttributes';
export * from './useRuleSetAttributes';
export * from './attributeTypeUtils';

```
<!-- CODESCAN_FILE_END -->

---

### 300. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\RuleSetAttributes.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\RuleSetAttributes.tsx" type=".tsx" size="5730" lines="205" chars="5730" -->
```typescript
import React, { useState } from 'react';
import { RuleSetAttribute } from '../api/types';
import {
convertAttributeTypeToLabel,
getAttributeOptions,
UNEDITABLE_ATTRIBUTE_TYPES,
} from './attributeTypeUtils';
import { useRuleSetAttributes } from './useRuleSetAttributes';
import {
SCAttributeDiv,
SCAttributeInput,
SCAttributeLabel,
SCAttributesContainer,
SCAttributeSpan,
SCRuleBtn,
} from '../styles';
import { SCDeleteConfirmLabel } from './styles';
import { Combobox, Spinner } from 'commonui';
import { ATTRIBUTE_TYPES, VIEW_MODES } from '../constants';
import { IRuleSetAttributes } from './types';

const buildAttributeComponents = (
attribute: RuleSetAttribute,
canEdit: boolean,
setAttribute: (name: string, value: string) => void,
): JSX.Element => {
const options = getAttributeOptions(attribute.ruleSetAttributeType);
const label = convertAttributeTypeToLabel(attribute.ruleSetAttributeType);

  const attributeComponent = options.length ? (
<Combobox
id={`attribute_combo-${attribute.ruleSetAttributeType}`}
key={`attribute_combo-${attribute.ruleSetAttributeType}`}
name={`${attribute.ruleSetAttributeType}`}
value={attribute.ruleSetAttributeValue}
options={options}
disabled={!canEdit}
onChange={(name, value) => {
setAttribute(name, value);
}}
    [>
  ] ; [
<SCAttributeInput
label="attribute-input"
key={`attribute_combo-${attribute.ruleSetAttributeType}`}
name={`${attribute.ruleSetAttributeType}`}
placeholder={label}
value={attribute.ruleSetAttributeValue}
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
setAttribute(e.target.name, e.target.value);
}}
disabled={!canEdit}
    [>
  ];

  return (
<div
id={`attribute_${attribute.ruleSetAttributeType}${attribute.ruleSetAttributeId}`}
>
<SCAttributeSpan>
<SCAttributeLabel
htmlFor={`attribute_label_${attribute.ruleSetAttributeType}${attribute.ruleSetAttributeId}`}
>
{label}:
</SCAttributeLabel>
{attributeComponent}
</SCAttributeSpan>
</div>
  ];
};

export const RuleSetAttributes = ({
ruleSetId,
tenantId,
attributes: initialAttributes,
onSaveOverride,
viewMode: initialViewMode,
controllerOverride,
refreshRuleSets,
}: IRuleSetAttributes): JSX.Element => {
const {
ruleSetAttributes: loadedRuleSetAttributes,
saveAttribute,
error,
isLoading,
removeRuleSet,
attributeController,
} = useRuleSetAttributes({
initialAttributes,
ruleSetId: ruleSetId,
tenantId,
  }};
const [viewMode, setViewMode] = useState<VIEW_MODES>(initialViewMode);
const [showDeleteConfirmation, setShowDeleteConfirmation] =
useState<boolean>(false);

  const attributes =
viewMode === VIEW_MODES.TEMPLATE
? initialAttributes
: loadedRuleSetAttributes;

  const controller = controllerOverride ?? attributeController;
const onSave = onSaveOverride ?? saveAttribute;

  if (error) {
return <div>Error Loading Rule Set with id: {ruleSetId}</div>;
}
if (isLoading) {
return <Spinner aria-label={`Loading Rule Set with id: ${ruleSetId}`} />;
}

  const mapRuleSetAttributes = (
ruleSetAttribute: RuleSetAttribute,
index: number,
): JSX.Element => {
if (
UNEDITABLE_ATTRIBUTE_TYPES.includes(ruleSetAttribute.ruleSetAttributeType)
    ] {
return (
<React.Fragment
key={`ruleset_attributes_${ruleSetAttribute.ruleSetId}_${ruleSetAttribute.ruleSetAttributeId}`}
></React.Fragment>
      ];
}

    return (
<SCAttributeDiv
key={`ruleset_attributes_${ruleSetAttribute.ruleSetId}_${ruleSetAttribute.ruleSetAttributeId}`}
>
{buildAttributeComponents(
ruleSetAttribute,
viewMode === VIEW_MODES.EDIT || viewMode === VIEW_MODES.TEMPLATE,
controller(index).setAttribute,
        }}
</SCAttributeDiv>
    ];
};

  if (!attributes.length) {
return <></>;
}

  const ruleSetName =
attributes.find(
(i: RuleSetAttribute) =>
i.ruleSetAttributeType === ATTRIBUTE_TYPES.CATEGORY,
)?.ruleSetAttributeValue || '(No Category Specified)';

  return (
<SCAttributesContainer>
{ruleSetId && <h2>Rule Set: {ruleSetName}</h2>}
{attributes.map(mapRuleSetAttributes)}
{viewMode === VIEW_MODES.EDIT && (
<SCRuleBtn
onClick={async () => {
await Promise.all(
attributes.map(async (attribute) => onSave(attribute)),
            };
setViewMode(VIEW_MODES.VIEW);
}}
>
Save Attributes
</SCRuleBtn>
      ]}
{viewMode === VIEW_MODES.VIEW && (
<SCRuleBtn onClick={() => setViewMode(VIEW_MODES.EDIT)}>
Edit Attributes
</SCRuleBtn>
)}
{ruleSetId && !showDeleteConfirmation && (
<SCRuleBtn
onClick={() => {
setShowDeleteConfirmation(true);
}}
>
Remove Rule Set
</SCRuleBtn>
      ]}
{ruleSetId && showDeleteConfirmation && (
        >>
<SCDeleteConfirmLabel>
Are you sure you want to delete this rule set?
</SCDeleteConfirmLabel>
<SCRuleBtn
onClick={() => {
removeRuleSet(tenantId, ruleSetId).then(() => {
refreshRuleSets();
              }];
}}
>
Confirm
</SCRuleBtn>
<SCRuleBtn
onClick={() => {
setShowDeleteConfirmation(false);
}}
>
Cancel
</SCRuleBtn>
        >[>
      ]}
</SCAttributesContainer>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 301. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\styles.ts" type=".ts" size="153" lines="8" chars="153" -->
```typescript
import styled from 'styled-components';

export const SCDeleteConfirmLabel = styled.span`
font-size: 20px;
font-weight: 600;
margin-right: 5px;
`;

```
<!-- CODESCAN_FILE_END -->

---

### 302. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\types.ts`

<!-- CODESCAN_FILE_START -->
```typescript
import { RuleSetAttribute } from '../api/types';
import { VIEW_MODES } from '../constants';

export interface AttributeController {
setAttribute: (name: string, value: string) => void;
}

export interface IRuleSetAttributes {
ruleSetId: string;
tenantId: string;
attributes: RuleSetAttribute[];
attributeTypes?: string[];
viewMode: VIEW_MODES;
onSaveOverride?: (attribute: RuleSetAttribute) => Promise<void> | void;
controllerOverride?: (index: number) => AttributeController;
refreshRuleSets: () => void;
}

export interface IUseRuleSetAttributesProps {
initialAttributes: RuleSetAttribute[];
ruleSetId: string;
tenantId: string;
}

export interface IUseRuleSetAttributes {
setAttributes: React.Dispatch<React.SetStateAction<RuleSetAttribute[]>>;
attributeController: (index: number) => AttributeController;
ruleSetAttributes: RuleSetAttribute[];
getActiveRuleSetAttributes: () => RuleSetAttribute[];
saveAttribute: (attribute: RuleSetAttribute) => Promise<void>;
error: string | undefined;
isLoading: boolean;
removeRuleSet: (tenantId?: string, ruleSetId?: string) => Promise<void>;
}

```
<!-- CODESCAN_FILE_END -->

---

### 303. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\useRuleSetAttributes.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSetAttributes\useRuleSetAttributes.ts" type=".ts" size="3429" lines="132" chars="3429" -->
```typescript
import { useEffect, useState } from 'react';
import * as API from '../api/api';
import { RuleSetAttribute } from '../api/types';
import { ATTRIBUTE_TYPES, RULE_TYPE } from '../constants';
import {
AttributeController,
IUseRuleSetAttributesProps,
IUseRuleSetAttributes,
} from './types';

export const useRuleSetAttributes = ({
initialAttributes = [],
ruleSetId,
tenantId,
}: IUseRuleSetAttributesProps): IUseRuleSetAttributes => {
const [ruleSetAttributes, setAttributes] =
useState<RuleSetAttribute[]>(initialAttributes);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | undefined>();

  const attributeController = (): AttributeController => {
const setAttribute = (name: string, value: string): void => {
const prevAttribute = ruleSetAttributes.find(
(att) => att.ruleSetAttributeType === name,
      ];
const prevAttributeIndex = ruleSetAttributes.findIndex(
(att) => att.ruleSetAttributeType === name,
      ];

      if (prevAttribute) {
const newAttribute = { ...prevAttribute, ruleSetAttributeValue: value };
setAttributes((prev) => {
const newAttributes = [...prev];
newAttributes.splice(prevAttributeIndex, 1, newAttribute);

          return newAttributes;
        }];
}
};

    return {
setAttribute,
};
};

  const loadRuleSet = async (): Promise<void> => {
if (!tenantId) {
return;
}
const r = await API.fetchRuleSet(tenantId, ruleSetId as string);
if (r.error) {
setError(r.errorMessage);
return;
}
const { attributes } = r.payload;
setAttributes(attributes);
};

  useEffect(() => {
if (ruleSetId) {
setIsLoading(true);
loadRuleSet();
setIsLoading(false);
} else {
setAttributes([]);
setIsLoading(false);
}
}, [tenantId, ruleSetId]);

  const saveAttribute = async (attribute: RuleSetAttribute): Promise<void> => {
if (!tenantId) return;

    await API.updateRuleSetAttribute(
tenantId,
attribute.ruleSetId,
attribute.ruleSetAttributeId,
{
ruleSetAttributeType: attribute.ruleSetAttributeType,
ruleSetAttributeValue: attribute.ruleSetAttributeValue,
},
    ];
};

  const removeRuleSet = async (
tenantId?: string,
ruleSetId?: string,
): Promise<void> => {
if (!tenantId) {
throw new Error('Need tenantId set to save rule!');
}
if (!ruleSetId) {
throw new Error(
`Attempting to delete a rule set that does not have an id`,
      ];
}
await API.deleteRuleSet(tenantId, ruleSetId).catch((e) => {
if (e) {
console.error('error', e);
return false;
} else {
return true;
}
    }};
};

  const getActiveRuleSetAttributes = (): RuleSetAttribute[] => {
const ruleTypeValue =
ruleSetAttributes.find(
(att) => att.ruleSetAttributeType === ATTRIBUTE_TYPES.RULE_TYPE,
)?.ruleSetAttributeValue || '';

    if (ruleTypeValue === RULE_TYPE.PERSONAL_CHECK) {
return ruleSetAttributes.filter(
(att) => att.ruleSetAttributeType !== ATTRIBUTE_TYPES.SUB_PRODUCT_ID,
      ];
}

    return ruleSetAttributes;
};

  return {
ruleSetAttributes,
getActiveRuleSetAttributes,
saveAttribute,
error,
isLoading,
removeRuleSet,
attributeController,
setAttributes,
};
};

```
<!-- CODESCAN_FILE_END -->

---

### 304. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\index.ts" type=".ts" size="39" lines="2" chars="39" -->
```typescript
export { RuleSets } from './RuleSets';

```
<!-- CODESCAN_FILE_END -->

---

### 305. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\RuleSets.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\RuleSets.tsx" type=".tsx" size="1064" lines="39" chars="1064" -->
```typescript
import React from 'react';
import { RuleSetAttributes } from '../RuleSetAttributes';
import { VIEW_MODES } from '../constants';
import { RuleList } from '../RuleList';
import { NewRuleSet } from '../NewRuleSet';
import { IRuleSets } from './types';
import { SCSectionWrapper } from './styles';

export const RuleSets = ({
ruleSets,
refreshRuleSets,
tenantId,
productId,
}: IRuleSets): JSX.Element => {
return (
<div>
<NewRuleSet
tenantId={tenantId}
productId={productId}
refreshRuleSets={refreshRuleSets}
      [>
{ruleSets.map((ruleSet) => {
return (
<SCSectionWrapper key={`ruleset-${ruleSet.ruleSetId}`}>
<RuleSetAttributes
ruleSetId={ruleSet.ruleSetId}
tenantId={tenantId}
attributes={[]}
viewMode={VIEW_MODES.VIEW}
refreshRuleSets={refreshRuleSets}
/>
<RuleList ruleSetId={ruleSet.ruleSetId} tenantId={tenantId} />
</SCSectionWrapper>
        };
      }]}
</div>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 306. `C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\styles.ts" type=".ts" size="233" lines="13" chars="233" -->
```typescript
import styled from 'styled-components';

export const SCSectionWrapper = styled.div`
border-bottom: 1px solid black;
border-radius: 5px;
padding: 10px;
margin-bottom: 10px;

  button:hover {
transform: scale(1.1);
}
`;

```
<!-- CODESCAN_FILE_END -->

---

### 3o7. ‘C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\types.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\RuleSets\types.ts" type=".ts" size="175" lines="9" chars="175" -->
```typescript
import { RuleSetData } from '../api/types';

export interface IRuleSets {
ruleSets: RuleSetData[];
refreshRuleSets: () => void;
tenantId: string;
productId: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 3o8. 'C:\DevCode\AstrouI\src\components\Decisioning\__mocks__lapi.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\__mocks__\api.ts" type=".ts" size="1815" lines="77" chars="1815" -->
```typescript
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as API from '../api/types';
import * as data from '../data';

const mockRuleSetData = (index: number): API.RuleSetData => {
return {
name: `rule set ${index}`,
ruleSetId: `rule-set-id-${index}`,
ruleSetType: 'individual',
createDate: Date.now().toString(),
createdBy: 'testUser',
};
};

const api = jest.createMockFromModule('../api') as any;

api.fetchRuleSet = async (): Promise<API.ApiGetRuleSetResult> => {
return {
ruleSet: {
name: 'Test Rule',
ruleSetId: '',
ruleSetType: 'individual',
createDate: '',
createdBy: '',
},
rules: [
{
ruleId: 'test-rule-id-0',
ruleStructure: data.allFactTypesTemplate,
},
],
attributes: [
{
ruleSetAttributeId: 'attribute-id',
ruleSetId: '',
ruleSetAttributeType: 'APPLICANT_TYPE',
ruleSetAttributeValue: 'Primary',
},
],
};
};

api.fetchRuleById = async () => {};

api.fetchRuleSetTemplate = async (): Promise<API.RuleSetTemplate> => {
return Promise.resolve({
name: 'Test Rule',
type: 'individual',
version: 1,
rules: [data.allFactTypesTemplate],
attributes: ['RULE_TYPE', 'APPLICANT_TYPE'],
  }};
};

api.fetchRuleSetTemplateList = () =>
Promise.resolve([
{
name: 'Individual',
type: 'individual',
},
{
name: 'Account Eligibility',
type: 'account-eligibility',
},
  ]};

api.addRule = () => Promise.resolve({});
api.updateRule = () => Promise.resolve({});
api.deleteRule = () => Promise.resolve({});
api.createRuleSet = () => Promise.resolve({});

api.fetchRuleSets = () =>
Promise.resolve([mockRuleSetData(0), mockRuleSetData(1), mockRuleSetData(2)]);

module.exports = api;

```
<!-- CODESCAN_FILE_END -->

---

### 3o9. 'C:\DevCode\AstrouI\src\components\Decisioning\__mocks__Icontext.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\__mocks__\context.ts" type=".ts" size="315" lines="16" chars="315" -->
```typescript
const mockTenant = {
id: 'mock-tenant-id',
legalName: 'mock tenant',
};

const mockCoreProduct = {
id: '1234',
};

export const mockContext = {
tenant: mockTenant,
loadTenant: () => Promise.resolve(mockTenant),
coreProduct: mockCoreProduct,
loadCoreProduct: () => Promise.resolve(mockCoreProduct),
};

```
<!-- CODESCAN_FILE_END -->

---

### 31o. 'C:\DevCode\AstrouI\src\components\Decisioning\__test__lapi.test.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\__test__\api.test.tsx" type=".tsx" size="1500" lines="51" chars="1500" -->
```typescript
import * as API from '../api';
import * as APIType from '../api/types';
import * as clientapi from 'utils/api-client';

const tenantId = 'test-tenantid';
const coreProductId = 'test-productid';
const ruleSets: APIType.RuleSetData[] = [
{
name: 'Rule Set',
ruleSetId: 'EA8660DA-1BEF-494B-9325-21D7BB073C2E',
ruleSetType: 'product-fit',
createDate: '2022-11-14T23:34:52.657Z',
createdBy: 'cvp1037',
},
{
name: 'Rule Set',
ruleSetId: 'D660C0BE-3CC4-404C-9241-8EC42C3A6478',
ruleSetType: 'personal-check',
createDate: '2022-11-14T23:35:04.883Z',
createdBy: 'cvp1037',
},
];

describe('Decisioning api:', () => {
it('fetchRuleSets', async () => {
const clientSpy = jest.spyOn(clientapi, 'client2');
clientSpy.mockResolvedValue({
payload: ruleSets,
result: {
code: 0,
message: 'success',
},
    }};
const response = await API.fetchRuleSets(tenantId, coreProductId);

    expect(response.error).toBeFalsy();
expect(response.errorMessage).toEqual('');
expect(response.payload).toEqual(ruleSets);
  }};

  it('fetchRuleSets - error case', async () => {
const clientSpy = jest.spyOn(clientapi, 'client2');
clientSpy.mockRejectedValue(new Error('Test Error Message'));
const response = await API.fetchRuleSets(tenantId, coreProductId);

    expect(response.error).toBeTruthy();
expect(response.errorMessage).toEqual('Test Error Message');
expect(response.payload).toEqual([]);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 311. `C:\DevCode\AstroUI\src\components\Decisioning\__test__\Decisioning.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\__test__\Decisioning.test.tsx" type=".tsx" size="1257" lines="46" chars="1257" -->
```typescript
/* eslint-disable @typescript-eslint/ban-ts-comment */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { renderWithContext } from 'components/__mock__/mock-context';
import { Paths } from 'layouts/RouterSwitch';
import { mockContext } from '../__mocks__/context';
import Decisioning from '../Decisioning';

jest.mock('../api');

const props = {
match: {
params: {
tenantId: mockContext.tenant.id,
templateId: '1234',
viewMode: 'view',
productId: mockContext.coreProduct.id,
},
isExact: true,
path: '/admin/tenant/:tenantId/core-product/:productId/rule-sets',
url: '/admin/tenant/mock-tenant-id/core-product/1234/rule-sets',
},
};

beforeEach(() => {
jest.resetAllMocks();
}};

describe.skip('Decisioning', () => {
it('Renders list correctly', async () => {
renderWithContext(
mockContext,
<MemoryRouter initialEntries={[Paths.RuleSetList]}>
<Route path={Paths.RuleSetList}>
<Decisioning {...(props as any)} />
</Route>
</MemoryRouter>,
    ];

    await waitFor(() => {
expect(screen.getAllByText('Remove Ruleset')).toHaveLength(3);
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 312. `C:\DevCode\AstroUI\src\components\Decisioning\__test__\NewRuleSet.test.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
/* eslint-disable @typescript-eslint/ban-ts-comment */
import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { NewRuleSet } from '../NewRuleSet';
import { MemoryRouter, Route } from 'react-router-dom';
import { renderWithContext } from 'components/__mock__/mock-context';
import { mockContext } from '../__mocks__/context';
import { Paths } from 'layouts/RouterSwitch';

jest.mock('../api');

const renderAtPath = (pathname: string, Component: any, props: any): void => {
const pathObj = {
pathname,
state: {
associations: [
{
id: '',
idType: 'tenant',
},
],
},
};
renderWithContext(
mockContext,
<MemoryRouter initialEntries={[pathObj]}>
<Route path={pathname}>
<Component {...props} />
</Route>
</MemoryRouter>,
  ];
};

beforeEach(() => {
jest.resetAllMocks();
}};

describe.skip('NewRuleSet', () => {
it('renders new template correctly', async () => {
renderAtPath(Paths.RuleSetList, NewRuleSet, {});

    await waitFor(() => {
expect(screen.getByText('Cancel')).toBeInTheDocument();
    }};

    await waitFor(() => {
expect(screen.getByText('Applicant Type:')).toBeInTheDocument();
    }};
  }};

  it.skip('displays error messages correctly', async () => {
const setShowNewRuleSetFormMock = jest.fn();
const setShowAddRulesetMock = jest.fn();
renderAtPath(Paths.RuleSetList, NewRuleSet, {
setShowNewRuleSetForm: setShowNewRuleSetFormMock,
setShowAddRuleset: setShowAddRulesetMock,
    }};

    expect(screen.queryByText('Please Wait...')).toBeInTheDocument();

    await screen.findByText('Save');

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
expect(
screen.getByText('Please fix errors before saving'),
).toBeInTheDocument();
    }};
  }};

  it('Save button changes text content when request is made', async () => {
const setShowNewRuleSetFormMock = jest.fn();
const setShowAddRulesetMock = jest.fn();

    renderAtPath(Paths.RuleSetList, NewRuleSet, {
setShowNewRuleSetForm: setShowNewRuleSetFormMock,
setShowAddRuleset: setShowAddRulesetMock,
    }};

    expect(screen.queryByText('Please Wait...')).toBeInTheDocument();

    await screen.findByText('Save');

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
expect(screen.queryByText('Saving...')).toBeInTheDocument();
    }};

    await waitFor(() => {
expect(setShowNewRuleSetFormMock).toBeCalled();
    }};

    await waitFor(() => {
expect(setShowAddRulesetMock).toBeCalled();
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 313. `C:\DevCode\AstroUI\src\components\Decisioning\__test__\RuleList.test.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import {
fireEvent,
screen,
waitForElementToBeRemoved,
} from '@testing-library/react';
import { renderWithContext } from 'components/__mock__/mock-context';
import { Paths } from 'layouts/RouterSwitch';
import React from 'react';
import { MemoryRouter, Route } from 'react-router-dom';
import { RuleList } from '../RuleList';
import { mockContext } from '../__mocks__/context';

jest.mock('../api');

const renderAtPath = (pathname: string, Component: any, props: any): void => {
const pathObj = {
pathname,
state: {
associations: [
{
          id:-,
idType: 'tenant',
},
],
},
};
renderWithContext(
mockContext,
<MemoryRouter initialEntries={[pathObj]}>
<Route path={pathname}>
<Component {...props} />
</Route>
</MemoryRouter>,
  ];
};

beforeEach(() => {
jest.resetAllMocks();
}};

describe.skip('RuleList', () => {
it('Clicking add new rule button creates a new rule', async () => {
renderAtPath(Paths.RuleSetList, RuleList, {
ruleSetId: '',
    }};

    const addNewRule = screen.getByText('Add New Rule');

    fireEvent.click(addNewRule);

    await screen.findByText('Loading...');

    await screen.findByDisplayValue('Test Rule');
  }};

  it('Clicking remove rule button deletes a rule', async () => {
renderAtPath(Paths.RuleSetList, RuleList, {
ruleSetId: '',
    }};

    await screen.findByText('Test Rule');

    fireEvent.click(screen.getByText('Remove Rule'));

    expect(screen.getByText('Removing...'));

    await waitForElementToBeRemoved(screen.queryByText('Test Rule'));
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 314. `C:\DevCode\AstroUI\src\components\Decisioning\constants.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\constants.ts" type=".ts" size="1331" lines="59" chars="1331" -->
```typescript
import { IOption } from 'commonui';

export const APPLICATION_TYPE_LIST = [
'New-Membership',
'Loan-Applicant-Membership',
'Existing-Membership',
'Minor-Membership',
1;l

export const APPLICATION_TYPE_OPTIONS: IOption[] = APPLICATION_TYPE_LIST.map(
(applicationType) => {
return {
label: applicationType.replaceAll('-', ' '),
value: applicationType,
};
},
];

export const APPLICANT_TYPE_LIST = ['Primary', 'Joint'];

export const APPLICANT_TYPE_OPTIONS: IOption[] = APPLICANT_TYPE_LIST.map(
(applicationType) => {
return {
label: applicationType,
value: applicationType,
};
},
];

export const RULE_TYPE_LIST = ['personal-check', 'product-fit'];

export const RULE_TYPE_OPTIONS: IOption[] = RULE_TYPE_LIST.map((ruleType) => {
return {
label: ruleType.replaceAll('-', ' '),
value: ruleType,
};
}};

export const enum ATTRIBUTE_TYPES {
RULE_TYPE = 'RULE_TYPE',
APPLICANT_TYPE = 'APPLICANT_TYPE',
CATEGORY = 'CATEGORY',
APPLICATION_TYPE = 'APPLICATION_TYPE',
TENANT_ID = 'TENANT_ID',
CORE_PRODUCT_ID = 'CORE_PRODUCT_ID',
SUB_PRODUCT_ID = 'SUB_PRODUCT_ID',
}

export const enum RULE_TYPE {
PERSONAL_CHECK = 'personal-check',
PRODUCT_FIT = 'product-fit',
}

export const enum VIEW_MODES {
VIEW = 'view',
TEMPLATE = 'template',
EDIT = 'edit',
}

```
<!-- CODESCAN_FILE_END -->

---

### 315. `C:\DevCode\AstroUI\src\components\Decisioning\data.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\data.ts" type=".ts" size="3111" lines="177" chars="3111" -->
```typescript
import {
IFact,
IRuleOperatorData,
RootConditionNode,
RuleStructure,
SingleConditionNode,
} from 'commonui';

export const strOperators: IRuleOperatorData[] = [
{
label: 'Equals',
operator: 'equal',
},
{
label: "Doesn't Equal",
operator: 'notEqual',
},
];

export const arrOperators: IRuleOperatorData[] = [
{
label: 'In',
operator: 'in',
},
{
label: 'Not in',
operator: 'notIn',
},
];

export const numOperators: IRuleOperatorData[] = [
{
label: 'Equals',
operator: 'equals',
},
{
label: "Doesn't Equal",
operator: 'notEquals',
},
{
label: '>',
operator: 'greaterThan',
},
{
label: '>=',
operator: 'greaterThanInclusive',
},
{
label: '<',
operator: 'lessThan',
},
{
label: '<=',
operator: 'lessThanInclusive',
},
];

const selectFactOptions = [
{
label: 'Pass',
value: 'PASS',
},
{
label: 'Fail',
value: 'FAIL',
},
{
label: 'Unknown',
value: 'UNKNOWN',
},
;l

export const sampleFieldIds: Record<string, string> = {
cs: 'Credit Score',
age: 'Age',
dm: 'Derogatory Marks',
zip: 'Zip Code',
r: 'Result',
fc: 'Fraud Check',
};

[>>
* @todo Fix types in commonui
>[
export const sampleFacts: any = [
{
type: 'select',
fact: sampleFieldIds.fc,
label: sampleFieldIds.fc,
operators: strOperators,
options: selectFactOptions,
},
{
type: 'number',
fact: sampleFieldIds.age,
label: sampleFieldIds.age,
operators: strOperators,
},
{
type: 'range(300,850)',
fact: sampleFieldIds.cs,
label: sampleFieldIds.cs,
operators: numOperators,
},
{
type: 'string',
fact: sampleFieldIds.zip,
label: sampleFieldIds.zip,
operators: arrOperators,
},
{
type: 'number',
fact: sampleFieldIds.dm,
label: sampleFieldIds.dm,
operators: numOperators,
},
{
type: 'string',
fact: sampleFieldIds.r,
label: sampleFieldIds.r,
operators: strOperators,
},
];

export const allFactTypes: IFact['type'][] = [
'number',
'percentage',
'string',
'range(1,100)',
'select',
];
const testOperator: IRuleOperatorData = {
operator: 'testOperator',
label: 'testOperator',
};
const allFactTypesList: IFact[] = allFactTypes.map((type) => {
if (type === 'select') {
return {
type: 'select',
fact: 'select-fact',
label: 'select-fact',
operators: strOperators,
options: selectFactOptions,
};
}
return {
type,
fact: `${type}-fact`,
label: `${type}-fact`,
operators: [testOperator],
};
}};

const nodes: SingleConditionNode[] = allFactTypesList.map((fact: any) => ({
type: 'single',
condition: {
fact: fact.fact,
isActive: true,
operator: '',
value: '',
},
}}];
const allFactTypesTemplateNode: RootConditionNode = {
title: 'Test Rule',
isRuleActive: true,
type: 'logicGroup',
logicType: 'all',
nodes,
};

export const allFactTypesTemplate: RuleStructure = {
version: 1,
mode: 'template',
node: allFactTypesTemplateNode,
facts: allFactTypesList,
};

```
<!-- CODESCAN_FILE_END -->

---

### 316. `C:\DevCode\AstroUI\src\components\Decisioning\Decisioning.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\Decisioning.tsx" type=".tsx" size="2698" lines="91" chars="2698" -->
```typescript
import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import * as API from './api';
import { RuleSetData } from './api/types';
import { RuleSets } from './RuleSets';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { ruleSetListRoute } from './useRuleSetUrls';
import { useParams } from 'react-router-dom';

const Decisioning = (): JSX.Element => {
const params = useParams();
const paramTenantId = params?.tenantId;
const paramProductId = params?.productId;
const {
setPageTitle,
tenant,
coreProduct,
loadCoreProduct,
setDisplayCreateButton,
setHasDecisioningInCoreProduct,
} = useAppContext();
const tenantId = tenant?.id || paramTenantId;
const coreProductId = coreProduct?.id || paramProductId;

  const [ruleSets, setRuleSets] = useState<RuleSetData[]>([]);
const [error, setError] = useState<null | string>(null);

  const tenantName = tenant?.legalName;
const isLoading = !tenant;

  const loadRuleSets = async (
tenantId: string,
coreProductId?: string,
): Promise<void> => {
const response = await API.fetchRuleSets(tenantId, coreProductId);
if (response.error) {
setError(response.errorMessage);
} else {
setRuleSets(response.payload);
}
};

  useEffect(() => {
setDisplayCreateButton(false);
setHasDecisioningInCoreProduct(true);

    if (tenantId && tenantName && coreProduct) {
const ruleSetListPath = ruleSetListRoute(
tenantId ?? '',
coreProductId ?? '',
      ];
const titleList = new Map<string, string>();
titleList.set(`${tenantName} > `, `/admin/tenant/${tenantId}/view`);
titleList.set(
`Core Products > `,
`/admin/tenant/${tenantId}/core-products`,
      ];
titleList.set(
`${coreProduct?.name} > ` || '',
`/admin/tenant/${tenantId}/core-products/${coreProduct?.templateId}/${coreProduct?.id}/${coreProduct?.viewMode}`,
      ];
titleList.set('Rule Sets', ruleSetListPath);
setPageTitle(titleList);
loadRuleSets(tenantId, coreProduct?.id);
} else if (tenantId && coreProductId) {
loadCoreProduct(tenantId, coreProductId);
}
}, [tenantId, tenantName, coreProduct]);

  if (isLoading || error || !(tenantId && coreProductId)) {
return (
<FullPageStatus
errorResponse={error !== null ? new Error(error) : undefined}
      [>
    ];
}

  return (
<RuleSets
ruleSets={ruleSets}
refreshRuleSets={() => {
loadRuleSets(tenantId, coreProduct?.id);
}}
tenantId={tenantId}
productId={coreProductId}
    [>
  ];
};

export default Decisioning;

```
<!-- CODESCAN_FILE_END -->

---

### 317. `C:\DevCode\AstroUI\src\components\Decisioning\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\styles.ts" type=".ts" size="2000" lines="92" chars="2000" -->
```typescript
import styled from 'styled-components';
import { BasicInput, Button, Icon, Label, Panel, Theme } from 'commonui';

export const SCBaseActionsContainer = styled(Panel)`
margin-bottom: 25px;
background: #f3f5f5;
`;

export const SCBaseActionsButtonContainer = styled.div`
display: flex;
gap: 10px;
`;

export const SCBaseAction = styled.div``;

export const SCBaseActionIcon = styled(Icon)``;

export const SCBaseBtnLabel = styled.span`
font-size: 32px;
vertical-align: middle;
padding-left: 15px;
`;

export const SCRuleActionsContainer = styled(SCBaseActionsContainer)``;

export const SCRuleActionsButtonContainer = styled(
SCBaseActionsButtonContainer,
]`
display: flex;
margin: 25px 0;
`;

export const SCAddRuleAction = styled(SCBaseAction)<{ isDisabled: boolean }>`
display: ${(props) => (props.isDisabled ? 'none' : 'flex')};
`;

export const SCRuleActionIcon = styled(SCBaseActionIcon)`
svg {
color: green;
}
`;

export const SCRuleBtnLabel = styled(SCBaseBtnLabel)``;

export const SCRuleSetActionsContainer = styled(SCBaseActionsContainer)``;

export const SCRuleSetActionsButtonContainer = styled(
SCBaseActionsButtonContainer,
)``;

export const SCRulesetAction = styled(SCBaseAction)``;

export const SCRulesetBtnLabel = styled(SCBaseBtnLabel)``;

export const SCRuleBtn = styled(Button)`
margin-top: 10px;
margin-right: 10px;
margin-bottom: 10px;
min-width: 100px;
`;

export const SCAttributeDiv = styled.div`
display: flex;
flex-direction: column;
margin-bottom: 5px;
`;

export const SCAttributesContainer = styled.div`
margin-bottom: 5px;
`;

export const SCAttributeSpan = styled.span`
display: flex;
`;

export const SCAttributeLabel = styled(Label)`
min-width: 8%;
text-align: left;
margin-right: 10px;
align-self: center;
color: #676767;
`;

export const SCAttributeInputDiv = styled.div`
max-width: 30%;
`;

export const SCAttributeInput = styled(BasicInput)`
${Theme.getFontStyles('body2')};
max-width: 30%;
`;

```
<!-- CODESCAN_FILE_END -->

---

### 318. `C:\DevCode\AstroUI\src\components\Decisioning\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\types.ts" type=".ts" size="385" lines="18" chars="385" -->
```typescript
import { RuleMode, RuleStructure } from 'commonui';

export interface IInternalRuleMetadata {
title: string;
mode: RuleMode;
isSaving: boolean;
isRemoving: boolean;
isNew?: boolean;
inError?: boolean;
id?: string;
copy?: RuleStructure;
}

export type RuleMetadata = Pick<
IInternalRuleMetadata,
'title' | 'mode' | 'isSaving' | 'isRemoving' | 'isNew' | 'inError'
>;

```
<!-- CODESCAN_FILE_END -->

---

### 319. `C:\DevCode\AstroUI\src\components\Decisioning\useObjectArray.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\useObjectArray.tsx" type=".tsx" size="1357" lines="59" chars="1357" -->
```typescript
import { useState } from 'react';
import produce from 'immer';
import produce from 'immer';
type Obj = Record<string, any>;

interface IUseObjectArray<T> {
objs: T[];
push: <T>(obj: T) => void;
update: <T>(i: number, obj: Partial<T>, shouldRemoveCopy?: boolean) => void;
setArray: React.Dispatch<React.SetStateAction<T[]>>;
mapUpdates: <T>(fn: (obj: Readonly<T>, i: number) => Partial<T>) => void;
}

export const useObjectArray = <T extends Obj>(
initialArray: T[] = [],
): IUseObjectArray<T> => {
const [objs, setObjs] = useState<T[]>(initialArray);

  const push = <T,>(obj: T): void => {
setObjs(produce((draft) => draft.push(obj as any)));
};

  const mapUpdates = <T,>(
fn: (obj: Readonly<T>, i: number) => Partial<T>,
): void => {
setObjs(
produce((draft) =>
draft.forEach((obj, i) => (draft[i] = { ...obj, ...fn(obj as T, i) })),
      ],
    ];
};

  const update = <T,>(
i: number,
obj: Partial<T>,
shouldRemoveCopy?: boolean,
): void => {
shouldRemoveCopy
? setObjs(
produce((draft) => {
draft[i] = { ...draft[i], ...obj, copy: undefined };
          }],
        }
: setObjs(
produce((draft) => {
draft[i] = { ...draft[i], ...obj };
          }],
        };
};

  return {
objs,
push,
update,
setArray: setObjs,
mapUpdates,
};
};

```
<!-- CODESCAN_FILE_END -->

---

### 320. `C:\DevCode\AstroUI\src\components\Decisioning\useRuleSetUrls.tsx`

<!-- CODESCAN_FILE_START -->
path="C:\DevCode\AstroUI\src\components\DecisioningluseRuleSetUrls.tsx" type=".tsx" size="3152"
import { LocationDescriptorObject } from 'history';
import { useNavigate, generatePath } from 'react-router-dom';
import { Paths } from 'layouts/RouterSwitch';
import { Association } from './api/types';

export interface IUseRuleSetUrlProps {
productId?: string;
tenantId?: string;
}

export interface IUseRuleSetUrls {
ruleSetListPath: string;
goToRuleSetList: () => void;
toNewRuleSet: (
ruleSetTemplateType: string,
associations: Association[],
) => LocationDescriptorObject;
goToNewRuleSet: (
ruleSetTemplateType: string,
associations: Association[],
) => void;
toExistingRuleSet: (ruleSetId: string) => LocationDescriptorObject;
goToExistingRuleSet: (ruleSetId: string) => void;
buildTemplateAssociation: (tenantId: string) => Association[];
}

const TENANT_MSG = 'Tenant Id has not been set correctly';
const PRODUCT_MSG = 'Product Id has not been set correctly';

const editRuleSetRoute = (
tenantId: string,
ruleSetId: string,
productId: string,
): string =>
generatePath(Paths.RuleSetEdit, { tenantId, ruleSetId, productId });

const newRuleSetRoute = (
tenantId: string,
ruleSetTemplateType: string,
productId: string,
): string =>
generatePath(Paths.RuleSetNew, { tenantId, ruleSetTemplateType, productId });

export const ruleSetListRoute = (tenantId: string, productId: string): string =>
generatePath(Paths.RuleSetList, { tenantId, productId });

export const useRuleSetUrls = ({
tenantId,
productId,
}: IUseRuleSetUrlProps = {}): IUseRuleSetUrls => {
const push = useNavigate();

  const toNewRuleSet = (
ruleSetTemplateType: string,
associations: Association[],
): LocationDescriptorObject => {
if (!tenantId) {
throw new Error(TENANT_MSG);
}
if (!productId) {
throw new Error(PRODUCT_MSG);
}

    return {
pathname: newRuleSetRoute(tenantId, ruleSetTemplateType, productId),
state: {
associations,
},
};
};

  const goToNewRuleSet = (
ruleSetTemplateType: string,
associations: Association[],
): void => {
if (!tenantId) {
throw new Error(TENANT_MSG);
}

    push(toNewRuleSet(ruleSetTemplateType, associations));
};

  const toExistingRuleSet = (ruleSetId: string): LocationDescriptorObject => {
if (!tenantId) {
throw new Error(TENANT_MSG);
}
if (!productId) {
throw new Error(PRODUCT_MSG);
}

    return {
pathname: editRuleSetRoute(tenantId, ruleSetId, productId),
};
};

  const goToExistingRuleSet = (ruleSetId: string): void => {
push(toExistingRuleSet(ruleSetId));
};

  const ruleSetListPath = ruleSetListRoute(tenantId ?? '', productId ?? '');
const goToRuleSetList = (): void => {
if (!tenantId) {
throw new Error(TENANT_MSG);
}
push(ruleSetListPath);
};

  const buildTemplateAssociation = (tenantId: string): Association[] => {
return [
{
id: tenantId,
idType: 'tenant',
},
];
};

  return {
ruleSetListPath,
goToRuleSetList,
toNewRuleSet,
goToNewRuleSet,
toExistingRuleSet,
goToExistingRuleSet,
buildTemplateAssociation,
};
};

```
<!-- CODESCAN_FILE_END -->

---

### 321. `C:\DevCode\AstroUI\src\components\Decisioning\utils.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Decisioning\utils.ts" type=".ts" size="997" lines="32" chars="997" -->
```typescript
import {
ConditionNode,
IConditionProperties,
} from 'commonui/build/core/entities/decisioning';

export const getQuery = (query: string): string | null =>
new URLSearchParams(window.location.search).get(query);

export const createQueryParamString = (
queryParams: Record<string, string>,
): string => {
return new URLSearchParams(queryParams).toString();
};

const conditionUnfinishedOrInError = (node: IConditionProperties): boolean =>
!!node.errorText || node.operator === '' || node.value === '';

export const checkNodeForErrors = (node: ConditionNode): boolean => {
  switch (node.type) {
    case 'single':
      return conditionUnfinishedorInError(node.condition);
    case 'compound':
case 'logicGroup':
return node.nodes.some(checkNodeForErrors);
default:
throw new Error(`Invalid logic type: ${(node as ConditionNode).type}`);
}
};

export const ruleSetErrorMsg = (title: string): string =>
`Please fix errors with the ${title} rule before saving`;

```
<!-- CODESCAN_FILE_END -->

---

### 322. `C:\DevCode\AstroUI\src\components\Documentation\Documentation.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documentation\Documentation.tsx" type=".tsx" size="730" lines="32" chars="730" -->
```typescript
import React from 'react';
import { IDocumentation } from './types';
import { CardSection } from '../Card/CardSection';
import { SCDocumentation } from './styles';

const Documentation = ({
title = 'Documentation',
children,
documentation = [],
links = [],
}: IDocumentation) => (
<CardSection title={title}>
<SCDocumentation>
{children}
{documentation.map(doc => (
<div key={doc}>{doc}</div>
      ]]}
<ul>
{links.map(({ label, url }) => (
<li key={url}>
<a rel="noreferrer" href={url} target="_blank">
{label || url}
            >[>>
</li>
        }]}
</ul>
</SCDocumentation>
</CardSection>
];

export { Documentation };

```
<!-- CODESCAN_FILE_END -->

---

### 323. `C:\DevCode\AstroUI\src\components\Documentation\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documentation\index.ts" type=".ts" size="84" lines="4" chars="84" -->
```typescript
export * from './Documentation';
export * from './types';
export * from './styles';

```
<!-- CODESCAN_FILE_END -->

---

### 324. `C:\DevCode\AstroUI\src\components\Documentation\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documentation\styles.ts" type=".ts" size="273" lines="16" chars="273" -->
```typescript
import styled from 'styled-components';
import { Theme } from 'commonui';

const SCDocumentation = styled.div`
max-width: 600px;
${Theme.getFontStyles('body1')};
> div {
margin-bottom: 10px;
}
> ul {
margin-left: 20px;
}
`;

export { SCDocumentation };

```
<!-- CODESCAN_FILE_END -->

---

### 325. `C:\DevCode\AstroUI\src\components\Documentation\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documentation\types.ts" type=".ts" size="220" lines="14" chars="220" -->
```typescript
import React from 'react';

export interface ILink {
label?: string;
url: string;
}

export interface IDocumentation {
title?: string;
children?: React.ReactNode;
documentation?: string[];
links?: ILink[];
}

```
<!-- CODESCAN_FILE_END -->

---

### 326. `C:\DevCode\AstroUI\src\components\Documents\__test__\DocumentsList.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\__test__\DocumentsList.test.tsx" type=".tsx" size="2038" lines="80" chars="2038" -->
```typescript
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { DocumentsList } from '../DocumentsList';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import { render, screen } from '@testing-library/react';

export const wrapWithMockContextDocumentList = (
tenantId: string,
component: any,
): JSX.Element => {
const mockContext = {
tenant: {
id: tenantId,
legalName: '',
creationPending: true,
tenantSchema: '',
},
setTenant: () => {},
withinTenantContext: (successFunc: any): any => {
successFunc();
},
pageTitle: '',
setPageTitle: () => {},
setDisplayCreateButton: () => {},
setCreateButtonClicked: () => {},
createButtonClicked: true,
displayCreateButton: true,
};

  const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
data: { user: null },
logout: () => {},
logoutRequested: false,
};

  return (
<AuthContext.Provider value={mockAuthContext}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: '' } as any}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
  ];
};

describe('DocumentsList', () => {
test('Renders', async () => {
const systemDocumentsList = render(
wrapWithMockContextDocumentList(
'12345',
<BrowserRouter>
<DocumentsList />
</BrowserRouter>,
      ],
    ];
const systemDocumentsListGrid = systemDocumentsList.queryByRole(
'system-documents-container',
    ];

    expect(systemDocumentsListGrid);
  }};

  it('should render with no systemdocumentlist', () => {
render(
wrapWithMockContextDocumentList(
        ``,
<BrowserRouter>
<DocumentsList />
</BrowserRouter>,
      ],
    ];
expect(screen.queryAllByRole('row').length).toEqual(1);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 327. `C:\DevCode\AstroUI\src\components\Documents\__test__\DocumentUtils.test.js`

<!-- CODESCAN_FILE_START -->
```javascript
import {
uploadDocument,
loadDocument,
fetchDocumentTypes,
fetchDocuments,
} from '../DocumentUtils';
import {
fetchDocumentTypesSuccessResponse,
expectedDocumentTypes,
fetchDocumentsSuccessResponse,
expectedDocuments,
} from './DocumentUtilsTestData';

describe('DocumentUtils', () => {
const fetchSpy = jest.spyOn(global, 'fetch');
async function execWithFetchJsonMock(responseJsonObject, action) {
const mockJsonPromise = Promise.resolve(responseJsonObject);
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
blob: jest.fn(),
    }};

    return await action();
}

  const { URL } = window;

  beforeEach(() => {
delete window.URL;
window.URL = {
createObjectURL: jest.fn(() => 'blobUrl'),
revokeObjectURL: jest.fn(),
};
  }};

  afterAll(() => {
window.URL = URL;
  }};

  afterEach(() => {
fetchSpy.mockClear();
  }};
});
  test('Test fetchDocumentTypes', async () => {
await execWithFetchJsonMock(fetchDocumentTypesSuccessResponse, async () => {
const documentTypes = await fetchDocumentTypes();
expect(documentTypes).toEqual(expectedDocumentTypes);
expect(fetchSpy).toHaveBeenCalledTimes(1);
    }};
  }};

  test('Test fetchDocuments', async () => {
await execWithFetchJsonMock(fetchDocumentsSuccessResponse, async () => {
const documents = await fetchDocuments(expectedDocumentTypes);
expect(documents).toEqual(expectedDocuments);
expect(fetchSpy).toHaveBeenCalledTimes(1);
    }};
  }};

  test('Test uploadDocument', async () => {
const expectedResponse = { ok: true };
await execWithFetchJsonMock(expectedResponse, async () => {
const fileContents = 'file contents';
const file = new Blob([fileContents], {
type: 'text/plain',
name: 'file.txt',
      }];
expect(
await uploadDocument(expectedDocumentTypes[0].id, file, 'test user'),
).toBe(undefined);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }};
  }};

  test('Test previewDocument', async () => {
const expectedResponse = { ok: true };
const documentInfo = expectedDocuments[0];
jest.spyOn(global, 'setTimeout').mockImplementation((action) => action());

    await execWithFetchJsonMock(expectedResponse, async () => {
const document = await loadDocument(documentInfo);
expect(document).toEqual({
contentType: 'application/pdf',
contentUrl: 'blobUrl',
      }];

      expect(global.fetch).toHaveBeenCalledTimes(1);
expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
expect(window.URL.revokeObjectURL).toBeCalledWith('blobUrl');
expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 328. `C:\DevCode\AstroUI\src\components\Documents\__test__\DocumentUtilsTestData.js`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\__test__\DocumentUtilsTestData.js" type=".js" size="3361" lines="140" chars="3361" -->
```javascript
export const expectedDocumentTypes = [
{ id: 2, name: 'Disclosures' },
{ id: 1, name: 'Terms & Conditions' },
];

export const fetchDocumentTypesSuccessResponse = {
result: {
code: 0,
message: 'Success',
apiVer: '1.0.0',
correlationId: 'd0c2ace5-eb09-4bef-9d19-22bf82fc0b22',
errors: [],
},
payload: [
{
resourceTypeid: 1,
name: 'Terms & Conditions',
description: 'Terms & Conditions to be accepted by users',
subType: 'system',
createDate: '2020-02-05T15:19:15.041Z',
createdBy: 'Create Script',
updatedBy: 'Create Script',
lastUpdateDate: '2020-02-05T15:19:15.041Z',
},
{
resourceTypeid: 2,
name: 'Disclosures',
description: 'Disclosures to be accepted by users',
subType: 'system',
createDate: '2020-02-05T15:19:15.041Z',
createdBy: 'Create Script',
updatedBy: 'Create Script',
lastUpdateDate: '2020-02-05T15:19:15.041Z',
},
],
};

export const expectedDocuments = [
{
id: 2,
status: 'Active',
typeName: 'Disclosures',
filename: 'test.pdf',
version: 1,
typeId: 2,
contentType: 'application/pdf',
},
{
id: 2,
status: 'Archive',
typeName: 'Terms & Conditions',
filename: 'test2.pdf',
version: 1,
typeId: 1,
contentType: 'application/pdf',
},
{
id: 2,
status: 'Archive',
typeName: 'Terms & Conditions',
filename: 'test2.2.pdf',
version: 2,
typeId: 1,
contentType: 'application/pdf',
},
{
id: 2,
status: 'Active',
typeName: 'Terms & Conditions',
filename: 'test2.3.pdf',
version: 3,
typeId: 1,
contentType: 'application/pdf',
},
];

export const fetchDocumentsSuccessResponse = {
result: {
code: 0,
message: 'Success',
apiVer: '1.0.0',
correlationId: '1df23240-7582-4319-a82d-ac8f426dd332',
errors: [],
},
payload: [
{
resourceId: 2,
typeId: 2,
fileName: 'test.pdf',
contentType: 'application/pdf',
version: 1,
blobId: 'c2a06d75-3bd8-429c-adc0-01ea24457d58',
tenantId: 'system',
createDate: '2020-02-05T15:34:52.633Z',
createdBy: 'me',
updatedBy: 'me2',
lastUpdateDate: '2020-02-05T15:34:52.633Z',
},
{
resourceId: 2,
typeId: 1,
fileName: 'test2.pdf',
contentType: 'application/pdf',
version: 1,
blobId: 'c2a06d75-3bd8-429c-adc0-01ea24457d58',
tenantId: 'system',
createDate: '2020-02-05T15:34:52.633Z',
createdBy: 'me',
updatedBy: 'me2',
lastUpdateDate: '2020-02-05T15:34:52.633Z',
},
{
resourceId: 2,
typeId: 1,
fileName: 'test2.2.pdf',
contentType: 'application/pdf',
version: 2,
blobId: 'c2a06d75-3bd8-429c-adc0-01ea24457d58',
tenantId: 'system',
createDate: '2020-02-05T15:34:52.633Z',
createdBy: 'me',
updatedBy: 'me2',
lastUpdateDate: '2020-02-05T15:34:52.633Z',
},
{
resourceId: 2,
typeId: 1,
fileName: 'test2.3.pdf',
contentType: 'application/pdf',
version: 3,
blobId: 'c2a06d75-3bd8-429c-adc0-01ea24457d58',
tenantId: 'system',
createDate: '2020-02-05T15:34:52.633Z',
createdBy: 'me',
updatedBy: 'me2',
lastUpdateDate: '2020-02-05T15:34:52.633Z',
},
],
};

```
<!-- CODESCAN_FILE_END -->

---

### 329. `C:\DevCode\AstroUI\src\components\Documents\__test__\UploadDocumentForm.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\__test__\UploadDocumentForm.test.tsx" type=".tsx" size="4354" lines="159" chars="4342" -->
```typescript
import {
act,
fireEvent,
render,
screen,
waitFor,
} from '@testing-library/react';
import React from 'react';
import * as DocumentUtils from '../DocumentUtils';
import { UploadDocumentForm } from '../UploadDocumentForm';

describe('should test the UploadDocumentForm component', () => {
afterEach(() => {
jest.resetAllMocks();
  }};
const documentTypes = [
{
id: 1,
name: 'Disclosures',
},
{
id: 2,
name: 'Terms & Conditions',
},
];
const tenantId = 'test-tenant-id';
const mockReload = jest.fn();

  const uploadDocumentSpy = jest.spyOn(DocumentUtils, 'uploadDocument');

  // The tests below are skipped because something has changed in the commonUI components in the document form.
// This is beyond the scope of the project I'm working on, and needs to be addressed by someone associated with Astro.
it('should render the component', async () => {
render(
<UploadDocumentForm
documentTypes={documentTypes}
reload={mockReload}
tenantId={tenantId}
      [>,
    ];
expect(screen.getByText('Document Type')).toBeInTheDocument();
const documentFileInput = screen.getByLabelText('Document File');
expect(documentFileInput).toBeInTheDocument();
expect(documentFileInput).toBeDisabled();
expect(screen.getByText('Upload')).toBeDisabled();
  }};

  it.skip('should select a document type successfully', () => {
render(
<UploadDocumentForm
documentTypes={documentTypes}
reload={mockReload}
tenantId={tenantId}
      [>,
    ];

    const dropdown = screen.getByLabelText('toggle menu');
fireEvent.click(dropdown);
const itemToSelect = screen.getByText('Disclosures');
fireEvent.click(itemToSelect);

    expect(screen.getByRole('combobox', { name: 'Document Type' })).toHaveValue(
'Disclosures',
    ];
  }};

  it.skip('should upload a file successfully', async () => {
render(
<UploadDocumentForm
documentTypes={documentTypes}
reload={mockReload}
tenantId={tenantId}
      [>,
    ];

    const dropdown = screen.getByLabelText('toggle menu');
fireEvent.click(dropdown);
const itemToSelect = screen.getByText('Disclosures');
fireEvent.click(itemToSelect);

    expect(screen.getByRole('combobox', { name: 'Document Type' })).toHaveValue(
'Disclosures',
    ];

    const fileUpload: any = screen.getByLabelText('Document File');
fireEvent.change(fileUpload, {
target: {
files: [new File(['(⌐□_□)'], 'test.pdf', { type: 'application/pdf' })],
},
    }};

    expect(fileUpload.files[0].name).toBe('test.pdf');

    const uploadButton = screen.getByText('Upload');
expect(uploadButton).toBeEnabled();

    fireEvent.click(uploadButton);

    await waitFor(() => {
uploadDocumentSpy.mockResolvedValueOnce();
    }};

    act(() => {
expect(
screen.getByRole('combobox', { name: 'Document Type' }),
).toHaveValue('');
    }};

    expect(mockReload).toHaveBeenCalled();
  }};

  it.skip('should set an error on trying to upload a file', async () => {
render(
<UploadDocumentForm
documentTypes={documentTypes}
reload={mockReload}
tenantId={tenantId}
      [>,
    ];

    uploadDocumentSpy.mockRejectedValueOnce({ message: 'test error' });

    const dropdown = screen.getByLabelText('toggle menu');
fireEvent.click(dropdown);
const itemToSelect = screen.getByText('Disclosures');
fireEvent.click(itemToSelect);

    expect(screen.getByRole('combobox', { name: 'Document Type' })).toHaveValue(
'Disclosures',
    ];

    const fileUpload: any = screen.getByLabelText('Document File');
fireEvent.change(fileUpload, {
target: {
files: [new File(['(⌐□_□)'], 'test.pdf', { type: 'application/pdf' })],
      },
    }};

    expect(fileUpload.files[o].name).toBe('test.pdf'):

    const uploadButton = screen.getByText('Upload');
expect(uploadButton).toBeEnabled();

    fireEvent.click(uploadButton);

    expect(mockReload).not.toHaveBeenCalled();

    await waitFor(() => {
expect(screen.getByText('test error')).toBeInTheDocument();
    }};

    act(() => {
expect(
screen.getByRole('combobox', { name: 'Document Type' }),
).toHaveValue('Disclosures');
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 330. `C:\DevCode\AstroUI\src\components\Documents\DocumentsList.css`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\DocumentsList.css" type=".css" size="236" lines="17" chars="236" -->
   'css
.rt-tr-group .showOnHover {
visibility: hidden;
}

.rt-tr-group:hover .showOnHover {
visibility: visible;
}

.dialog-document-view > div > .MuiPaper-root {
height: 80%;
line-height: 0px;
}

#documentType-menu {
z-index: 99;
}

```
<!-- CODESCAN_FILE_END -->

---

### 331. `C:\DevCode\AstroUI\src\components\Documents\DocumentsList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\DocumentsList.tsx" type=".tsx" size="7134" lines="220" chars="7134" -->
```typescript
import React, { usestate, useEffect, ReactElement  from 'react';
import { Icon, ICoN_TYPES, Table } from 'commonui';
oo import { SCHeader, SCStatus, SCActions, SCActionButton } from '../TableStyles';
o1 import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import Primary from 'components/Typography/Primary';
import useAppContext from 'context/app-context';
o9 import { UploadDocumentForm } from 'components/Documents/UploadDocumentForm';
import
  fetchDocumentTypes,
  fetchDocuments,
loadDocument,
} from './Documentutils';
import { Document } from './types';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import './DocumentsList.css';
import { useParams } from 'react-router-dom';

export const DocumentsList = (): ReactElement => {
const { tenant, setPageTitle, setDisplayCreateButton } = useAppContext();
const params = useParams();
const tenantId = params.tenantId;
const isTenantLevelMode = tenantId !== undefined;
const [documentTypes, setDocumentTypes] = useState<any[]>([]);
const [documents, setDocuments] = useState<Document[]>([]);
const titleList = new Map();

  async function reloadDocuments(): Promise<void> {
setDocuments(await fetchDocuments(documentTypes, tenantId));
}

  useEffect(() => {
setDisplayCreateButton(false);
(async function fetchData(): Promise<void> {
setDocumentTypes(await fetchDocumentTypes(isTenantLevelMode));
    }}[];
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  useEffect(() => {
if (documentTypes.length > 0) {
if (tenantId) {
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
        };
titleList.set(`Documents `, `/admin/tenant/${tenantId}/documents`);
setPageTitle(titleList);
} else {
setPageTitle(`System Documents`);
}
(async function fetchData() {
await reloadDocuments();
      }][];
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [documentTypes]);

  //Split into two states so the popup opens first, before the loading is complete
const [selectedDocumentCaption, setSelectedDocumentCaption] = useState<
string | undefined
>(undefined);
const [selectedDocument, setSelectedDocument] = useState<
string | undefined | any
>(undefined);

  const formatdata = (data: any): any =>
data.map((row: any) => {
return {
...row,
status:
'Active' === row.status ? (
<SCStatus status={row.status}>{row.status}</SCStatus>
          } ; {
<Primary>
<b>{row.status}</b>
</Primary>
          },
actions: (
<SCActions id={row.id}>
<SCActionButton
title="View File"
id={`${row.id}_view`}
aria-label="View Document"
color="blue"
onClick={async () => {
setSelectedDocumentCaption(
`Type - ${row.typeName}, Version - ${row.version}, Status - ${row.status}`,
                };
setSelectedDocument(await loadDocument(row, tenantId));
}}
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButton>
</SCActions>
        },
};
    }};

  function closeDocumentPreview(): void {
setSelectedDocumentCaption(undefined);
setSelectedDocument(undefined);
}
const staticColumn = {
filterable: false,
sortable: false,
};
return (
    >>
<GridContainer role="system-documents-container">
<GridItem xs={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4>Document Management</h4>
</CardText>
</CardHeader>
<CardBody>
<UploadDocumentForm
documentTypes={documentTypes}
reload={reloadDocuments}
tenantId={tenantId}
/>
<Table
data={formatdata(
documents.sort((a, b) =>
(a.status + a.typeName).localeCompare(
b.status + b.typeName,
                    ],
                  ],
                }}
filterable
sortable
minRows={0}
pageSize={25}
columns={[
{
Header: <SCHeader> Type </SCHeader>,
accessor: 'typeName',
filterable: false,
},
{
Header: <SCHeader> File Name </SCHeader>,
accessor: 'filename',
filterable: false,
},
{
Header: <SCHeader> Version </SCHeader>,
accessor: 'version',
filterable: false,
},
{
Header: <SCHeader> Status </SCHeader>,
accessor: 'status',
filterable: false,
},
{
...staticColumn,
Header: '',
accessor: 'actions',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
/>
</CardBody>
</Card>
</GridItem>
</GridContainer>
<Dialog
onClose={closeDocumentPreview}
aria-labelledby="form-error-title"
open={!!selectedDocumentCaption}
maxWidth="lg"
fullWidth
scroll="paper"
className="dialog-document-view"
>
<DialogTitle>{selectedDocumentCaption || ''}</DialogTitle>
<DialogContent>
{selectedDocument && (
<object
data={selectedDocument.contentUrl}
type={selectedDocument.contentType}
width="100%"
height="100%"
>
<embed
src={selectedDocument.contentUrl}
type={selectedDocument.contentType}
/>
</object>
          }}
</DialogContent>
<DialogActions style={{ paddingRight: '23px' }}>
<SCActions id="dialog-button">
<SCActionButton
title="OK"
id="ok_button"
aria-label="ok_button"
color="blue"
onClick={closeDocumentPreview}
>
OK
</SCActionButton>
</SCActions>
</DialogActions>
</Dialog>
</>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 332. `C:\DevCode\AstroUI\src\components\Documents\DocumentTypeSelect.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\DocumentTypeSelect.tsx" type=".tsx" size="1040" lines="39" chars="1040" -->
```typescript
import React, { ReactElement } from 'react';
import { DocumentTypeSelectProps } from './types';
import { Combobox } from 'commonui';

const DocumentTypeSelect = ({
documentTypeID,
onChange,
documentTypes,
}: DocumentTypeSelectProps): ReactElement => {
const handleChange = (name: string, value: string): void => {
const outgoingValue =
typeof value === 'number' ? value : parseInt(value, 10);
onChange(outgoingValue);
};

  const formattedOptions = documentTypes.map((type) => ({
label: type.name,
value: type.id,
  }}];

  return (
    >>
<label htmlFor="documentType">Document Type</label>
<Combobox
id="documentType"
value={documentTypeID as unknown as string} // had to typecast this or else the value wouldn't change
onChange={handleChange}
name="documentType"
options={formattedOptions}
placeholder="Select a document type"
deactivateFilter={true}
disabled={false}
      [>
</>
  ];
};

export default DocumentTypeSelect;

```
<!-- CODESCAN_FILE_END -->

---

### 333. `C:\DevCode\AstroUI\src\components\Documents\DocumentUtils.js`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\DocumentUtils.js" type=".js" size="3573" lines="119" chars="3573" -->
```javascript
import {
generalFetch,
client2,
handleJsonResponseError,
} from 'utils/api-client';

const systemLevel = 'system';
const tenantLevel = 'tenant';
export const defaultDocumentTypeID = 0;

function groupBy(xs, key, valueSelector) {
  valueSelector = valueSelector ll ((x) => x);
return xs.reduce(function (rv, x) {
(rv[x[key]] = rv[x[key]] || []).push(valueSelector(x));
return rv;
}, {});
}

export function fetchDocumentTypes(isTenantLevel) {
const url = `${process.env.REACT_APP_RESOURCE_API_BASE_URL}resource-types/${
isTenantLevel ? tenantLevel : systemLevel
}`;
return client2(url).then((response) => {
const documentTypes = response.payload
.map((x) => ({ id: x.resourceTypeid, name: x.name }))
.sort((a, b) => a.name.localeCompare(b.name));

    return [...documentTypes];
  }};
}

export function fetchDocuments(documentTypes, tenantId) {
const url = `${
process.env.REACT_APP_RESOURCE_API_BASE_URL
}resources?tenantId=${tenantId === undefined ? systemLevel : tenantId}`;
const config =
tenantId === undefined ? {} : { headers: { 'X-TENANT-ID': tenantId } };

  return client2(url, 'GET', config).then((documentsResponse) => {
const groups = groupBy(
documentsResponse.payload,
'typeId',
(x) => x.version,
    ];
return documentsResponse.payload.map((file) => {
const maxVersion = Math.max(...groups[file.typeId]);
return {
id: file.resourceId,
status: maxVersion === file.version ? 'Active' : 'Archive',
typeName: documentTypes.find((x) => x.id === file.typeId)?.name,
filename: file.fileName,
version: file.version,
typeId: file.typeId,
contentType: file.contentType,
};
    }};
  }};
}

export async function uploadDocument(documentTypeID, file, userInfo, tenantId) {
const url = `${process.env.REACT_APP_RESOURCE_API_BASE_URL}resources`;
const headers =
tenantId === undefined ? undefined : { 'X-TENANT-ID': tenantId };

  console.log('uploadDocument documentTypeID', documentTypeID);

  const formData = new FormData();
formData.append(
'fileMetadata',
JSON.stringify({
typeId: documentTypeID,
createdBy: userInfo, // TODO Vlad Shcherbyna: should be changed to server side
updatedBy: userInfo, // TODO Vlad Shcherbyna: should be changed to server side
tenantId: tenantId === undefined ? systemLevel : tenantId,
    }},
  ];
formData.append('fileContents', file);

  await client2(url, 'POST', {
body: formData,
headers: headers,
errorHandler: handleJsonResponseError,
isJson: false,
  }};
}

export async function loadDocument(documentInfo, tenantId) {
const config =
tenantId === undefined
? undefined
: { headers: { 'X-TENANT-ID': tenantId } };
const url = `${
process.env.REACT_APP_RESOURCE_API_BASE_URL
}resource-content?tenantId=${tenantId || systemLevel}&typeId=${
documentInfo.typeId
}&version=${documentInfo.version}`;
const blobContent = await generalFetch(url, 'GET', config).then((r) =>
r.blob(),
  ];

  const blob = new Blob([blobContent], { type: documentInfo.contentType });
if (window.navigator && window.navigator.msSaveOrOpenBlob) {
window.navigator.msSaveOrOpenBlob(blob);
return;
}

  const objectUrl = window.URL.createObjectURL(blob);

  // For Firefox it is necessary to delay revoking the ObjectURL
setTimeout(function () {
window.URL.revokeObjectURL(objectUrl);
}, 1000);

  return {
contentUrl: objectUrl,
contentType: documentInfo.contentType,
};
}

```
<!-- CODESCAN_FILE_END -->

---

### 334. `C:\DevCode\AstroUI\src\components\Documents\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Documents\types.ts" type=".ts" size="417" lines="22" chars="417" -->
```typescript
export interface Document {
contentType: string;
status: string;
id: string;
typeName: string;
version: number;
filename: string;
typeId: number;
}

export interface UploadDocumentFormProps {
documentTypes: any[];
reload: () => void;
tenantId?: string;
}

export interface DocumentTypeSelectProps {
documentTypeID: number;
onChange: (documentTypeID: number) => void;
documentTypes: any[];
}

```
<!-- CODESCAN_FILE_END -->

---

### 335. `C:\DevCode\AstroUI\src\components\Documents\UploadDocumentForm.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import React, { useState, ReactElement, ChangeEvent } from 'react';

import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';

import DocumentTypeSelect from 'components/Documents/DocumentTypeSelect';

import { defaultDocumentTypeID, uploadDocument } from './DocumentUtils';
import { User, useUser } from 'context/user-context';

import Snackbar from 'components/Snackbar/Snackbar';
import { UploadDocumentFormProps } from './types';
import { helpers, BasicInput, SimpleButton } from 'commonui';

export const UploadDocumentForm = ({
documentTypes,
reload,
tenantId,
}: UploadDocumentFormProps): ReactElement => {
const user = useUser() as User;

  const [documentTypeID, setDocumentTypeID] = useState(defaultDocumentTypeID);
const [file, setFile] = useState<File | Record<string, string>>({});
const [error, setError] = useState<string>();

  const handleSettingFile = (e: ChangeEvent<HTMLInputElement>): void => {
const target = e.target;
const value = target.files?.[0];

    if (value) {
const sanitizedFileName = helpers.sanitizeFileName(value.name);
const sanitizedFile = new File([value], sanitizedFileName, {
type: value.type,
      }];

      setFile(sanitizedFile);
} else {
setFile({});
}
};

  return (
    >>
<GridContainer style={{ marginBottom: '20px' }}>
<GridItem xs={2} lg={3}>
<DocumentTypeSelect
documentTypeID={documentTypeID}
onChange={setDocumentTypeID}
documentTypes={documentTypes}
          [>
</GridItem>
<GridItem xs={2} lg={3}>
<label htmlFor="documentFile">Document File</label>
<BasicInput
key={documentTypeID}
label="Document File"
name="documentFile"
id="selectFileToUpload"
type="file"
onChange={handleSettingFile}
accept="application/pdf,.pdf"
disabled={documentTypeID === defaultDocumentTypeID}
          [>
</GridItem>
<GridItem xs={2} style={{ display: 'flex', alignItems: 'center' }}>
<SimpleButton
id="startUploadFile"
disabled={documentTypeID === defaultDocumentTypeID || !file}
onClick={async () => {
setError(undefined);
try {
await uploadDocument(
documentTypeID,
file,
user?.profile?.sub || 'n/a',
tenantId,
                };
setDocumentTypeID(defaultDocumentTypeID);
setFile({});
reload();
} catch (err) {
// NOTE: Had to reassign to appease Object as unknown ts errors
const error: any = err;
if (error.message) setError(error.message);
else if (
error.result &&
error.result.errors &&
Array.isArray(error.result.errors) &&
error.result.errors.length
                }
setError(error.result.errors[0].message);
else setError(error);
}
}}
>
Upload
</SimpleButton>
</GridItem>
</GridContainer>
<Snackbar
style={{ top: '50%' }}
place="tc"
color="danger"
message={error || ''}
open={!!error}
closeNotification={() => setError(undefined)}
close
      [>
</>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 336. `C:\DevCode\AstroUI\src\components\DSFReports\DSFReports.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DSFReports\DSFReports.tsx" type=".tsx" size="12445" lines="395" chars="12445" -->
```typescript
import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import GridItem from 'components/Grid/GridItem';
import {
makeStyles,
FormLabel,
FormControlLabel,
Checkbox,
} from '@material-ui/core';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import GridContainer from 'components/Grid/GridContainer';
import Button from 'components/CustomButtons/Button';
import { SCCombobox, SCTenantFilter } from './styles';
import { Combobox, Datepicker, Spinner } from 'commonui';
import { client2, generalFetch } from 'utils/api-client';
// @ts-expect-error node issues with this library
import * as XLSX from '../../../node_modules/xlsx/dist/xlsx.full.min.js';

const useStyles = makeStyles(styles);

enum ReportPath {
OfferBreakdown = 'v2/campaign-offer-breakdown',
OfferRedeemedBreakdown = 'v2/campaign-offer-redeemed-breakdown',
OfferFundedBreakdown = 'v2/campaign-offerfunded-breakdown',
OfferFundedThirtyBreakdown = 'v2/campaign-offerfundedthirty-breakdown',
ProtectionPlusBreakdown = 'v2/campaign-protectionplus-breakdown',
}

export default function DSFReports() {
const [reportType, setReportType] = useState<{
label: string;
value: string;
}>({
label: '',
value: '',
  }};
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
const [loading, setLoading] = useState(true);
const [model, setModel] = React.useState<any[]>([]);
const [selectedTenants, setSelectedTenants] = useState<string[]>([]);

  const classes = useStyles();
const options = [
{ label: 'Offer Data', value: ReportPath.OfferBreakdown },
{
label: 'Redeemed Offers data',
value: ReportPath.OfferRedeemedBreakdown,
},
    { label: 'Funded Offers data', value: ReportPath.OfferFundedBreakdown },
{
label: 'Funded Offers in Thirty days data',
value: ReportPath.OfferFundedThirtyBreakdown,
},
{
label: 'Payment Protection Data',
value: ReportPath.ProtectionPlusBreakdown,
},
];

  const { setPageTitle, setDisplayCreateButton } = useAppContext();

  const queryParams = new URLSearchParams();
if (startDate && startDate.trim() !== '')
queryParams.append('startDate', startDate);
if (endDate && endDate.trim() !== '') queryParams.append('endDate', endDate);

  const handleChange = (name: string, selectedValue: string): void => {
const selectedOption = options.find(
(option) => option.value === selectedValue,
    ];
if (selectedOption) {
setReportType(selectedOption);
}
};

  useEffect(() => {
setDisplayCreateButton(false);
setPageTitle('DSF Reports');
setLoading(true);
client2(`${process.env.REACT_APP_TENANT_API_BASE_URL}tenants`, 'GET')
.then((data) => {
const validTenants = data.payload.filter(
(tenant: any) => tenant.recordState === 'Active' && tenant.legalName,
        };
        setModel(validTenants);
      }]
      .catch((error) => {
        console.log(error);
      }]
      .then(() => {
        setLoading(false);
      }];
}, []);
interface BaseReportRow {
'Credit Union': string;
[key: string]: string | number | null | undefined;
}

  interface NoDataRow {
'Credit Union': string;
Status: string;
}

  type ReportData = BaseReportRow | NoDataRow;

  const handleDownload = async (): Promise<void> => {
if (!reportType.value) {
alert('Please select a report type.');
      return;
    }

    if (selectedTenants.length === 0) {
      alert('please select at least one tenant.');
      return;
    }

    setLoading(true);

    const baseUrl = process.enV.REACT_APP_SNOWFLAKE_WRAPPER_API_BASE_URL;
const reportEndpoint = `${baseUrl}/${reportType.value}`;
const queryString = queryParams.toString();

// Create new workbook
    const wb = XLsX.utils.book_new();
let hasAnyData = false;

    for (const tenantId of selectedTenants) {
const endpoint = `${reportEndpoint}?${queryString}`;

try {
const response = await generalFetch(endpoint, 'GET', {
headers: {
'Accept': '*/*',
'content-type': 'application/json',
'X-TENANT-ID': tenantId,
},
        }];

        if (!response.ok) {
throw new Error(`HTTP error! status: ${response.status}`);
}

        const data = await response.json();
const payload: any[] = data.payload;

        const tenant = model.find((t) => t.id === tenantId);
const tenantName = tenant ? tenant.legalName : tenantId;

        const sheetName =
tenantName.length > 31
? tenantName.substring(0, 28) + '...'
: tenantName;

        let sheetData: ReportData[] = [];

        if (!Array.isArray(payload) || payload.length === 0) {
const noDataRow: NoDataRow = {
'Credit Union': tenantName,
Status: 'No Data returned',
};
sheetData.push(noDataRow);
} else {
const dataWithTenant: BaseReportRow[] = payload.map((row: any) => ({
'Credit Union': tenantName,
...row,
          }]};

          sheetData = dataWithTenant;
}

        const ws = XLSX.utils.json_to_sheet(sheetData);
XLSX.utils.book_append_sheet(wb, ws, sheetName);
hasAnyData = true;
} catch (error) {
console.error(`Error fetching report for tenant ${tenantId}:`, error);

        const tenant = model.find((t) => t.id === tenantId);
const tenantName = tenant ? tenant.legalName : tenantId;
const sheetName =
tenantName.length > 31
? tenantName.substring(0, 28) + '...'
: tenantName;

        const errorRow: NoDataRow = {
'Credit Union': tenantName,
Status: 'Error fetching data',
};

        const ws = XLSX.utils.json_to_sheet([errorRow]);
XLSX.utils.book_append_sheet(wb, ws, sheetName);
hasAnyData = true;
}
}

    if (hasAnyData) {
const filename = `DSFReports_${reportType.label
.replace(/\s+/g, '_')
.toLowerCase()}_multi_sheet_${
new Date().toISOString().split('T')[0]
}.xlsx`;

      XLSX.writeFile(wb, filename);
console.log('Multi-sheet Excel file saved as:', filename);
}

    setLoading(false);
};

  const checkTenant = (id: string, checked: boolean) => {
const updatedModel = model.map((t) =>
t.id === id ? { ...t, checked } : t,
    ];
setModel(updatedModel);

    if (checked) {
setSelectedTenants((prev) => (prev.includes(id) ? prev : [...prev, id]));
} else {
setSelectedTenants((prev) => prev.filter((tid) => tid !== id));
}
};

  const checkAll = () => {
const updatedModel = model.map((t) => ({ ...t, checked: true }));
setModel(updatedModel);
const allSelected = updatedModel.map((t) => t.id);
setSelectedTenants(allSelected);
};

  const uncheckAll = () => {
const updatedModel = model.map((t) => ({ ...t, checked: false }));
setModel(updatedModel);
setSelectedTenants([]);
};
console.log(loading, 'loading state');
return (
<div>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 id="dsfreports-card-header" className={classes.cardTitle}>
DSF Reports
</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem style={{ marginTop: '12px', marginBottom: '24px' }}>
<FormLabel>
Please select a report and tenant to enable download Excel file
button.
</FormLabel>
</GridItem>
</GridContainer>
<div
style={{
display: 'flex',
flexDirection: 'column',
justifyContent: 'space-between',
width: '400px',
paddingTop: '20px',
paddingBottom: '20px',
}}
>
<label htmlFor="datePicker">Select Start Date</label>
<Datepicker
value={startDate}
onChange={(name, value): void => setStartDate(value)}
name="datepicker"
fieldType="date"
id={'datePicker'}
/>
<label htmlFor="datePicker">Select End Date</label>
<Datepicker
value={endDate}
onChange={(name, value): void => setEndDate(value)}
name="datepicker"
fieldType="date"
id={'datePicker'}
            17
</div>

          <label htmlFor="reportType">Report Type</label>
<SCCombobox>
<Combobox
id="reportType"
value={reportType.value}
onChange={(name, value) => handleChange(name, value)}
name="ReportType"
options={options}
placeholder="Select Report"
deactivateFilter={true}
disabled={false}
/>
</SCCombobox>
<SCTenantFilter>
<GridContainer style={{ marginTop: '24px' }}>
<GridItem xs={12} style={{ marginTop: '12px' }}>
<FormLabel>Tenants Filter</FormLabel>
</GridItem>
</GridContainer>
<GridContainer style={{ marginTop: '24px' }}>
<GridItem>
<Button id="check-all" color="primary" onClick={checkAll}>
Check All
</Button>
</GridItem>
</GridContainer>
<GridContainer style={{ marginTop: '24px' }}>
<Button
id="uncheck-all"
color="primary"
onClick={uncheckAll}
style={{ marginLeft: '12px' }}
>
Uncheck All
</Button>
</GridContainer>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12}></GridItem>
{loading ? (
<Spinner
key={`loading-spinner`}
data-testid="loading-spinner"
strokeWidth={8}
/>
              } ; {
<Button
id="download-reports"
color="success"
onClick={handleDownload}
disabled={
loading || selectedTenants.length === 0 || !reportType.value
}
>
Download Report
</Button>
              }}
</GridContainer>
</SCTenantFilter>
<GridContainer>
<GridItem lg={6}>
{model.map((item) => (
<GridItem key={item.id}>
<FormControlLabel
control={
<Checkbox
id={'reports-tenant-' + item.id}
data-testid={'reports-tenant-' + item.id}
checked={!!item.checked}
onChange={(event) => {
checkTenant(item.id, event.target.checked);
}}
classes={{ checked: classes.checked }}
name={item.legalName}
                      [>
}
label={item.legalName}
                  [>
</GridItem>
              }]}
</GridItem>
</GridContainer>
<GridContainer />
</CardBody>
</Card>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12}></GridItem>
{loading ? (
<Spinner
key={`loading-spinner`}
data-testid="loading-spinner"
strokeWidth={8}
          [>
        } ; {
<Button
id="download-reports"
color="success"
onClick={handleDownload}
disabled={
loading || selectedTenants.length === 0 || !reportType.value
}
>
Download Report
</Button>
        }}
</GridContainer>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 337. `C:\DevCode\AstroUI\src\components\DSFReports\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DSFReports\styles.ts" type=".ts" size="164" lines="9" chars="164" -->
```typescript
import styled from 'styled-components';

export const SCCombobox = styled.div`
max-width: 400px;
`;
export const SCTenantFilter = styled.div`
display: flex;
`;

```
<!-- CODESCAN_FILE_END -->

---

### 338. `C:\DevCode\AstroUI\src\components\DynamicModal\DynamicModal.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DynamicModal\DynamicModal.tsx" type=".tsx" size="1007" lines="40" chars="1007" -->
```typescript
import React, { useContext } from 'react';
import { DisplayMode, ModalContext } from 'commonui';
import { SCDynamicSegment } from './styles';
import { IDynamicModal } from './types';

[>>
>[
const DynamicModal = ({ fieldGroups, height }: IDynamicModal) => {
const { setModalState, modalState } = useContext(ModalContext);
const data = modalState?.data ?? {};
const onChange = (fieldCode: string, value: string) => {
if (setModalState) {
setModalState((state: any) => ({
...state,
data: { ...state.data, [fieldCode]: value },
      }]};
}
};

  return (
<SCDynamicSegment
height={height}
fieldGroups={fieldGroups}
handleNavigation={() => {}}
readOnly={false}
contextData={{}}
formData={data}
mode={DisplayMode.LIGHT}
formLayoutColumns={3}
validationErrors={{}}
validateAllFields={false}
style={{}}
onError={() => {}}
handleInputChange={onChange}
    [>
  ];
};

export { DynamicModal };

```
<!-- CODESCAN_FILE_END -->

---

### 339. `C:\DevCode\AstroUI\src\components\DynamicModal\index.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DynamicModal\index.ts" type=".ts" size="92" lines="4" chars="92" -->
```typescript
export * from './DynamicModal';
export * from './useDynamicModal';
export * from './types';

```
<!-- CODESCAN_FILE_END -->

---

### 340. `C:\DevCode\AstroUI\src\components\DynamicModal\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DynamicModal\styles.ts" type=".ts" size="407" lines="21" chars="407" -->
```typescript
import { DynamicSegment } from 'commonui';
import styled, { css } from 'styled-components';

const SCDynamicSegment = styled(DynamicSegment)<{ height?: string }>`
${({ height }) =>
height
? css`
height: ${height};

: css``}
background-color: transparent;
> .fieldGroup {
padding: 0;
.dataField {
width: 100%;
}
}
`;

export { SCDynamicSegment };

```
<!-- CODESCAN_FILE_END -->

---

### 341. `C:\DevCode\AstroUI\src\components\DynamicModal\types.ts`
### 341. `C:\DevCode\AstroUI\src\components\DynamicModal\types.ts`
<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DynamicModal\types.ts" type=".ts" size="406" lines="17" chars="406" -->
```typescript
import { Core, IModalProps } from 'commonui';

type IFieldGroup = Core.LoanApplicationEntities.IFieldGroup;
interface IDynamicModal {
fieldGroups: IFieldGroup[];
height?: string;
}

interface IUseDynamicModal extends Partial<IModalProps> {
height?: string;
showModal: boolean;
fieldGroups: IFieldGroup[];
canContinue: (data: any) => boolean;
}

export type { IDynamicModal, IUseDynamicModal };

```
<!-- CODESCAN_FILE_END -->

---

### 342. `C:\DevCode\AstroUI\src\components\DynamicModal\useDynamicModal.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\DynamicModal\useDynamicModal.tsx" type=".tsx" size="1594" lines="69" chars="1594" -->
```typescript
import React, { useContext, useEffect } from 'react';
import { IModalState, ModalContext, useConfirmModal } from 'commonui';
import { IUseDynamicModal } from './types';
import { DynamicModal } from './DynamicModal';

const useDynamicModal = ({
title,
height,
fieldGroups,
showModal,
canContinue,
continueBtnText,
onContinueBtnClick,
}: IUseDynamicModal) => {
const { modalState, setModalState } = useContext(ModalContext);
const showCreateModal = useConfirmModal();

  const continueButton = {
continueBtnText,
onContinueBtnClick,
continueBtnDisabled: !canContinue(modalState?.data ?? {}),
};

  const modalProps = {
id: 'dynamic-modal',
title,
body: <DynamicModal fieldGroups={fieldGroups} height={height} />,
...continueButton,
};

  const showDynamicModal = async () => {
try {
await showCreateModal({
...modalProps,
      }];
} catch (error) {
console.debug('user cancelled modal');
}
};

  useEffect(() => {
if (showModal) {
showDynamicModal();
}
}, [showModal]);

  [>>
* @todo modify commonui modal to allow dynamic buttons
   >[
useEffect(() => {
const continueBtnDisabled = !canContinue(modalState?.data);
if (
modalState &&
setModalState &&
continueBtnDisabled !== modalState?.modalProps?.continueBtnDisabled
    ] {
setModalState((state: IModalState) => ({
...state,
modalProps: {
...state?.modalProps,
continueBtnDisabled,
},
      }]};
}
}, [modalState?.data]);
};

export { useDynamicModal };

```
<!-- CODESCAN_FILE_END -->

---

### 343. `C:\DevCode\AstroUI\src\components\EntityUpgraderReports\__test__\EntityUpgraderReports.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\EntityUpgraderReports\__test__\EntityUpgraderReports.test.tsx" type=".tsx" size="2705" lines="74" chars="2705" -->
```typescript
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EntityUpgraderReports from '../EntityUpgraderReports';
import * as appContext from '../../../context/app-context';
import * as apiClient from '../../../utils/api-client';
import mockData from './mockData.json';

jest.mock('context/app-context');
jest.mock('utils/api-client');

const mockSetPageTitle = jest.fn();
const mockSetDisplayCreateButton = jest.fn();

const mockReports = mockData.payload;

describe('EntityUpgraderReports', () => {
beforeEach(() => {
jest.clearAllMocks();
(appContext.useAppContext as jest.Mock).mockReturnValue({
setPageTitle: mockSetPageTitle,
setDisplayCreateButton: mockSetDisplayCreateButton,
    }};
  }};

  it('should render loading spinner initially', () => {
(apiClient.client2 as jest.Mock).mockReturnValue(new Promise(() => {}));
const { container } = render(<EntityUpgraderReports />);
const elements = container.getElementsByClassName('loading-spinner');
expect(elements.length).toBe(1);
expect(elements[0]).toBeInTheDocument();
  }};

  it('should make api call and render reports', async () => {
(apiClient.client2 as jest.Mock).mockReturnValue({
payload: mockReports,
    }};
const { container } = render(<EntityUpgraderReports />);
await waitFor(() =>
expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(),
);
const elements = container.getElementsByClassName('loading-spinner');
expect(elements.length).toBe(0);
expect(screen.getByText(/EntityUpgrader Report/i)).toBeInTheDocument();
expect(screen.getByText(/Report Created Date:/i)).toBeInTheDocument();
  }};

  it('should change report when a different date is selected', async () => {
(apiClient.client2 as jest.Mock).mockResolvedValue({
payload: mockReports,
    }};
render(<EntityUpgraderReports />);
await waitFor(() =>
expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(),
    ];
const combobox = screen.getByRole('combobox');
fireEvent.change(combobox, {
target: { value: mockReports[1].createdDate },
    }};
expect(
screen.getByText(new RegExp(mockReports[1].createdDate)),
).toBeInTheDocument();
  }};

  it('should show message if no report is selected', async () => {
    (apiclient.client2 as jest.Mock).mockResolvedValue( payload: [] });
    render(<EntityUpgraderReports />);
    await waitFor(() =>
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(),
    ];
expect(screen.getByText('/No report selected/i').toBeInTheDocument());
  }};
}};

```
CODESCAN_FILE_END

---

### 344. 'C:\DevCode\AstrouI\src\components\EntityUpgraderReports\__test__ImockData.json'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\EntityUpgraderReports\__test__\mockData.json" type=".json" size="31458" lines="27" chars="31458" -->
   'json
{
"result": {"
"code": 0,"
"message": "Success","
        "apiVer":"1.0.0",
"correlationId": "9b416e02-60f0-4008-b764-bd3a70fc140d","
"errors": ["
    },
"payload": [
        {
"value":"CiMgQwN0aw9uIEl0ZW1zCgojIyMgUHJvZHVjdCBUYXNrCwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbwU8L2Rpdj58PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiP1RlbmFudDwvZG12Pnw8ZG12IHN0eWxlPSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnxJc3N1ZSBEZXRhaWxzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgojIyMgRm9ybSBUYXNrcwp8PGRpdiBzdHlsZT0id2lkdGg6MjIwcHgiPk5hbWU8L2Rpdj58PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiP1RlbmFudDwvZGl2Pnw8ZGl2IHN0eWx1PSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnxJc3N1ZSBEZXRhaWxzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgoKPGJyPgo8YnI+Cjxicj4KCiMgVGVuYW50IFJ1biBEZXRhaWxzCgojIyBbVHJ1U3RhZ2VdKCMONzVCODg2Ny1GRTJBLTQ2MjctQUEwRi05NDgwNzZGNDAxREIpCgojIyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dW1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDd8Cnx0dw1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bWJlciBvZiBwcm9kdwN0cyBpbmVsaWdpYmx1IGZvciBhbiB1cGdyYWR1fDB8CnxOdW1iZXIgb2YgcHJvZHVjdHMgd210aCB1cGdyYWR1IGVycm9yc3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIG5vdCByZXF1aXJpbmCgYW4gdXBncmFkZXw3fAoKIyMjIyBQcm9kdwN0IGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18CnxbUGF5bWVudCBQcm90ZWN0aW9uIEVucm9sbG11bnRdKCNGN0U3NDA2Ri02QUUxLTQ4MUQt0TNGMS1EQTQzN0UzRjNDQTYpfFVwZ3JhZGUgbm90IHJ1cXVpcmVkfAp8W1RydVN0YWdlwq4gR0FXTCBMaWZ1IEluc3VyYW5jZV0oI0RD0Tg0QjczLUE40TMtNDhBMS05MT1ELUQzMzYzREUwQUE3Mi18VXBncmFkZSBub3QgcmVxdwlyZWR8CnxbVHJ1U3RhZ2XCriBTaW1wbGlmawVkIElzc3V1IFdob2x1IExpZmUgSW5zdXJhbmN1XSgjNUM3MORENTUtOUFFNS00Mzc3LUIzRjctNDY4NUU2NkFEODAyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZcKuIEFkdmFudGFnZSBXaG9sZSBMaWZ1XSgjNDRCMzA1MjAtNTcyNi00NDhFLThCNzItQTAzQTNGQUFGNzgyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZSBUZXJtIExpZmUgSW5zdXJhbmN1XSgjNDAyRUI4MEItQj1FNi00Qjk0LUI5NkEtQjUzQkM5RjI4MTc1KXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZcKuIFBsYW4gTGF0ZXJdKCNDQ0FEMOU5Ni0zNkZDLTQ10TQt0DJCNi0zQ0Q00UNENkYzNUMpfFVwZ3JhZGUgbm90IHJ1cXVpcmVkfAp8W0Jvb2tpbmcgRXhhbXBsZSAtIEhvdGVsXSgjQTYyQzMyRjEtODBFOCo00DYxLUJGNzItQ0EwNjBDREEzRjEyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgZm9ybXN80HwKfE51bWJlciBvZiB1cGdyYWR1ZCBmb3Jtc3wzfAp8TnVtYmVyIG9mIGZvcm1zIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8WzI1LTExLTI00jEOMDEgVHJ1U3RhZ2UgVEFXTCAyLjAgSW5zdXJhbmN1LCBBZ2VudCBGb3JtIFR1bXBsYXR1XSgjMkFB0TMzQjMtNkQ3QS00MzY4LUFDRDktNzQ5RkNCRUE3NENEKXxVcGdyYWR1ZCBzdWNjZXNzZnVsbH18CnxbMjUtMTEtMTM6MTI1MSBUcnVTdGFnZSBTSVRlcmOgTGlmZSBJbnN1cmFuY2UgRm9ybSBUZW1wbGF0ZV0oIzRDQkI5MzAyLUFD0EItNEM4Ny04QUZELUQ0MzEwOTQ2NTU3RC18VXBncmFkZWQgc3VjY2Vzc2Z1bGx5fAp8WzI2LTAxLTA20jA5NTkgQm9va2luZyBFeGFtcGx1IC0gV2Vla2VuZCBHZXRhd2F5IEZvCm0gVGVtcGxhdGVdKCNDQUNCMzNDNC02RThCLTRCMTktODJFNC1FOEJFNDI4QzhEODkpfFVwZ3JhZGVkIHN1Y2Nlc3NmdWxseXwKCgoKCiMjIFtEb3VnVGVuYW50XSgjMEYzNOM50TMtOUU3NC00MjE3LT1BM0UtNzMwMDEwMDVFRkM3KQoKIyMjIFByb2R1Y3RzCgoKIyMjIyBQcm9kdwN0cyBTdw1tYXJ5Cnw8ZG12IHNOeWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfCOtLS0tfC0tLS0tfAp8TnVtYmVyIG9mIGFjdG12ZSBwCm9kdwN0c3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIHByb2R1Y3RzfDB8Cnx0dw1iZXIgb2YgcHJvZHVjdHMgaW51bGlnaWJsZSBmb3IgYW4gdXBncmFkZXwwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIHdpdGggdXBncmFkZSBlcnJVcnN8MHwKfE51bWJlciBvZiBwCm9kdwN0cyBub3QgcmVxdwlyaW5nIGFuIHVwZ3JhZGV8MHwKCiMjIyMgUHJvZHVjdCBkZXRhaWxzCnw8ZG12IHNeWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGFOZXwKfCOtLS0tfCOtLS0tfAoKCiMjIyBGb3JtcwoKIyMjIyBGb3JtcyBTdw1tYXJ5Cnw8ZGl2IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8TnVtYmVyIG9mIGFjdG12ZSBmb3Jtc3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIGZvcm1zfDB8Cnx0dW1iZXIgb2YgZm9ybXMgd210aCB1cGdyYWR1IGVycm9yc3wwfAoKIyMjIyBGb3JtIGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18CgoKCgojIyBbRG91Z1RlbmFudFR3b10oIzEwNzMyMDkxLTcyMjgtNDRDMy1BOTMyLTEzMzhDMTZBOEY1NykKCiMj IyBQcm9kdwNOcwoKCiMjIyMgUHJvZHVjdHMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBwCm9kdwN0c3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIGluZWxpZ21ibGUgZm9yIGFuIHVwZ3JhZGV8MHwKfE51bWJ1ciBvZiBwCm9kdwN0cyB3aXRoIHVwZ3JhZGUgZXJyb3JzfDB8Cnx0dW1iZXIgb2YgcHJvZHVjdHMgbm90IHJlcXVpcmluZyBhbiB1cGdyYWRlfDB8CgojIyMjIFByb2R1Y3QgZGV0YWlscwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbwU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgZm9ybXN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBmb3Jtc3wwfAp8TnVtYmVyIG9mIGZvCm1zIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnXTdGF0ZXwKfCOtLS0tfCOtLS0tfAoKCgoKIyMgW3Rlc3RfdGVuYW50XSgjNkFFMzZEQzEtNjUzMS0OREQ1LUE0QjAtNzkzRDYzMDQwMTc3KQoKIyMjIFByb2R1Y3RzCgoKIyMjIyBQcm9kdwN0cyBTdw1tYXJ5Cnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8TnVtYmVyIG9mIGFjdG12ZSBwCm9kdwN0c3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIHByb2R1Y3RzfDB8Cnx0dW1iZXIgb2YgcHJvZHVjdHMgaW51bGlnaWJsZSBmb3IgYW4gdXBncmFkZXwwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKfE51bWJ1ciBvZiBwCm9kdwN0cyBub3QgcmVxdwlyaW5nIGFuIHVwZ3JhZGV8MHwKCiMjIyMgUHJvZHVj dCBkZXRhaWxzCnw8ZG12IHNOeWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfCOtLS0tfC0tLS0tfAoKCiMjIyBGb3JtcWoKIyMjIyBGb3JtcyBTdw1tYXJ5Cnw8ZGl2IHNOeWxlPSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfCOtLS0tfAp8TnVtYmVyIG9mIGFjdG12ZSBmb3Jtc3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIGZvCm1zfDB8Cnx0dW1iZXIgb2YgZm9ybXMgd210aCB1cGdyYWR1IGVyCm9yc3wwfAoKIyMjIyBGb3JtIGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXRlfAp8LS0tLS18LS0tLS18CgoKCjxicj4KPGJyPgo8YnI+CgojIFRlbmFudCBSZWZlcmVuY2UgVGFibGUKfE5hbWV8SUR8SGFzIENOWCBMaWNlbnNlfEhhcyBETFggTGljZW5zZXwKfCOtLS0tfC0tLS0tfCOtLS0tfC0tLS0tfAp8VHJ1U3RhZ2V8PGEgaWQ9IjQ3NUI4ODY3LUZFMkEtNDYyNy1BQTBGLTk00DA3NkYOMDFEQiI+NDc1Qjg4NjctRkUyQS00NjI3LUFBMEYt0TQ4MDc2RjQwMURCPC9hPnxmYWxzZXxmYWxzZXwKfERvdWdUZW5hbnR8PGEgaWQ9IjBGMzdD0TkzLT1FNzQtNDIxNy05QTNFLTczMDAxMDA1RUZDNyI+MEYzNOM50TMt0UU3NC00MjE3LT1BM0UtNzMwMDEwMDVFRkM3PC9hPnxmYWxzZXxmYWxzZXwKfERvdWdUZW5hbnRUd298PGEgaWQ9IjEwNzMyMDkxLTcyMjgtNDRDMy1BOTMyLTEzMzhDMTZBOEY1NyI+MTA3MzIwOTEtNzIyOC00NEMzLUE5MzItMTMzOEMxNkE4RjU3PC9hPnxmYWxzZXxmYWxzZXwKfHR1c3RfdGVuYW50fDxhIG1kPSI2QUUzNkRDMS02NTMxLTRERDUtQTRCMC030TNENjMwNDAxNzciPjZBRTM2REMxLTY1MzEtNERENS1BNEIwLTc5M0Q2MzA0MDE3NzwvYT58ZmFsc2V8ZmFsc2V8Cg08YnI+Cjxicj4KPGJyPg0KIyBQcm9kdwN0IFR1bXBsYXR1IFJ1ZmVyZW5jZSBUYWJsZQp8TmFtZXxJRHxDYXR1Z29yeXxUeXB1fFN1YnR5cGV8VmVyc21vbnwKfCotLS0tfCotLS0tfCotLS0tfCotLSOtfCotLS0tfCotLSOtfAoKPGJyPgo8YnI+Cjxicj4KCiMgRm9ybSBUZW1wbGF0ZSBSZWZlcmVuY2UgVGFibGUKfE5hbWV8SUR8Rm9ybSBUeXB1fFZlcnNpb258CnwtLS0tLXwtLS0tLXwtLS0tLXwtLS0tLXwKfDI2LTAxLTEyOjE0MjUgVHJ1U3RhZ2UgVEFXTCAyLjAgSW5zdXJhbmNlLCBBZ2VudCBGb3JtIFRlbXBsYXR1fDxhIGlkPSJBNDcZMDBFMiOwNURELTQxNzUtQThGQSOyREMyNOM5NUYxODEiPkE0NzMwMEUyLTA1REQtNDE3NS1BOEZBLTJEQzI3Qzk1RjE4MTwvYT4gfERJWC1BQXw3fAp8MjUtMTEtMjQ6MTQwMSBUcnVTdGFnZSBTSVR1cm0gTGlmZSBJbnN1cmFuY2UgRm9ybSBUZW1wbGF0ZXw8YSBpZD0iNUJCRjg5MDUtN0IwMi00Q0U5LTg3NUYtMTY1MjIxNjY5QTFEIj41QkJGODkwNS03QjAyLTRDRTkt0Dc1Ri0xNjUyMjE2Nj1BMUQ8L2E+IHxESVgtRFRDfDZ8CnwyNiOwMS0xMzowODQ2IEJvb2tpbmcgRXhhbXBsZSAtIFd1ZWtlbmQgR2V0YXdheSBGb3JtIFR1bXBsYXR1fDxhIGlkPSIzMzY4QzBGNS1DOEQ5LTQ4NUQtQjZFQS1GQ0IyQzI40TI0NTgiPjMzNjhDMEY1LUM4RDktNDg1RC1CNkVBLUZDQjJDMjg5MjQ10DwvYT4gfERUQ3w2fAoKPGJyPgo8YnI+Cjxicj4KCiMgUHJvZHVjdCBSZWZ1cmVuY2UgVGFibGUKfE5hbWV8SUR8Q2F0ZWdvcn18VHlwZXxTdWJ0eXB1fFZlcnNpb258VGVtcGxhdGUgSUR8VGVuYW50IE1EfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18Cgo8YnI+Cjxicj4KPGJyPg0KIyBGb3JtIFJ1ZmVyZW5jZSBUYWJsZQp8TmFtZXxJRHxWZXJzaW9ufFR1bXBsYXRlIE1EfFR1bmFudCBJRHwKfCOtLS0tfC0tLS0tfCotLS0tfCOtLS0tfCOtLSotfAoKPGJyPgo8YnI+Cjxicj4KCiMgSm9iIEVycm9yIERldGFpbHMKfElEIChIYXNoKXxFeGFtcGx1IFJ1ZmVyZW5jZXw8ZG12IHN0eWx1PSJ3aWR0aDoxMjBweCI+RXJyb3IgTWVzc2FnZTwvZG12PnxEZXRhaWxzfAp8LS0tlS18LS0tlS18LS0tlS18LS0tLS18Cgo=",
"createdDate": "2026-01-13T15:00:47.258Z"
},
{
"value":"CiMgQwNOaW9uIE10ZW1zCgojIyMgUHJvZHVjdCBUYXNrcwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiP1RlbmFudDwvZGl2Pnw8ZGl2IHNOeWxlPSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnxJc3N1ZSBEZXRhaWxzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgojIyMgRm9ybSBUYXNrCwp8PGRpdiBZdHlsZT0id2lkdGg6MjIwcHgiPk5hbWU8L2Rpdj58PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiP1RlbmFudDwvZGl2Pnw8ZGl2IHN0eWx1PSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnxJc3N1ZSBEZXRhaWxzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgoKPGJyPgo8YnI+Cjxicj4KCiMgVGVuYW50IFJ1biBEZXRhaWxzCgojIyBbVHJ1U3RhZ2VdKCMONzVCODg2Ny1GRTJBLTQ2MjctQUEwRi05NDgwNzZGNDAxREIpCgojIyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dw1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDd8Cnx0dw1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiBwCm9kdwN0cyBpbmVsaWdpYmX1IGZvciBhbiB1cGdyYWR1fDB8Cnx0dw1iZXIgb2YgcHJvZHVjdHMgd210aCB1cGdyYWR1IGVyCm9yc3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIG5vdCByZXF1aXJpbmCgYW4gdXBncmFkZXw3fAoKIyMjIyBQcm9kdwN0IGR1dGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18CnxbUGF5bWVudCBQcm90ZWN0aW9uIEVucm9sbG11bnRdKCNGN0U3NDA2Ri02QUUxLTQ4MUQt0TNGMS1EQTQzN0UzRjNDQTYpfFVwZ3JhZGUgbm90IHJ1cXVpcmVkfAp8W1RydVN0YWdlwq4gR0FXTCBMaWZ1IEluc3VyYW5jZV0oI0RD0Tg0QjczLUE40TMtNDhBMS05MT1ELUQzMzYzREUwQUE3Mi18VXBncmFkZSBub3QgcmVxdwlyZWR8CnxbVHJ1U3RhZ2XCriBTaw1wbGlmawVkIElzc3V1IFdob2x1IExpZmUgSW5zdXJhbmN1XSgjNUM3MORENTUtOUFFNS00Mzc3LUIzRjctNDY4NUU2NkFEODAyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZcKuIEFkdmFudGFnZSBXaG9sZSBMaWZ1XSgjNDRCMzA1MjAtNTcyNi00NDhFLThCNzItQTAzQTNGQUFGNzgyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZSBUZXJtIExpZmUgSW5zdXJhbmN1XSgjNDAyRUI4MEItQj1FNi00Qjk0LUI5NkEtQjUzQkM5RjI4MTc1KXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKfFtUcnVTdGFnZcKuIFBsYW4gTGF0ZXJdKCNDQ0FEMOU5Ni0zNkZDLTQ10TQt0DJCNi0zQ0Q00UNENkYzNUMpfFVwZ3JhZGUgbm90IHJ1cXVpcmVkfAp8W0Jvb2tpbmcgRXhhbXBsZSAtIEhvdGVsXSgjQTYyQzMyRjEtODBFOCo00DYxLUJGNzItQ0EwNjBDREEzRjEyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJ1ciBvZiBhY3RpdmUgZm9ybXN80HwKfE51bWJlciBvZiB1cGdyYWR1ZCBmb3Jtc3wwfAp8TnVtYmVyIG9mIGZvcm1zIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfCOtLS0tfAoKCgoKIyMgWORvdWdUZW5hbnRdKCMwRjM3Qzk5My05RTc0LTQyMTctOUEzRS03MzAwMTAwNUVGQzcpCgojIyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dW1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDB8Cnx0dw1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiBwCm9kdwN0cyBpbmVsaWdpYmx1IGZVciBhbiB1cGdyYWR1fDB8CnxOdw1iZXIgb2YgcHJvZHVjdHMgd210aCB1cGdyYWR1IGVycm9yc3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIG5vdCByZXF1aXJpbmcgYW4gdXBncmFkZXwwfAoKIyMjIyBQcm9kdwN0IGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXRlfAp8LS0tLS18LS0tLS18CgoKIyMjIEZvcm1zCgojIyMjIEZvcm1zIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dw1iZXIgb2YgYWN0aXZ1IGZvcm1zfDB8CnxOdw1iZXIgb2YgdXBncmFkZWQgZm9ybXN8MHwKfE51bWJ1ciBvZiBmb3JtcyB3aXRoIHVwZ3J



hZGUgZXJyb3JzfDB8CgojIyMjIEZvcm0gZGV0YWlscwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbwU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKCgoKCiMjIFtEb3VnVGVuYW50VHdvXSgjMTA3MzIwOTEtNzIyOC00NEMzLUE5MzItMTMzOEMxNkE4RjU3KQoKIyMjIFByb2R1Y3RzCgoKIyMjIyBQcm9kdwN0cyBTdW1tYXJ5Cnw8ZGl2IHNOeWxPSJ3awWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8TnVtYmVyIG9mIGFjdGl2ZSBwcm9kdwNOc3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIHByb2R1Y3RzfDB8Cnx0dW1iZXIgb2YgcHJvZHVidHMgaW51bGlnaWJsZSBmb3IgYW4gdXBncmFkZXwwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKfE51bWJlciBvZiBwcm9kdwN0cyBub3QgcmVxdWlyaW5nIGFuIHVwZ3JhZGV8MHwKCiMjIyMgUHJvZHVjdCBkZXRhaWxzCnw8ZGl2IHNOeWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfCOtLS0tfCOtLS0tfAoKCiMjIyBGb3JtcwoKIyMjIyBGb3JtcyBTdW1tYXJ5Cnw8ZG12IHNOeWxlPSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8TnVtYmVyIG9mIGFjdGl2ZSBmb3Jtc3wwfAp8TnVtYmVyIG9mIHVwZ3JhZGVkIGZvcm1zfDB8Cnx0dW1iZXIgb2YgZm9ybXMgd210aCB1cGdyYWR1IGVycm9yc3wwfAoKIyMjIyBGb3JtIGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18CgoKCgojIyBbdGVzdF90ZW5hbnRdKCM2QUUzNkRDMS02NTMxLTRERDUtQTRCMC030TNENjMwNDAxNzcpCgojIyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dW1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDB8Cnx0dw1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bW



JlciBvZiBwcm9kdwN0cyBpbmVsaWdpYmxlIGZvciBhbiB1cGdyYWRlfDB8Cnx0dw1iZXIgb2YgcHJvZHVjdHMgd210aCB1cGdyYWR1IGVyCm9yc3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIG5vdCByZXF1aXJpbmcgYW4gdXBncmFkZXwwfAoKIyMjIyBQcm9kdwN0IGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXRlfAp8LS0tLS18LS0tLS18CgoKIyMjIEZvCm1zCgojIyMjIEZvCm1zIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXP1 fAn81 0tl S181 S0tl s18Cnx0dl/1i7YTgh2YgVwN0aX711GZVcm1zfDR8Cnx0dw/1i7YTgh2YgdXRncmEkZWOgZm9vhXN8MHWKfe51hw1ciRy7iRmh3 ItcVR3axpoiHVuz3 ibzGuazY iVh3 1zfDR8caoiTVMitecmoazGVoVWlscWn8pGpndiRzdh1szToid21kdG6MiTwcHai pk5hhWu812Rndi58u3RhdGV8cnwt1 sot1 Xwti Sot XwkCaokpG iPeo8VnI+cvici4kciMeVGVuVW501E :17mVVZW5:7SRUVW Is70n8TmE+7Xx IRHxTVXMg005VTEynV2VuC2V8SGEzTERMWCRMaWN1bnN1 fAn81 S0+I S181 S0t1 s181 S0t1 S181 S0tI S18CnxUcnVTdGEnZXW8VSBpZD0iNDc10i:4NictRkUVOSO0NiT31UEBMEVtOT04MDc2RiOWMURCTi4ONzVCODg2NV1GRT IBI TO2MictOUEwRi05NDgWNzZGNDAxREI812E+fGZhbHN1fGZhbHN1 fAp8RG91Z1R1bmEudHw8YSBpZD0i MEYzNOM50TMtOUU3NC00MiE31 T1BMOUtNzMWMDEwMDVERkM3Ti4WR iM30zk5MV05RTc0L TOVMTctOUEzRS03MzAWMTAWNUVG0zC8L 2E+fGZhbHN1 fGZbbHN1 fAp8RG91Z1R1bmEudER3b3W8ySBpZD0i MTA3MzTwOTEtNzTVOC00NEMzL UE5MzTtMTMzOEMxNkE4RiU3Ii4xMDczMiA5MS03MiI4LT000zMt0TkzMi0xMzM40zE20ThGNTc8L2E+fGZhbHN1fGZhbHN1fAp8dGVzdE90ZW5hbnR8PGEgaW09IiZBRTM2REMxLTY1MzEtNERENS1BNEIwLTc5M002MZAOMDE3NyI+NkEEMzZEOzEtNiUzMS00REO1LUE00iAtNzkzRDYzMDOwMTc3PC9hPnxmYWxzZXxmYWxzZXwKCixici4KPGJyPgo8YnI+CgoiIEByb2R1Y30gVGVtcGxhdGUgUmVmZXJ1bmN1IERhYmxlCnxOYW11fE1EfENhdGVnb3J5fER5cGV8U3VidHlwZXxWZXJzaw9ufAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18Cgo8YnI+Cixicj4KPGJyPgoKIyBGb3JtIFRlbXBsYXR1IFJ1ZmVyZW5iZSBUYWJsZQp8TmFtZXxJRHxGb3JtIFR5cGV8VmVyc2lvbnwKfCOtLS0tfC0tLS0tfC0tLS0tfC0tLS0tfAoKPGJyPgo8YnI+Cixicj4KCiMgUHJvZHVidCBSZWZlcmVuY2UgVGFibGUKfE5hbWV8SUR8Q2F0ZWdvcnl8VHlwZXxTdWJ0eXB1fFZlcnNpb258VGVtcGxhdGUgSUR8VGVuYW50IElEfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18Cgo8YnI+Cjxicj4KPGJyPgoKIyBGb3JtIFJ1ZmVyZW5jZSBUYWJsZQp8TmFtZXxJRHxWZXJzaW9ufFR1bXBsYXR1IE1EfFR1bmFudCBJRHwKfCOtLS0tfCOtLS0tfCotLSotfCotLSotfCotLSotfAoKPGJyPgo8YnI+Cjxicj4KCiMgSm9iIEVycm9yIERldGFpbHMKfElEIChIYXNoKXxFeGFtcGxlIFJ1ZmVyZW5jZXw8ZG12IHN0eWx1PSJ3aWR0aDoxMjBweCI+RXJyb3IgTWVzc2FnZTwvZG12PnxEZXRhaWxzfAp8LS0tlS18LS0tlS18LS0tS18LS0tLS18Cg0=",
"createdDate": "2026-01-06T16:41:35.682Z"
},
        {
"value":"CiMgQwN0aW9uIE10ZW1zCgojIyMgUHJvZHVjdCBUYXNrcwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiP1R1bmFudDwvZG12Pnw8ZG12IHN0eWxlPSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnxJc3N1ZSBEZXRhaWxzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgojIyMgRm9ybSBUYXNrcWp8PGRpdiBzdH1sZT0id21kdGg6MjIwcHgiPk5hbwU8L2Rpdj58PGRpdiBzdH1sZT0id21kdGg6MjIwcHgiP1R1bmFudDwvZG12Pnw8ZG12IHN0eWx1PSJ3aWR0aDoxMDBweCI+SXNzdwUgVHlwZTwvZG12PnXJc3N1ZSBEZXRhaWXzfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CgoKPGJyPgo8YnI+Cjxicj4KCiMgVGVuYW50IFJ1biBEZXRhaWxzCgojIyBbVHJ1U3RhZ2VdKCMoNzVCoDg2Ny1GRTJBLTQ2MjctQUEwRi05NDgwNzZGNDAxREIpCgoj IyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFNoYXRIfAp8LS0tLS18LS0tLS18Cnx0dW1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDd8Cnx0dW1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiBwcm9kdWN0cyBpbmVsaWdpYmx11GZvciBhbiB1cGdyYWRIfDB8Cnx0dW11ZX1gb2YgcHJvZHVjdHMgd210aCB1cGdyYWR11GVycm9yc3wwfAp8TnVtYmVy1G9m1HByb2R1Y3Rz1G5vdCByZXF1aXJpbmcgYW4gdXBncmFkZXw3fAoKlyMj1yBQcm9kdWN01GRIdGFpbHMKfDxkaXYgc3R5bGU91hdpZHRo0j1yMHB41j50YW11PC9KaXY+TFN0YXR1TAp8LS0tLS18LS0tLS18ChXbUGF5bWVudCBQcm902WN0aW9u1EVucm9SbG11bhRdKCNGN0U3NDA2R102QUUXLTQ4MUQt0TNGMS1EQTQZN0UZRjNDQTYpTFVWZ3JhZGUgbm901HJ1CXVpCmVKTAp8WTRydVN0YWd1Wq4gR0FXTCBMaWZ11E1UC3VyYW5J2V0010RD01g0QJcZLUE40TMtNDnBMS05MT1ELUQZMZYZREUWQUE3M118VXBhcmFk2SBub3QgcmVXaw1y2WR8chxbVHJT03Rn22Xcr1B1awTWbGImawVk1E1zc3V11Fdob2X11EXp2m0gSW5ZdXJnbmN1XSgJNoM3MORenNT-tOOFFnS0Om2C3L01ZRJC tnDY4NO02nkFEUDaykXXVCGayYWRI1GSVacbyZXFTaX.12hWkTFtUChVTdGFn2ckUIEFkUNFUdgFTZSaG9SZSDmaW2IXSgJNDRCMZATMJAtNTCynIOOnDnFLTCnZ1 tQTAZQINGQ.FGN2gyKXXVCGUyYWRIIGSsXSgjQTYyQzMyRjEtODBFOCo00DYxLUJGNzItQ0EwNjBDREEzRjEyKXxVcGdyYWR1IG5vdCByZXF1aXJ1ZHwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgZm9ybXN80HwKfE51bWJlciBvZiB1cGdyYWR1ZCBmb3Jtc3w0fAp8TnVtYmVyIG9mIGZvcm1zIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAp8WzI1LTExLTEzOjEyNTEgVHJ1U3RhZ2UgU01UZXJtIExpZmUgSW5zdXJhbmN1IEZvCm0gVGVtcGxhdGVdKCM3NOY5QjdBNi02M0QyLTQ00DctOTEORC00MzZDQ0Y2RjY4NTYpfFVwZ3JhZGVkIHN1Y2Nlc3NmdWxseXwKfFsyNS0xMS0xMzoxMjUxIFRydVN0YWd1IFRBVOwgMi4wIEluc3VyYW5jZSBGb3JtIFRlbXBsYXR1XSgjRUE5NURFRDYtRjdGMy00ND1CLTk00EQt0EI2MUMzRERCNUQ3KXxVcGdyYWR1ZCBzdWNjZXNzZnVsbH18CnxbMjUtMTEtMjQ6MTQwMSBUcnVTdGFnZSBUQVdMIDIuMCBJbnN1cmFuY2UsIEFnZW50IEZvcm0gVGVtcGxhdGVdKCNBQzAwQz1FQy1BQ0EzLTQ4RTUtQjIwMS0yNjMxNDBDNkI2NjMpfFVwZ3JhZGVkIHN1Y2Nlc3NmdWxseXwKfFsyNS0xMS0xMzoxNzE2IEJvb2tpbmcgRXhhbXBsZSAtIFdlZWtlbmQgR2VOYXdheSBGb3JtIFRlbXBsYXR1XSgjODQ2QONGMzktQUJEMi00NTc1LUIzNjUtRTdFMzMyRTM1QTUyKXxVcGdyYWR1ZCBzdwNjZXNzZnVsbH18CgoKCgojIyBbRG91Z1R1bmFudF0oIzBGMzdD0TkzLT1FNzQtNDIxNy05QTNFLTczMDAxMDA1RUZDNykKCiMjIyBQcm9kdwNOcWoKCiMjIyMgUHJvZHVjdHMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBwCm9kdwN0c3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIGluZWXxpZ21ibGUgZm9yIGFuIHVwZ3JhZGV8MHwKfE51bWJ1ciBvZiBwCm9kdwN0cyB3aXRoIHVwZ3JhZGUgZXJyb3JzfDB8CnxOdw1iZXIgb2YgcHJvZHVjdHMgbm90IHJlcXVpcmluZyBhbiB1cGdyYWRlfDB8CgojIyMjIFByb2R1Y3QgZGV0YWlsCWp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbwU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgZm9ybXN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBmb3Jtc3wwfAp8TnVtYmVyIG9mIGZvCm1zIHdpdGggdXBncmFkZSB1cnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHN0eWx1PSJ3aWR0aDoyMjBweCI+TmFtZTwvZG12PnxTdGF0ZXwKfC0tLS0tfC0tLS0tfAoKCgoKIyMgWORvdWdUZW5hbnRUd29dKCMxMDczMjA5MS03MjI4LTQ0QzMtQTkzMi0xMzM4QzE2QThGNTcpCgojIyMgUHJvZHVjdHMKCgojIyMjIFByb2R1Y3RzIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dw1iZXIgb2YgYWN0aXZ1IHByb2R1Y3RzfDB8Cnx0dw1iZXIgb2YgdXBncmFkZWQgcHJvZHVjdHN8MHwKfE51bWJlciBvZiBwCm9kdwN0cyBpbmVsaWdpYmx1IGZvciBhbiB1cGdyYWR1fDB8CnxOdW1iZXIgb2YgcHJvZHVjdHMgd210aCB1cGdyYWR1IGVyCm9yc3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIG5vdCByZXF1aXJpbmcgYW4gdXBncmFkZXwwfAoKIyMjIyBQcm9kdwN0IGRldGFpbHMKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXRlfAp8LS0tLS18LS0tLS18CgoKIyMjIEZvCm1zCgojIyMjIEZvCm1zIFN1bW1hcnkKfDxkaXYgc3R5bGU9IndpZHRo0jIyMHB4Ij50YW11PC9kaXY+fFN0YXR1fAp8LS0tLS18LS0tLS18Cnx0dW1iZXIgb2YgYWN0aXZ1IGZvcm1zfDB8Cnx0dW1iZXIgb2YgdXBncmFkZWQgZm9ybXN8MHwKfE51bWJlciBvZiBmb3JtcyB3aXRoIHVwZ3JhZGUgZXJyb3JzfDB8CgojIyMjIEZVCm0gZGV0YWlscwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKCgoKCiMjIFt0ZXNOX3R1bmFudF0oIzZBRTM2REMxLTY1MzEtNERENS1BNEIwLTc5M0Q2MzAOMDE3NykKCiMjIyBQcm9kdwN0cwoKCiMjIyMgUHJvZHVjdHMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJ1ciBvZiBhY3RpdmUgcHJvZHVjdHN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBwCm9kdwN0c3wwfAp8TnVtYmVyIG9mIHByb2R1Y3RzIGluZWxpZ21ibGUgZm9yIGFuIHVwZ3JhZGV8MHwKfE51bWJlciBvZiBwCm9kdWN0cyB3aXRoIHVwZ3JhZGUgZXJyb3JzfDB8Cnx0dW1iZXIgb2YgcHJvZHVjdHMgbm90IHJ1cXVpcmluZyBhbiB1cGdyYWR1fDB8CgojIyMjIFByb2R1Y3QgZGV0YWlscwp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKCgojIyMgRm9ybXMKCiMjIyMgRm9ybXMgU3VtbWFyeQp8PGRpdiBzdHlsZT0id21kdGg6MjIwcHgiPk5hbWU8L2Rpdj58U3RhdGV8CnwtLS0tLXwtLS0tLXwKfE51bWJlciBvZiBhY3RpdmUgZm9ybXN8MHwKfE51bWJ1ciBvZiB1cGdyYWR1ZCBmb3Jtc3wwfAp8TnVtYmVyIG9mIGZvcm1zIHdpdGggdXBncmFkZSBlcnJvcnN8MHwKCiMjIyMgRm9ybSBkZXRhaWxzCnw8ZG12IHNOeWxlPSJ3aWR0aDoyMjBweCI+TmFtZTwvZGl2PnxTdGF0ZXwKfCOtLS0tfCOtLS0tfAoKCgo8YnI+Cjxicj4KPGJyPgoKIyBUZW5hbnQgUmVmZXJ1bmN1IFRhYmx1CnxOYW11fE1EfEhhcyBDT1ggTG1jZW5zZXxIYXMgRExYIExpY2Vuc2V8CnwtLS0tLXwtLS0tLXwtLS0tLXwtLS0tLXwKfFRydVNOYWdlfDxhIGlkPSIONzVCODg2Ny1GRTJBLTQ2MjctQUEwRi05NDgwNzZGNDAxREIiPjQ3NUI40DY3LUZFMkEtNDYyNy1BQTBGLTk00DA3NkY0MDFEQjwvYT58ZmFsc2V8ZmFsc2V8CnxEb3VnVGVuYW50fDxhIGlkPSIwRjM3Qzk5My05RTc0LTQyMTctOUEzRS03MzAwMTAwNUVGQzciPjBGMzdDOTkzLT1FNzQtNDIxNy05QTNFLTczMDAxMDA1RUZDNzwvYT58ZmFsc2V8ZmFsc2V8CnxEb3VnVGVuYW50VHdvfDxhIG1kPSIxMDczMjA5MS03MjI4LTQ0QzMtQTkzMi0xMzM4QzE2QThGNTciPjEwNzMyMDkxLTcyMjgtNDRDMy1B0TMyLTEzMzhDMTZB0EY1NzwvYT58ZmFsc2V8ZmFsc2V8Cnx0ZXN0X3R1bmFudHw8YSBpZD0iNkFFMzZEQzEtNjUzMS00REQ1LUE0QjAtNzkzRDYzMDQwMTc3Ij42QUUzNkRDMS02NTMxLTRERDUtQTRCMC03OTNENjMwNDAxNzc8L2E+fGZhbHN1fGZhbHN1fAoKPGJyPgo8YnI+Cjxicj4KCiMgUHJvZHVj dCBUZW1wbGF0ZSBSZWZ1cmVuY2UgVGFibGUKfE5hbWV8SUR8Q2F0ZWdvcn18VHlwZXxTdWJ0eXB1fFZ1cnNpb258CnwtLS0tLXwtLS0tLXwtLS0tLXwtLS0tLXwtLS0tLXwtLS0tLXwKCjxicj4KPGJyPgo8YnI+CgojIEZvcm0gVGVtcGxhdGUgUmVmZXJ1bmN1IFRhYmx1CnxOYW11fE1EfEZvcm0gVHlwZXxWZXJzaW9ufAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18CnwyNS0xMS0yNDoxNDAxIFRydVN0YWd1IFNJVGVybSBMaWZ1IEluc3VyYW5jZSBGb3JtIFRlbXBsYXRlfDxhIGlkPSI1QkJGODkwNS03QjAyLTRDRTktODc1Ri0xNjUyMjE2Nj1BMUQiPjVCQkY40TA1LTdCMDItNENF0S04NzVGLTE2NTIyMTY20UExRDwvYT4gfERJWC1EVEN8NnwKfDI1LTExLTI00jEOMDEgVHJ1U3RhZ2UgVEFXTCAyLjAgSW5zdXJhbmN1IEZvcm0gVGVtcGxhdGV8PGEgaWQ9IkQxQTMyNjgxLTM10DUtNEM5Qy04NjAwLUZBRTBFNTIyQzg50CI+RDFBMzI20DEtMzU4NS00Qz1DLTg2MDAtRkFFMEU1MjJD0Dk4PC9hPiB8RE1YLURUQ3w2fAp8MjYtMDEtMDU6MTcyOCBUcnVTdGFnZSBUQVdMIDIuMCBJbnN1cmFuY2UsIEFnZW50IEZvcm0gVGVtcGxhdGV8PGEgaWQ9IjM4NkMyNTZGLTg2MDgtNDFBNS05NTZDLUU1NEREOEI5QTc5NyI+MZg2QzI1NkYt0DYw0C00MUE1LTk1NkMtRTU0REQ4Qj1BNzk3PC9hPiB8RE1YLUFBfDZ8CnwyNiOwMSOwNjowOTU5IEJvb2tpbmcgRXhhbXBsZSAtIFd1ZWt1bmQgR2V0YXdheSBGb3JtIFRlbXBsYXR1fDxhIG1kPSI30TQxQjk1NC1GNzhFLTRBRjctQTRFRC01NUI2MT1GMjA5NDIiPjc5NDFCOTUOLUY30EUtNEFGNy1BNEVELTU1QjYxOUYyMDkOMjwvYT4gfERUQ3w1fAoKPGJyPgo8YnI+Cjxicj4KCiMgUHJvZHVjdCBSZWZlcmVuY2UgVGFibGUKfE5hbWV8SUR8Q2F0ZWdvcn18VHlwZXxTdWJ0eXBlfFZ1cnNpb258VGVtcGxhdGUgSUR8VGVuYW50IE1EfAp8LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18LS0tLS18Cgo8YnI+Cjxicj4KPGJyPgoKIyBGb3JtIFJ1ZmVyZW5jZSBUYWJsZQp8TmFtZXxJRHxWZXJzaW9ufFRlbXBsYXR1IE1EfFR1bmFudCBJRHwKfCOtLS0tfCOtLS0tfCotLS0tfC0tLS0tfCtLS0tfAoKPGJyPgo8YnI+Cjxicj4KCiMgSm9iIEVycm9yIERldGFpbHMKfElEIChIYXNoKXxFeGFtcGxlIFJ1ZmVyZW5jZXw8ZG12IHN0eWx1PSJ3aWR0aDoxMjBweCI+RXJyb3IgTwVzc2FnZTwvZG12PnxEZXRhaWxzfAp8LS0tLS18LS0tLS18lS0tlS18LS0tlS18Cgo=",
"createdDate": "2026-01-06T16:15:16.441Z"
}
]
}
```
<!-- CODESCAN_FILE_END -->

---

### 345. `C:\DevCode\AstroUI\src\components\EntityUpgraderReports\EntityUpgraderReports.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\EntityUpgraderReports\EntityUpgraderReports.tsx" type=".tsx" size="3722" lines="119" chars="3722" -->
```typescript
import React, { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { useAppContext } from 'context/app-context';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import { Markdown, Spinner, Combobox } from 'commonui';
import { client2 } from 'utils/api-client';
import { SCLabel, SCComboboxWrapper, SCHeader } from './styles';
import {
IGetEntityUpgraderReportResponse,
IEntityUpgraderReport,
} from './types';

[>>
* Component for displaying entity upgrader reports
>[
export default function EntityUpgraderReports() {
const [loading, setLoading] = useState(true);
const [selectedReport, setSelectedReport] = useState<IEntityUpgraderReport>();
const [reports, setReports] = useState<IEntityUpgraderReport[]>([]);
const { setPageTitle, setDisplayCreateButton } = useAppContext();

  const getUpgraderReport = async (): Promise<void> => {
try {
const reportData: IGetEntityUpgraderReportResponse = await client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}upgrade-report`,
'GET',
      ];
if (reportData.payload && reportData.payload.length > 0) {
setReports(reportData.payload);
setSelectedReport(reportData.payload[0]);
}
} catch (error) {
console.log(error);
} finally {
setLoading(false);
}
};

  useEffect(() => {
setDisplayCreateButton(false);
setPageTitle('EntityUpgrader Reports');
setLoading(true);
getUpgraderReport();
}, []);

  const handleReportChange = (_name: string, value: string): void => {
const report = reports.find(
(report: IEntityUpgraderReport) => report.createdDate === value,
    ];
setSelectedReport(report);
};

  const formatReportDate = (dateString: string): string => {
return dateString
? `${DateTime.fromISO(dateString).toFormat(
'MMMM d yyyy, h:mm:ss a',
)} (${dateString})`
      ; ``;
};

  return (
<div>
{loading ? (
<Spinner
className="loading-spinner"
key={`loading-spinner`}
data-testid="loading-spinner"
strokeWidth={8}
        [>
      ] ; [
        >>
<SCLabel htmlFor="entity-upgrader-reports-combobox">
Select Report:
</SCLabel>
<SCComboboxWrapper>
<Combobox
id="entity-upgrader-reports-combobox"
name="entity-upgrader-report"
placeholder="Select report"
value={selectedReport?.createdDate || ''}
options={reports.map(({ createdDate }) => ({
label: formatReportDate(createdDate),
value: createdDate,
              }]}}
onChange={handleReportChange}
/>
</SCComboboxWrapper>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 id="entityupgrader-reports-card-header">
EntityUpgrader Report
</h4>
</CardText>
</CardHeader>
<CardBody>
{selectedReport ? (
                >>
<p>
<SCHeader>Report Created Date:</SCHeader>{' '}
{formatReportDate(selectedReport.createdDate)}
</p>
<hr />
<Markdown text={atob(selectedReport?.value || '')}></Markdown>
                >[>
                } ; {
<p>No report selected.</p>
              }}
</CardBody>
</Card>
        >[>
      ]}
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 346. `C:\DevCode\AstroUI\src\components\EntityUpgraderReports\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\EntityUpgraderReports\styles.ts" type=".ts" size="383" lines="19" chars="383" -->
```typescript
import { Theme } from 'commonui';
import styled from 'styled-components';

export const SCLabel = styled.label`
color: ${Theme.getColor('contrastGreyscale08')};
padding: 16px 8px 8px 0;
font-size: 14px;
font-weight: 400;
line-height: 20px;
`;

export const SCComboboxWrapper = styled.div`
max-width: 600px;
`;

export const SCHeader = styled.span`
font-weight: 500;
`;

```
<!-- CODESCAN_FILE_END -->

---

### 347. `C:\DevCode\AstroUI\src\components\EntityUpgraderReports\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\EntityUpgraderReports\types.ts" type=".ts" size="174" lines="9" chars="174" -->
```typescript
export interface IGetEntityUpgraderReportResponse {
payload: IEntityUpgraderReport[];
}

export interface IEntityUpgraderReport {
value: string;
createdDate: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 348. `C:\DevCode\AstroUI\src\components\FullPageStatus\__test__\FullPageStatus.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\FullPageStatusl__test__\FullPageStatus.test.jsx" type=".jsx" size="1024" lines="35" chars="1024" -->
```javascript
import React from 'react';
import FullPageStatus from '../FullPageStatus';
import { render } from '@testing-library/react';

function CustomError(message, statusCode) {
this.message = JSON.stringify({ message, statusCode });
}

CustomError.prototype = new Error();

test('Renders loading status correctly', () => {
const fullPageStatus = render(<FullPageStatus />);
fullPageStatus.getByRole('full-page-status-loading');
}};

test('Renders 500 error status correctly', () => {
const errorResponse = new CustomError('error message', '500');
const props = {
errorResponse: errorResponse,
};

  const fullPageStatus = render(<FullPageStatus {...props} />);
fullPageStatus.getByRole('full-page-status-error');
}};

test('Renders 401 error status correctly', () => {
const errorResponse = new CustomError('error message', '401');
const props = {
errorResponse: errorResponse,
};

  const fullPageStatus = render(<FullPageStatus {...props} />);
fullPageStatus.getByRole('full-page-status-error');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 349. `C:\DevCode\AstroUI\src\components\FullPageStatus\FullPageStatus.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\FullPageStatus\FullPageStatus.tsx" type=".tsx" size="2056" lines="80" chars="2056" -->
```typescript
import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';
import Snackbar from 'components/Snackbar/Snackbar';

const useStyles = makeStyles((theme) => ({
progress: {
margin: theme.spacing(2),
height: '100px !important',
width: '100px !important',
},
}}];

interface Props {
children?: React.ReactNode;
errorResponse?: Error | null;
}

[>>
* Component that displays a loading spinner or an error snackbar if an
* error occurs.
>[
const FullPageStatus: React.FunctionComponent<Props> = (props) => {
const { children, errorResponse } = props;

  const classes = useStyles();

  const messages: { [key: string]: string } = {
4o1: 'Access token has expired. Please log in again to refresh your access token.', //"Invalid JWT"
default:
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
};

  if (errorResponse) {
const errorMessage =
errorResponse.message &&
errorResponse.message.indexOf('statusCode') > 0 &&
JSON.parse(errorResponse.message);
if (!errorMessage)
console.log('FullPageStatus errorResponse', errorResponse);
return (
<div role="full-page-status-error">
<Snackbar
style={{ top: '50%' }}
place="tc"
color="danger"
message={
(errorMessage && messages[errorMessage.statusCode]) ||
messages['default']
}
open={true}
closeNotification={() => {}}
close
        [>
</div>
    ];
}

  return (
<div
role="full-page-status-loading"
style={{
position: 'absolute',
top: '50%',
left: '50%',
transform: 'translate(-50%, -50%)',
textAlign: 'center',
}}
>
      >>
<CircularProgress className={classes.progress} />
<h1>Please Wait...</h1>
{children}
      >[>
</div>
  ];
};

export default FullPageStatus;

```
<!-- CODESCAN_FILE_END -->

---

### 350. `C:\DevCode\AstroUI\src\components\Grid\__test__\GridContainer.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Grid\__test__\GridContainer.test.jsx" type=".jsx" size="332" lines="14" chars="332" -->
```javascript
import React from 'react';
import GridContainer from '../GridContainer';
import { render, screen } from '@testing-library/react';

test('Renders', async () => {
const props = {
className: 'classname-string',
children: <div />,
};
render(<GridContainer {...props} />);

  await screen.findByRole('grid-container');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 351. `C:\DevCode\AstroUI\src\components\Grid\__test__\GridItem.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Grid\__test__\GridItem.test.jsx" type=".jsx" size="312" lines="14" chars="312" -->
```javascript
import React from 'react';
import GridItem from '../GridItem';
import { render, screen } from '@testing-library/react';

test('Renders', async () => {
const props = {
className: 'classname-string',
children: <div />,
};
render(<GridItem {...props} />);

  await screen.findByRole('grid-item');
}};

```
<!-- CODESCAN_FILE_END -->

---

### 352. `C:\DevCode\AstroUI\src\components\Grid\GridContainer.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Grid\GridContainer.jsx" type=".jsx" size="992" lines="46" chars="992" -->
```javascript
import React from 'react';
// nodejs library to set properties for components
import PropTypes from 'prop-types';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';

const styles = {
grid: {
margin: '0 -15px',
width: 'calc(100% + 30px)',
// '&:before,&:after':{
//   display: 'table',
//   content: '" "',
// },
// '&:after':{
//   clear: 'both',
// }
},
};

const useStyles = makeStyles(styles);

export default function GridContainer(props) {
const classes = useStyles();
const { children, className, ...rest } = props;
return (
<Grid
role={'grid-container'}
container
{...rest}
className={classes.grid + ' ' + className}
>
{children}
</Grid>
  ];
}

GridContainer.propTypes = {
className: PropTypes.string,
children: PropTypes.node,
role: PropTypes.string,
style: PropTypes.any,
alignItems: PropTypes.string,
};

```
<!-- CODESCAN_FILE_END -->

---

### 353. `C:\DevCode\AstroUI\src\components\Grid\GridItem.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Grid\GridItem.jsx" type=".jsx" size="871" lines="41" chars="871" -->
```javascript
import Grid from '@material-ui/core/Grid';
o5 // @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
// nodejs library to set properties for components
import PropTypes from 'prop-types';
import React from 'react';

const styles = {
grid: {
padding: '0 15px !important',
},
};

const useStyles = makeStyles(styles);

export default function GridItem(props) {
const classes = useStyles();
const { children, className, ...rest } = props;
return (
<Grid
role={'grid-item'}
item
{...rest}
className={classes.grid + ' ' + className}
>
{children}
</Grid>
  ];
}

GridItem.propTypes = {
className: PropTypes.string,
children: PropTypes.node,
xs: PropTypes.number,
sm: PropTypes.number,
md: PropTypes.number,
lg: PropTypes.number,
xl: PropTypes.number,
style: PropTypes.any,
};

```
<!-- CODESCAN_FILE_END -->

---

### 354. `C:\DevCode\AstroUI\src\components\Header\__test__\Header.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Header\__test__\Header.test.jsx" type=".jsx" size="42o" lines="15" chars="420" -->
```javascript
import React from 'react';
import Header from '../Header';
import { render } from '@testing-library/react';

describe('Header', () => {
it('Renders', () => {
const header = render(<Header>Loan Name</Header>);
expect(header.findByRole('header'));
  }};
it('renders null if no children provided', () => {
const header = render(<Header />);
expect(header.queryByRole('header')).toEqual(null);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 355. `C:\DevCode\AstroUI\src\components\Header\Header.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Header\Header.tsx" type=".tsx" size="463" lines="23" chars="463" -->
```typescript
import React from 'react';

interface Props {
children: React.ReactNode | any;
className?: string;
}

[>>
* Simple header component that bolds text children given to it.
>[
const Header: React.FunctionComponent<Props> = (props) => {
const { children, className } = props;

  if (!children) return null;
return (
<span role={'header'} style={{ fontWeight: 'bold' }} className={className}>
{children}
</span>
  ];
};

export default Header;

```
<!-- CODESCAN_FILE_END -->

---

### 356. `C:\DevCode\AstroUI\src\components\Home\__test__\Home.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Home\__test__\Home.test.jsx" type=".jsx" size="216" lines="10" chars="216" -->
```javascript
import React from 'react';
import Home from '../Home';
import { render } from '@testing-library/react';

test('Renders', () => {
const home = render(<Home>Loan Name</Home>);

  expect(home.findByRole('home'));
}};

```
<!-- CODESCAN_FILE_END -->

---

### 357. `C:\DevCode\AstroUI\src\components\Home\Home.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Home\Home.tsx" type=".tsx" size="253" lines="11" chars="253" -->
```typescript
import React from 'react';

const Home: React.FunctionComponent = () => (
<div role={'home'} style={{ margin: 'auto', textAlign: 'center' }}>
<h1>Welcome !</h1>
<p>Select a navigation option from the left</p>
</div>
];

export default Home;

```
<!-- CODESCAN_FILE_END -->

---

### 358. `C:\DevCode\AstroUI\src\components\InfoArea\InfoArea.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\InfoArea\InfoArea.jsx" type=".jsx" size="1104" lines="45" chars="1104" -->
```javascript
import React from 'react';
import PropTypes from 'prop-types';

// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';

import styles from 'assets/jss/material-dashboard-pro-react/components/infoStyle';

const useStyles = makeStyles(styles);

export default function InfoArea(props) {
const classes = useStyles();
const { title, description, iconColor } = props;
return (
<div className={classes.infoArea}>
<div className={classes.iconWrapper + ' ' + classes[iconColor]}>
<props.icon className={classes.icon} />
</div>
<div className={classes.descriptionWrapper}>
<h4 className={classes.title}>{title}</h4>
<p className={classes.description}>{description}</p>
</div>
</div>
  ];
}

InfoArea.defaultProps = {
iconColor: 'gray',
};

InfoArea.propTypes = {
icon: PropTypes.object.isRequired,
title: PropTypes.string.isRequired,
description: PropTypes.string.isRequired,
iconColor: PropTypes.oneOf([
'primary',
'warning',
'danger',
'success',
'info',
'rose',
'gray',
  ]},
};

```
<!-- CODESCAN_FILE_END -->

---

### 359. `C:\DevCode\AstroUI\src\components\IntegrationTemplate\__test__\Sample.json`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplate\__test__ISample.json" type=".json" size="5346" lines="162" chars="5346" -->
  'json
{
"sections": [
{
"sectionCode": "SETUP",
"isUsed": true,
"settings": [
{
"settingCode": "CORE-PRODUCT-START-DATE",
"valueType": "text-entry",
"value": "04/01/2020",
"displayValue": "04/01/2020"
},
{
"settingCode": "CORE-PRODUCT-END-DATE",
"valueType": "text-entry",
"value": "",
"displayValue": ""
},
{
"settingCode": "CORE-PRODUCT-NAME",
"valueType": "text-entry",
"value": "R1 - New Auto Loan Product",
"displayValue": "R1 - New Auto Loan Product"
},
{
"settingCode": "CORE-PRODUCT-CATEGORY",
"valueType": "text-entry",
"value": "Lending",
"displayValue": "Lending"
},
{
"settingCode": "CORE-PRODUCT-TYPE",
"valueType": "text-entry",
"value": "Auto",
"displayValue": "Auto"
},
{
"settingCode": "CORE-PRODUCT-SUBTYPE",
"valueType": "text-entry",
"value": "New",
"displayValue": "New"
},
{
"settingCode": "VEHICLE-TYPE",
"valueType": "code",
"value": "AUTO",
"displayValue": "Auto"
},
{
"settingCode": "DEFAULT-VEHICLE-PRICE",
"valueType": "number",
"value": "20000"
},
{
"settingCode": "MAX-LOAN-AMOUNT",
"valueType": "number",
"value": "80000"
},
{
"settingCode": "MIN-LOAN-AMOUNT",
"valueType": "number",
"value": "1000"
},
{
"settingCode": "LOAN-APPLICATION-EXPIRY-DURATION",
"valueType": "integer",
"value": "30"
},
{
"settingCode": "ASSOC-TO-ALL-MERCHANTS",
"valueType": "boolean",
"value": false
},
{
"settingCode": "ALLOW-SIMULATION",
"valueType": "boolean",
"value": true
}
]
},
{
"sectionCode": "MEMBERSHIP",
"isUsed": true,
"settings": [
{
"settingCode": "ELIGIBILITY",
"valueType": "code",
"value": "MEMBERS",
"displayValue": "Members Only"
}
]
},
{
"sectionCode": "DISBURSEMENT",
"isUsed": true,
"settings": [
{
"settingCode": "CHECK-TO-DEALER",
"valueType": "boolean",
"value": false
},
{
"settingCode": "DIRECT-DEPOSIT-TO-DEALER",
"valueType": "boolean",
"value": false
},
{
"settingCode": "DIRECT-DEPOSIT-BORROWER-ACCT",
"valueType": "boolean",
"value": false
},
{
"settingCode": "CHECK-TO-BORROWER",
"valueType": "boolean",
"value": false
}
]
},
{
"sectionCode": "COLLATERAL",
"isUsed": true,
"settings": [
{
"order": 1,
"settingCode": "COLLATERAL-VIN-REQUIRED",
"valueType": "boolean",
"value": false
}
]
},
{
"sectionCode": "INTEGRATIONS",
"isUsed": true,
"settings": [
{
"settingCode": "INTEGRATIONS-CORE-BANKING",
"valueType": "code",
"value": "SYMITAR",
"displayValue": "Symitar"
},
{
"settingCode": "INTEGRATIONS-HOME-BANKING",
"valueType": "code",
"value": "Q2",
"displayValue": "Q2"
},
{
"settingCode": "INTEGRATIONS-LOS",
"valueType": "code",
"value": "MERIDIAN-LINK",
"displayValue": "Meridian Link"
},
{
"settingCode": "INTEGRATIONS-VALUATION",
"valueType": "code",
"value": "KBB",
"displayValue": "KBB"
}
]
}
]
}
```
<!-- CODESCAN_FILE_END -->

---

### 360.'C:\DevCode\AstroUI\src\components\IntegrationTemplatel_test__IViewIntegrationTemplate.test.jsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplate\__test__IViewIntegrationTemplate.test.jsx" type=".jsx" size="12363" lines="470" chars="12363" -->
```javascript
import React from 'react';

import {
queryByAttribute,
fireEvent,
render,
screen,
} from '@testing-library/react';

const getById = queryByAttribute.bind(null, 'id');

import ViewIntegrationTemplate from '../ViewIntegrationTemplate';
import { v4 as uuid } from 'uuid';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import { BrowserRouter } from 'react-router-dom';
import * as RouterDom from 'react-router-dom';

const mockPush = jest.fn();
const mockUseParams = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: () => mockUseParams,
}}];

describe('ViewIntegrationTemplate', () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
  }}];
const fetchSpy = jest.spyOn(window, 'fetch');
const mockSourcePromise = Promise.resolve({
payload: [
{
code: 'DNA',
displayName: 'DNA-V1',
},
],
  }};

  const mockTypePromise = Promise.resolve({
payload: [
{
code: 'DI',
displayName: 'Data Ingestion',
},
],
  }};
const templateId = uuid();
const templateJSON = JSON.stringify(require('./Sample.json'));
const mockTemplate = {
templateId: templateId,
recordState: 'Active',
source: 'DNA',
type: 'DI',
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: templateJSON,
templateSpecificationJSON: templateJSON,
metadataJSON: '{}',
};
afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  test('Test integration view', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'view',
    }}];
const mockLoanPromise = Promise.resolve({
payload: {
...mockTemplate,
specificationJSON: '{}',
metadataJSON: '{}',
},
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTypePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockLoanPromise,
      }];

    render(wrapWithMockContext(<ViewIntegrationTemplate />));

    const nameHeader = await screen.findByText('Integration Template');
expect(nameHeader);
  }};

  test('Test integration edit', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'edit',
    }}];

    const mockSourcePromise = Promise.resolve({
payload: [
{
code: 'DNA',
displayName: 'DNA-V1',
},
],
    }};

    const mockTypePromise = Promise.resolve({
payload: [
{
code: 'DI',
displayName: 'Data Ingestion',
},
],
    }};

    const mockTemplatePromise = Promise.resolve({
payload: {
templateId: templateId,
recordState: 'Active',
source: 'DNA',
type: 'DI',
name: 'Some Name',
description: 'Some Description',
version: 2,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
},
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTypePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
      }];

    render(wrapWithMockContext(<ViewIntegrationTemplate />));

    const nameHeader = await screen.findByText('Integration Template');
expect(nameHeader);
  }};

  test.skip('Test integration template create', async () => {
const mockSourcePromise = Promise.resolve({
payload: [
{
code: 'DNA',
displayName: 'DNA-V1',
},
],
    }};

    const mockTypePromise = Promise.resolve({
payload: [
{
code: 'DI',
displayName: 'Data Ingestion',
},
],
    }};
const templateJSON = JSON.stringify(require('./Sample.json'));
const mockTemplatePromise = Promise.resolve({
payload: {
...mockTemplate,
specificationJSON: templateJSON,
templateSpecificationJSON: templateJSON,
},
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTypePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
      }]
.mockResolvedValueOnce();

    render(wrapWithMockContext(<ViewIntegrationTemplate />));

    const fs = require('fs');
const jsonFile = fs.readFileSync(
'src/components/IntegrationTemplate/__test__/Sample.json',
    ];

    const file = new Blob([jsonFile], {
type: 'application/json',
    }};
//screen.debug(file);
const browseFileSpecification = screen.getByRole('input', {
name: 'Specification JSON',
    }};
fireEvent.change(browseFileSpecification, { target: { files: [] } });
const browseFileLayout = screen.getByRole('input', {
name: 'Layout JSON',
    }};
fireEvent.change(browseFileLayout, { target: { files: [] } });

    //screen.debug();
const buttons = await screen.findAllByRole('button');
//screen.debug();
// Source selection
const sourceSelector = buttons.find(
(button) => (button.id = 'select-integrationSourceType'),
    ];
if (sourceSelector) {
fireEvent.click(sourceSelector);
}
const optionsSource = await screen.findAllByRole('option');
//optionsSource.forEach(option => screen.debug(option));
const targetSourceOption = optionsSource[1];

    fireEvent.click(targetSourceOption);

    // Type selection
const typeSelector = buttons.find(
(button) => (button.id = 'select-integrationTemplateType'),
    ];

    if (typeSelector) {
fireEvent.click(typeSelector);
}

    const optionsType = await screen.findAllByRole('option');
//optionsType.forEach(option => screen.debug(option));
const targetTypeOption = optionsType[1];

    fireEvent.click(targetTypeOption);

    const nameHeader = await screen.findByText('Integration Template');
expect(nameHeader);

    // const fs = require('fs');
// const bitmap = fs.readFileSync(
//   'src/components/IntegrationTemplate/__test__/Sample.json',
// );
// // const docxBase64 = new Buffer(bitmap).toString('base64');
// const file = new Blob([bitmap], {
//   type: 'application/json',
// });

    // const fileReference = getById(screen.container, 'loan-template-file-input');
// act(() => {
//   fireEvent.change(fileReference, { target: { files: [file] } });
// });

    const saveActiveButton = getById(screen.container, 'form-template-save');
fireEvent.click(saveActiveButton);
}, 5000);

  test.skip('Test Integration template discard', async () => {
const mockSourcePromise = Promise.resolve({
payload: [
{
code: 'DNA',
displayName: 'DNA-V1',
},
{
code: 'DNA2',
displayName: 'DNA-V2',
},
],
    }};

    const mockTypePromise = Promise.resolve({
payload: [
{
code: 'DI',
displayName: 'Data Ingestion',
},
{
code: 'DI2',
displayName: 'Data Ingestion 2',
},
],
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTypePromise,
      }];

    render(wrapWithMockContext(<ViewIntegrationTemplate />));

    const buttons = await screen.findAllByRole('button');

    // Source selection
const sourceSelector = buttons.find(
(button) => (button.id = 'select-integrationSourceType'),
    ];
if (sourceSelector) {
fireEvent.click(sourceSelector);
}
const optionsSource = await screen.findAllByRole('option');
const targetSourceOption = optionsSource[1];

    fireEvent.click(targetSourceOption);

    // Type selection
const typeSelector = buttons.find(
(button) => (button.id = 'select-integrationTemplateType'),
    ];

    if (typeSelector) {
fireEvent.click(typeSelector);
}
const optionsType = await screen.findAllByRole('option');
const targetTypeOption = optionsType[1];

    fireEvent.click(targetTypeOption);

    const nameHeader = await screen.findByText('Integration Template');
expect(nameHeader);

    const saveActiveButton = getById(
screen.container,
'form-template-discard-changes',
    ];
fireEvent.click(saveActiveButton);
}, 5000);

test('Integation Name, Description, and Version Description inputs change as expected', async
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
viewMode: 'create',
    }}];

    const mockSourcePromise = Promise.resolve({
payload: [
{
code: 'DNA',
displayName: 'DNA-V1',
},
],
    }};

    const mockTypePromise = Promise.resolve({
payload: [
{
code: 'DI',
displayName: 'Data Ingestion',
},
],
    }};
const mockTemplatePromise = Promise.resolve({
payload: {
...mockTemplate,
specificationJSON: '{}',
metadataJSON: '{}',
},
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockSourcePromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
      }];

    const container = render(wrapWithMockContext(<ViewIntegrationTemplate />));

    // const source = container.getByTestId('config_source_input_select');
// const type = container.getByTestId('config_type_input_select');
const name = container.getByTestId('config_name_input');
const description = container.getByTestId('config_description_input');
const version = container.getByTestId('config_version_input');
const versionDescription = container.getByTestId(
'config_version_description_input',
    ];

    [>>
* NOTE: Must use CustomInput.firstChild to access input element
* with data-testid attribute
     >[

    // fireEvent.change(source, {
//   target: { value: 'DNA' },
// });

    // fireEvent.change(type, {
//   target: { value: 'DI' },
// });

    fireEvent.change(name.firstChild, {
target: { value: 'New Config Template Name' },
    }};

    fireEvent.change(description.firstChild, {
target: { value: 'New Config Template' },
    }};

    fireEvent.change(versionDescription.firstChild, {
target: { value: 'New Version' },
    }};

    // expect(source.value).toEqual('');
// expect(type.value).toEqual('');
expect(name.firstChild.value).toEqual('New Config Template Name');
expect(description.firstChild.value).toEqual('New Config Template');
expect(version.firstChild.value).toEqual('1');
expect(versionDescription.firstChild.value).toEqual('New Version');
}, 5000);

  function wrapWithMockContext(component) {
const mockContext = {
setPageTitle: () => {},
setDisplayCreateButton: (v) => {},
setCreateButtonClicked: (v) => {},
createButtonClicked: true,
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<BrowserRouter>
<AuthContext.Provider value={mockAuthContext}>
<AppContext.Provider value={mockContext}>
<UserContext.Provider value={{ user: { x: '' } }}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
</BrowserRouter>
    ];
}
}};

```
<!-- CODESCAN_FILE_END -->

---

### 361. `C:\DevCode\AstroUI\src\components\IntegrationTemplate\ViewIntegrationTemplate.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatelViewIntegrationTemplate.tsx" type=".tsx" size="25472" lines="716" chars="25472" -->
```typescript
import { FormControl, MenuItem, Select } from '@material-ui/core';

import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';

import ViewMode from 'context/view-mode';
import { useNavigate, useParams } from 'react-router-dom';
import { client2 } from 'utils/api-client';

import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import CustomInput from 'components/CustomInput/CustomInput';
// import { IntegrationTemplate } from './IntegrationTemplate';
import FullPageStatus from '../FullPageStatus/FullPageStatus';
import Button from 'components/CustomButtons/Button';

import SweetAlert from 'react-bootstrap-sweetalert';

import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import {
IntegrationTemplate,
IntegrationSourceTypeInfo,
IntegrationTemplateTypeInfo,
} from 'types';
import IntegrationTemplateFile from '../IntegrationTemplatesList/IntegrationTemplateFile';
import { v4 as uuid } from 'uuid';
import IntegrationLayoutTemplateFile from'components/IntegrationTemplatesList/IntegrationLayoutTemplateFile';

const useSweetAlertStyles = makeStyles(sweetAlertStyle);
const useStyles = makeStyles(styles);

const DefaultIntegrationTemplate: Partial<IntegrationTemplate> = {
recordState: 'Active',
version: 1,
versionDescription: 'Initial Version',
};

export default function ViewIntegrationTemplate() {
const classes = useStyles();
const sweetAlertClasses = useSweetAlertStyles();

  const { setDisplayCreateButton, setPageTitle } = useAppContext();

  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<any | null>(null);

  const [configTemplate, setConfigTemplate] = useState<
Partial<IntegrationTemplate>
>({ ...DefaultIntegrationTemplate });

  const [alert, setAlert] = useState<JSX.Element | null>(null);
const [error, setError] = useState('');
const [errorResponse, setErrorResponse] = useState(null);

  const [integrationSourceType, setIntegrationSourceTypeList] = useState<
IntegrationSourceTypeInfo[]
  >{[]];
const [selectedIntegrationSourceTypeId, setSelectedIntegrationSourceTypeId] =
useState('');
const [integrationTemplateType, setIntegrationTemplateTypeList] = useState<
IntegrationTemplateTypeInfo[]
  >{[]];
const [
selectedIntegrationTemplateTypeId,
setSelectedIntegrationTemplateTypeId,
] = useState('');

  const push = useNavigate();
const params = useParams();
const { templateId } = params;

  useEffect(() => {
setDisplayCreateButton(false);
if (!loading) return;

    client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}source-types`,
    ]
.then((data) => {
const integrationSourceType: IntegrationSourceTypeInfo[] = data.payload;
setIntegrationSourceTypeList(integrationSourceType);
setLoading(false);
      }]
.catch((error) => {
setErrorResponse(error);
setLoading(false);
      }];

    client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-types`,
    ]
.then((data) => {
const integrationTemplateType: IntegrationTemplateTypeInfo[] =
data.payload;
setIntegrationTemplateTypeList(integrationTemplateType);
setLoading(false);
      }]
.catch((error) => {
setErrorResponse(error);
setLoading(false);
      }];

    if (templateId) {
client2(
'${process.enV.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-templates/${templateId}',
      ]
.then((data) => {
const template: IntegrationTemplate = data.payload;
setConfigTemplate(template);
setSelectedIntegrationSourceTypeId(template.sourceCode ?? '');
setSelectedIntegrationTemplateTypeId(
template.integrationTypeCode ?? '',
          };
setPageTitle(template.name);
setLoading(false);
        }]
.catch((error) => {
setErrorResponse(error);
setLoading(false);
        }];

      setViewMode(params.viewMode === 'view' ? ViewMode.View : ViewMode.Edit);

      return;
}

    const configTemplate: Partial<IntegrationTemplate> = {
...DefaultIntegrationTemplate,
};

    configTemplate.templateId = uuid();
//loanFormTemplate.coreProductTemplateId = match.params.productTemplateId;

    setConfigTemplate(configTemplate);
setViewMode(ViewMode.Create);
setLoading(false);
}, [loading]);

  const submitForm = async () => {
let method = '';
let uri = null;
if (viewMode === ViewMode.Create) {
configTemplate.name = configTemplate.name ? configTemplate.name : '';
configTemplate.description = configTemplate.description
? configTemplate.description
: 'Description';
configTemplate.version = configTemplate.version;
configTemplate.source = selectedIntegrationSourceTypeId;
configTemplate.integrationType = selectedIntegrationTemplateTypeId;
configTemplate.versionDescription = configTemplate.versionDescription
? configTemplate.versionDescription
: 'Initial Version';
if (!configTemplate.specificationJSON) {
setError('A specification JSON file must be chosen');
return;
}
if (!configTemplate.templateSpecificationJSON) {
setError('A layout JSON file must be chosen');
return;
}
uri = `${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-template`;
method = 'POST';
} else {
uri = ${process.enV.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-templates/${configTemplate.templateId}';
configTemplate.source = selectedIntegrationSourceTypeId;
configTemplate.integrationType = selectedIntegrationTemplateTypeId;
method = 'PUT';
}
const config = {
headers: {
'Content-Type': 'application/json',
},
body: JSON.stringify(configTemplate),
};

    client2(uri, method, config, false)
.then((data) => {
push(
`/admin/integration-templates/` + data.payload.templateId + '/view',
        };
      }]
.catch((error) => {
//console.log(JSON.parse(error.message).result.errors[0].message)
setError(JSON.parse(error.message).result.errors[0].message);
      }];
};

  const handleSaveClicked = () => {
submitForm();
};

  const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
push(`/admin/integration-templates`);
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<div>
{alert}
<GridContainer>
<GridItem xs={12} md={12} lg={12}>
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={12}>
<CardText color="cuna1">
<h4>Integration Template</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<GridContainer>
                Terror && (
<GridItem xs={12} style={{ textAlign: 'center' }}>
<div
id="error_code"
style={{
display: 'inline-block',
paddingTop: '15px',
color: 'red',
}}
>
{error}
</div>
</GridItem>
                }}
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Source
</div>
</GridItem>
<GridItem xs={6}>
{viewMode !== ViewMode.Create && (
<CustomInput
id="source_name"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_source_input',
disableUnderline: false,
value: configTemplate?.source,
type: 'text',
} as any
}
                    [>
                  ]}
{viewMode === ViewMode.Create && (
<FormControl
style={{ marginBottom: '4px', width: '160px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={selectedIntegrationSourceTypeId}
onChange={(event: any) => {
const sourceTypeId = event.target.value;
setSelectedIntegrationSourceTypeId(sourceTypeId);
setConfigTemplate({
...configTemplate,
source: event.target.value,
                          }];
}}
inputProps={{
name: 'integrationSourceType',
id: 'integration-source-type-selection',
'data-testid': 'config_source_input_select',
}}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
{integrationSourceType.map(
(template: IntegrationSourceTypeInfo) => (
<MenuItem
key={template.code}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={template.code}
>
{`${template.displayName}`}
</MenuItem>
                          },
                        ]}
</Select>
</FormControl>
                  ]}
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Integration Type
</div>
</GridItem>
<GridItem xs={6}>
{viewMode !== ViewMode.Create && (
<CustomInput
id="type_name"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_type_input',
value: configTemplate?.integrationType,
type: 'text',
} as any
}
                    [>
                  ]}
{viewMode === ViewMode.Create && (
<FormControl
style={{ marginBottom: '4px', width: '160px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={selectedIntegrationTemplateTypeId}
onChange={(event: any) => {
const templateTypeId = event.target.value;
setSelectedIntegrationTemplateTypeId(templateTypeId);
setConfigTemplate({
...configTemplate,
integrationType: event.target.value,
                          }];
}}
inputProps={{
name: 'integrationTemplateType',
id: 'integration-template-type-selection',
'data-testid': 'config_type_input_select',
}}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
{integrationTemplateType.map(
(template: IntegrationTemplateTypeInfo) => (
<MenuItem
key={template.code}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={template.code}
>
{`${template.displayName}`}
</MenuItem>
                          },
                        ]}
</Select>
</FormControl>
                  ]}
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Integration Template Name
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_name"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_name_input',
disabled: viewMode !== ViewMode.Create,
disableUnderline: false,
value: configTemplate?.name,
type: 'text',
onChange: (e: any) => {
setConfigTemplate({
...configTemplate,
name: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="config_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_description_input',
disabled: viewMode === ViewMode.View,
disableUnderline: false,
value: configTemplate?.description,
placeholder: 'Config Description',
type: 'text',
onChange: (e: any) => {
setConfigTemplate({
...configTemplate,
description: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Version
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_version"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_version_input',
disabled: viewMode === ViewMode.View,
disableUnderline: false,
value: configTemplate?.version,
placeholder: '1',
type: 'text',
onChange: (e: any) => {
setConfigTemplate({
...configTemplate,
versionDescription: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Version Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_version_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'config_version_description_input',
disabled: viewMode === ViewMode.View,
disableUnderline: false,
value: configTemplate?.versionDescription,
placeholder: 'Initial version',
type: 'text',
onChange: (e: any) => {
setConfigTemplate({
...configTemplate,
versionDescription: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
{viewMode !== ViewMode.View && (
<IntegrationTemplateFile
setSpecificationJson={(specJson: string) => {
setConfigTemplate({
...configTemplate,
specificationJSON: specJson,
                      }};
}}
showError={setError}
                  [>
                }}
{viewMode !== ViewMode.View && (
<IntegrationLayoutTemplateFile
setLayoutJson={(layoutJson: string) => {
setConfigTemplate({
...configTemplate,
templateSpecificationJSON: layoutJson,
                      }};
}}
showError={setError}
                  [>
                }}
</GridContainer>
</CardBody>
</Card>
{configTemplate && viewMode === ViewMode.View && (
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={12}>
<CardText color="cuna1">
<h4>Specification JSON</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<textarea
id="json_spec"
style={{
width: '100%',
resize: 'none',
border: 'none',
height: '500px',
}}
value={JSON.stringify(
JSON.parse(
configTemplate.specificationJSON
? configTemplate.specificationJSON
                         ; `{}`,
                    ],
undefined,
                    4.
                  ]}
></textarea>
</CardBody>
</Card>
          }}
{configTemplate && viewMode === ViewMode.View && (
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={12}>
<CardText color="cuna1">
<h4>Layout JSON</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<textarea
id="json_spec_layout"
style={{
width: '100%',
resize: 'none',
border: 'none',
height: '500px',
}}
value={JSON.stringify(
JSON.parse(
configTemplate.templateSpecificationJSON
? configTemplate.templateSpecificationJSON
                         ; `{}`,
                    ],
undefined,
4,
                  ]}
></textarea>
</CardBody>
</Card>
          }}
</GridItem>
</GridContainer>
{viewMode !== ViewMode.View && (
<GridContainer
style={{
textAlign: 'right',
}}
>
<GridItem xs={12} sm={12} md={12}>
<Button
id="form-template-discard-changes"
color="danger"
simple
onClick={() => {
discardChangesWarning();
}}
>
Discard Changes
</Button>
<Button
id="form-template-save"
color="success"
onClick={handleSaveClicked}
disabled={!configTemplate}
>
Save
</Button>
</GridItem>
</GridContainer>
      ]}
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 362.'C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\_test__\IntegrationTemplateDataGrid.test.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\__test__\IntegrationTemplateDataGrid.test.tsx" type=".tsx" size="2646" lines="95" chars="2646" -->
```typescript
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import IntegrationTemplateDataGrid from '../IntegrationTemplateDataGrid';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: () => ({
tenantId: 'tenantId',
  }},
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];
describe('IntegrationTemplateDataGrid', () => {
const fetchSpy: jest.SpyInstance = jest.spyOn(window, 'fetch');

  test('Test population of templates list', async () => {
const templateId = uuid();
const templateIdTwo = uuid();

    const configTemplates = [
{
templateId: templateId,
recordState: 'Active',
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
},
{
templateId: templateIdTwo,
recordState: 'Draft',
name: 'Some Name 2',
description: 'Some Description 2',
version: 2,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
},
];

    const props = {
configTemplates,
history: {
location: {
pathname: `/admin/integration-templates`,
},
},
};

    renderWithMockContext(<IntegrationTemplateDataGrid {...props} />);

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);

    const viewButton = screen.getByRole('link', {
name: `View Template with id ${templateIdTwo}`,
    }};

    fireEvent.click(viewButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/integration-templates/${templateIdTwo}/view`,
    ];

    const editButton = screen.getByRole('link', {
name: `Edit Template with id ${templateIdTwo}`,
    }};
fireEvent.click(editButton);

    expect(mockPush).toHaveBeenCalledWith(
`/admin/integration-templates/${templateIdTwo}/edit`,
    ];

    const deleteButton = screen.getByRole('button', {
name: `Delete Template with id ${templateIdTwo}`,
    }};
fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({}),
    }};
fireEvent.click(deleteButton);
fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
expect(fetchSpy).toHaveBeenCalled();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 363。'C:\DevCode\AstroUI\srclcomponents\IntegrationTemplatesList\__test__\IntegrationTemplatesList.test.tsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\__test__\IntegrationTemplatesList.test.tsx" type=".tsx" size="3043" lines="109" chars="3043" -->
```typescript
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import IntegrationTemplatesList from '../IntegrationTemplatesList';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];
describe('IntegrationTemplatesList', () => {
const fetchSpy: jest.SpyInstance = jest.spyOn(window, 'fetch');

  test('Test population of templates list', async () => {
const templateId = uuid();

    const templateIdTwo = uuid();

    const mockLoanTemplatesPromise = Promise.resolve({
payload: [
{
templateId: templateId,
recordState: 'Active',
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
},
{
templateId: templateIdTwo,
recordState: 'Draft',
name: 'Some Name 2',
description: 'Some Description 2',
version: 2,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
},
],
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockLoanTemplatesPromise,
    }};

    renderWithMockContext(<IntegrationTemplatesList />);

    const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);

    const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Some Name');
expect(productRow1.item(1)).toHaveTextContent('Some Description');

    expect(productRow2.item(0)).toHaveTextContent('Some Name 2');
expect(productRow2.item(1)).toHaveTextContent('Some Description 2');

    expect(nameHeader);

    const viewButton = screen.getByRole('link', {
name: `View Template with id ${templateIdTwo}`,
    }};

    fireEvent.click(viewButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/integration-templates/${templateIdTwo}/view`,
    ];
}, 30000);

  test('Error fetching templates listing', async () => {
const props = {
history: {
location: {
pathname: `/admin/integration-templates`,
},
},
};

    fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
    }};

    renderWithMockContext(<IntegrationTemplatesList />);

    await screen.findByRole('full-page-status-error');
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 364.'C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationLayoutTemplateFile.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationLayoutTemplateFile.tsx" type=".tsx" size="1771" lines="76" chars="1771" -->
```typescript
import React from 'react';
import GridItem from '../Grid/GridItem';

const handleFileChangeEvent = async (
event: any,
setLayoutJson: any,
showError: any,
) => {
const file: File = event.target.files[0];

  if (!file) {
return;
}

  const layoutJson: string = await file.text();

  const validationErrors: string[] = validateLayoutJson(layoutJson);
if (validationErrors && validationErrors.length > 0) {
showError(JSON.stringify(validationErrors));
return;
}

  setLayoutJson(layoutJson);
};

export default function IntegrationLayoutTemplateFile(props: any) {
const { setLayoutJson, showError } = props;

  return (
<React.Fragment>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Layout JSON File
</div>
</GridItem>
<GridItem xs={12} sm={6}>
<input
id={`layout-template-file-input`}
style={{
marginBottom: '16px',
marginTop: '15px',
}}
aria-label="Layout JSON"
type="file"
onChange={async (event) => {
console.log(
`event ${event.target.files ? event.target.files[0] : ''}`,
            };
await handleFileChangeEvent(event, setLayoutJson, showError);
}}
        [>
</GridItem>
</React.Fragment>
  ];
}

const validateLayoutJson = (layoutJson: string): string[] => {
if (!layoutJson) {
return ['Layout JSON file has no contents'];
}

  try {
JSON.parse(layoutJson);
} catch (error) {
return ['Layout JSON file contents is not properly formatted JSON'];
}

  return [];
};

```
<!-- CODESCAN_FILE_END -->

---

### 365。'C:\DevCode\AstroUI\srclcomponents\IntegrationTemplatesList\IntegrationTemplateDataGrid.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationTemplateDataGrid.tsx" type=".tsx" size="5029" lines="173" chars="5029" -->
```typescript
import React, { useState } from 'react';
import { Table, useConfirmModal, Icon, ICON_TYPES } from 'commonui';

import Header from 'components/Header/Header';
import { client2 } from 'utils/api-client';
import { Paths } from 'layouts/RouterSwitch';
import { generatePath } from 'react-router-dom';
import { IntegrationTemplateInfo } from 'types';
import {
SCActions,
SCActionButton,
SCStatus,
SCActionButtonLink,
} from '../TableStyles';

const IntegrationTemplateDataGrid = ({ configTemplates }: any) => {
const [error, setError] = useState('');
const setConfirm = useConfirmModal();

  const formatdata = (formTemplates: IntegrationTemplateInfo[]) =>
formTemplates.map(
      [{
templateId = '',
name,
version,
versionDescription,
description,
source,
integrationType,
recordState,
}: IntegrationTemplateInfo) => ({
key: templateId,
id: templateId,
name,
version,
versionDescription,
description,
source,
integrationType,
isActive: recordState === 'Active',
status: <SCStatus status={recordState}>{recordState}</SCStatus>,
actions: (
// we've added some custom button actions
<SCActions id={`${templateId}_actions`}>
{/* use this button to add a like kind of action */}
<SCActionButtonLink
id={`${templateId}_view`}
title="View Template"
aria-label={`View Template with id ${templateId}`}
to={generatePath(Paths.IntegrationTemplatesManage, {
templateId,
viewMode: 'view',
              }]}
color="blue"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
<SCActionButtonLink
id={`${templateId}_edit`}
title="Edit Template"
aria-label={`Edit Template with id ${templateId}`}
to={generatePath(Paths.IntegrationTemplatesManage, {
templateId,
viewMode: 'edit',
              }]}
color="green"
className="edit"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
<SCActionButton
id={`${templateId}_delete`}
title="Delete Template"
aria-label={`Delete Template with id ${templateId}`}
onClick={() => {
discardChangesWarning(`${templateId}`);
}}
color="red"
>
<Icon size={10} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
</SCActions>
        },
      }],
    ];

  const discardChangesWarning = (templateID: string): void => {
setConfirm({
title: 'Remove Template?',
onContinueBtnClick: () => deActivateTemplate(templateID),
body: 'Are you sure you want to remove this template?',
continueBtnText: 'Remove',
cancelBtnText: 'Cancel',
    }};
};

  const deActivateTemplate = async (templateID: string): Promise<void> => {
const uri = '$process.enV.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-template-deactivate/${templateID}';
const method = 'DELETE';

    const config = {
headers: {
'Content-Type': 'application/json',
},
};

    try {
await client2(uri, method, config, false);
location.reload();
} catch (error) {
if (error instanceof Error) {
const parsedError = JSON.parse(error?.message).result.errors[0]
?.message;

        console.error(parsedError);
setError(parsedError);
}
}
};

  return (
<div>
<Table
data={formatdata(configTemplates)}
filterable={true}
sortable={true}
columns={[
{
Header: <Header>Name</Header>,
accessor: 'name',
filterable: true,
sortable: true,
},
{
Header: <Header>Description</Header>,
accessor: 'description',
filterable: true,
sortable: true,
},
{
Header: <Header>Source</Header>,
accessor: 'source',
filterable: true,
sortable: true,
},
{
Header: <Header>Integration Type</Header>,
accessor: 'integrationType',
filterable: true,
sortable: true,
},
{
Header: <Header>Status</Header>,
accessor: 'status',
sortable: true,
},
{
Header: 'Actions',
accessor: 'actions',
sortable: false,
filterable: false,
maxWidth: '180px',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
      [>
</div>
  ];
};

export default IntegrationTemplateDataGrid;

```
<!-- CODESCAN_FILE_END -->

---

### 366。'C:\DevCode\AstroUI\srclcomponents\IntegrationTemplatesList\IntegrationTemplateFile.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationTemplateFile.tsx" type=".tsx" size="1923" lines="77" chars="1923" -->
```typescript
import React from 'react';
import GridItem from '../Grid/GridItem';

const handleFileChangeEvent = async (
event: any,
setSpecificationJson: any,
showError: any,
) => {
const file: File = event.target.files[0];

  if (!file) {
return;
}
const specificationJson: string = await file.text();

  const validationErrors: string[] =
validateSpecificationJson(specificationJson);
if (validationErrors && validationErrors.length > 0) {
showError(JSON.stringify(validationErrors));
return;
}

  setSpecificationJson(specificationJson);
};

export default function IntegrationTemplateFile(props: any) {
const { setSpecificationJson, showError } = props;

  return (
<React.Fragment>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Specification JSON File
</div>
</GridItem>
<GridItem xs={12} sm={6}>
<input
id={`specification-template-file-input`}
style={{
marginBottom: '16px',
marginTop: '15px',
}}
aria-label="Specification JSON"
name="Specification JSON"
type="file"
onChange={async (event) => {
console.log(
`event ${event.target.files ? event.target.files[0] : ''}`,
            };
await handleFileChangeEvent(event, setSpecificationJson, showError);
}}
        [>
</GridItem>
</React.Fragment>
  ];
}

const validateSpecificationJson = (specificationJson: string): string[] => {
if (!specificationJson) {
return ['Specification JSON file has no contents'];
}

  try {
JSON.parse(specificationJson);
} catch (error) {
return ['Specification JSON file contents is not properly formatted JSON'];
}

  return [];
};

```
<!-- CODESCAN_FILE_END -->

---

### 367.'C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationTemplatesList.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\IntegrationTemplatesList\IntegrationTemplatesList.tsx" type=".tsx" size="1901" lines="69" chars="1901" -->
```typescript
import React, { useEffect, useState } from 'react';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { useAppContext } from 'context/app-context';
import { client2 } from 'utils/api-client';
import { IntegrationTemplateInfo } from 'types';
import IntegrationTemplateDataGrid from './IntegrationTemplateDataGrid';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate } from 'react-router-dom';

const IntegrationTemplatesList = () => {
const [configTemplates, setConfigTemplatesList] = useState<
IntegrationTemplateInfo[]
  >{[]];
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const push = useNavigate();

  const {
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
} = useAppContext();

  useEffect(() => {
setPageTitle('Integration Templates');
setDisplayCreateButton(true);
}, []);

  useEffect(() => {
if (createButtonClicked) {
setCreateButtonClicked(false);
push(Paths.IntegrationTemplatesCreate);
}
}, [createButtonClicked]);

  useEffect(() => {
if (!loading) return;

    client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-templates`,
    ]
.then((data) => {
const configTemplates: IntegrationTemplateInfo[] = data.payload;
setConfigTemplatesList(configTemplates);
setLoading(false);
      }]
.catch((error) => {
console.error(error);
setLoading(false);
setErrorResponse(error);
      }];
}, [loading]);

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  if (!configTemplates) return <div />;

  return (
<div>
<IntegrationTemplateDataGrid configTemplates={configTemplates} />
</div>
  ];
};

export default IntegrationTemplatesList;

```
<!-- CODESCAN_FILE_END -->

---

### 368.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__IfakeDataDrivenTemplate.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__\fakeDataDrivenTemplate.ts" type=".ts" size="10718" lines="391" chars="10718" -->
```typescript
export default {
templateId: '30473BE5-71D2-4675-B2B1-A0BAD66189A1',
recordState: 'Active',
name: 'Unit test template',
description: 'Unit test template.',
source: 'MeridianLink LOS v1.x',
integrationType: 'Data Staging',
version: 1,
versionDescription: '',
metadataJSON: {},
templateSpecificationJSON: JSON.stringify({
form: {
layout: {
row: {
          `; ` ; {
col: {
'1': ['SECTION-TEXT-FIELDS'],
'2': ['SECTION-SINGLE-SELECTS'],
},
},
'2': {
col: {
'1': ['SECTION-BASIC-FIELDS'],
},
},
},
},
},
sections: [
{
sectionCode: 'SECTION-TEXT-FIELDS',
sectionTitle: 'Text Fields',
showTitle: true,
isUsed: true,
isDisplayed: true,
flowOrder: 1,
settings: [
{
settingCode: 'TEXT-FIELD-REQUIRED-TEST',
displayOrder: 1,
type: 'text-entry',
label: 'Required Text Field',
valueType: 'text',
required: true,
disabled: false,
},
{
settingCode: 'TEXT-FIELD-OPTIONAL-TEST',
displayOrder: 2,
type: 'text-entry',
label: 'Optional Text Field',
valueType: 'text',
required: false,
disabled: false,
},
{
settingCode: 'TEXT-FIELD-URL-TEST',
displayOrder: 3,
type: 'text-entry',
label: 'URL Field',
valueType: 'url',
required: false,
disabled: false,
},
{
settingCode: 'TEXT-FIELD-MULTI-LINE-TEST',
displayOrder: 4,
type: 'textbox',
label: 'Multi-Line Field',
required: true,
enabled: true,
multiline: true,
rowsMax: 5,
},
{
settingCode: 'TEXT-FIELD-DISABLED-TEST',
displayOrder: 5,
type: 'text-entry',
label: 'Disabled Field',
valueType: 'text',
required: true,
disabled: true,
},
],
},
{
sectionCode: 'SECTION-SINGLE-SELECTS',
sectionTitle: 'Single Selections',
showTitle: true,
isUsed: true,
isDisplayed: true,
flowOrder: 2,
settings: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST',
displayOrder: 1,
type: 'single-select-list',
style: 'radiobutton',
showNoSelection: true,
label: 'Radio Buttons',
valueType: 'code',
required: true,
options: [
{
order: 1,
value: 'RB-OPTION-ONE',
displayValue: 'Option 1',
enabled: true,
selected: true,
},
{
order: 2,
value: 'RB-OPTION-TWO',
displayValue: 'Option 2',
enabled: true,
selected: false,
},
{
order: 3,
value: 'RB-OPTION-THREE',
displayValue: 'Option 3',
enabled: false,
selected: false,
},
],
},
{
settingCode: 'SINGLE-SELECT-DROPDOWN-TEST',
displayOrder: 2,
type: 'single-select-list',
style: 'dropdown',
showNoSelection: true,
noSelectionLabel: 'Choose One',
label: 'Drop Down',
valueType: 'code',
required: true,
options: [
{
order: 1,
value: 'DD-OPTION-ONE',
displayValue: 'Option 1',
enabled: true,
selected: false,
},
{
order: 2,
value: 'DD-OPTION-TWO',
displayValue: 'Option 2',
enabled: true,
selected: false,
},
{
order: 3,
value: 'DD-OPTION-THREE',
displayValue: 'Option 3',
enabled: false,
selected: false,
},
{
order: 4,
value: 'DD-OPTION-FOUR',
displayValue: 'Option 4',
enabled: true,
selected: false,
},
],
},
],
},
{
sectionCode: 'SECTION-BASIC-FIELDS',
sectionTitle: 'Basic Fields',
showTitle: true,
isUsed: true,
isDisplayed: true,
flowOrder: 3,
settings: [
{
settingCode: 'FIELD-NUMBER-TEST',
displayOrder: 1,
type: 'text-entry',
label: 'Number Field',
valueType: 'number',
required: true,
disabled: false,
},
{
settingCode: 'FIELD-INTEGER-TEST',
displayOrder: 2,
type: 'text-entry',
label: 'Integer Field',
valueType: 'integer',
required: true,
disabled: false,
},
{
settingCode: 'FIELD-INTEGER-RULE-TEST',
displayOrder: 3,
type: 'text-entry',
label: 'Integer Rule Field',
valueType: 'integer',
required: false,
rules: [
{
type: 'numeric comparison',
definition: {
operator: '<',
otherSetting: 'FIELD-INTEGER-TEST',
violationMessage:
'Rule Field value must be less than Integer Field value',
},
},
],
},
{
settingCode: 'FIELD-SWITCH-TEST',
displayOrder: 4,
type: 'on-off',
style: 'switch',
label: 'Switch Boolean',
valueType: 'Boolean',
required: true,
enabled: true,
selected: true,
},
{
settingCode: 'FIELD-CHECKBOX-GROUP-TEST',
displayOrder: 5,
type: 'multi-select-list',
style: 'checkbox',
minimumSelections: 1,
label: 'Select One or More',
valueType: 'code',
required: true,
numberOfColumns: 2,
options: [
{
order: 1,
value: 'FIELD-CHECKBOX-ONE',
displayValue: 'Option 1',
enabled: true,
selected: false,
},
{
order: 2,
value: 'FIELD-MULTI-TWO',
displayValue: 'Option 2',
enabled: true,
selected: false,
},
{
order: 3,
value: 'FIELD-MULTI-THREE',
displayValue: 'Option 3',
enabled: false,
selected: false,
},
{
order: 4,
value: 'FIELD-MULTI-FOUR',
displayValue: 'Option 4',
enabled: true,
selected: false,
},
{
order: 5,
value: 'FIELD-MULTI-FIVE',
displayValue: 'Option 5',
enabled: true,
selected: false,
},
],
},
],
},
],
  }},
specificationJSON: JSON.stringify({
sections: [
{
sectionCode: 'SECTION-TEXT-FIELDS',
isUsed: true,
settings: [
{
settingCode: 'TEXT-FIELD-REQUIRED-TEST',
valueType: 'text-entry',
value: '',
displayValue: '',
},
{
settingCode: 'TEXT-FIELD-OPTIONAL-TEST',
valueType: 'text-entry',
value: '',
displayValue: '',
},
{
settingCode: 'TEXT-FIELD-URL-TEST',
valueType: 'text-entry',
value: '',
displayValue: '',
},
{
settingCode: 'TEXT-FIELD-MULTI-LINE-TEST',
valueType: 'text-entry',
value: '',
displayValue: '',
},
{
settingCode: 'TEXT-FIELD-DISABLED-TEST',
valueType: 'text-entry',
value: 'This text cannot be edited',
displayValue: 'This text cannot be edited',
},
],
},
{
sectionCode: 'SECTION-SINGLE-SELECTS',
isUsed: true,
settings: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST',
valueType: 'code',
value: 'RB-OPTION-ONE',
displayValue: 'Option 1',
},
{
settingCode: 'SINGLE-SELECT-DROPDOWN-TEST',
valueType: 'code',
value: 'DD-OPTION-TWO',
displayValue: 'Option 2',
},
],
},
{
sectionCode: 'SECTION-BASIC-FIELDS',
isUsed: true,
settings: [
{
settingCode: 'FIELD-NUMBER-TEST',
valueType: 'number',
value: '',
displayValue: '',
},
{
settingCode: 'FIELD-INTEGER-TEST',
valueType: 'integer',
value: '5',
displayValue: '5',
},
{
settingCode: 'FIELD-INTEGER-RULE-TEST',
valueType: 'integer',
value: '',
displayValue: '',
},
{
settingCode: 'FIELD-SWITCH-TEST',
valueType: 'boolean',
value: false,
},
{
settingCode: 'FIELD-CHECKBOX-ONE',
valueType: 'boolean',
value: false,
},
{
settingCode: 'FIELD-CHECKBOX-TWO',
valueType: 'boolean',
value: false,
},
{
settingCode: 'FIELD-CHECKBOX-THREE',
valueType: 'boolean',
value: false,
},
{
settingCode: 'FIELD-CHECKBOX-FOUR',
valueType: 'boolean',
value: false,
},
{
settingCode: 'FIELD-CHECKBOX-FIVE',
valueType: 'boolean',
value: false,
},
],
},
],
  }},
};

```
<!-- CODESCAN_FILE_END -->

---

### 369.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__IfakeDataDrivenTemplateCollection.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__\fakeDataDrivenTemplateCollection.ts" type=".ts" size="4551" lines="158" chars="4551" -->
```typescript
export default {
templateId: '30473BE5-71D2-4675-B2B1-A0BAD66189A1',
recordState: 'Active',
name: 'Unit test template',
description: 'Unit test template.',
source: 'MeridianLink LOS v1.x',
integrationType: 'Data Staging',
version: 1,
versionDescription: '',
metadataJSON: {},
templateSpecificationJSON: JSON.stringify({
form: {
layout: {
row: {
           `; ` ; {
col: {
'1': ['SECTION-MEMBERSHIP'],
},
},
},
},
},
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
sectionTitle: 'Member Definition',
showTitle: true,
isUsed: true,
isDisplayed: true,
flowOrder: 1,
settings: [
{
settingCode: 'FIELD-DISTINCT-SSN',
displayOrder: 1,
type: 'on-off',
style: 'switch',
label: 'Distinct SSN',
valueType: 'Boolean',
required: true,
enabled: true,
selected: true,
collectionSettings: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST',
displayOrder: 1,
type: 'single-select-list',
style: 'radiobutton',
showNoSelection: true,
label: 'Business Rules',
valueType: 'code',
required: true,
options: [
{
order: 1,
value: 'RB-OPTION-ONE',
displayValue: 'Include',
enabled: true,
selected: true,
},
{
order: 2,
value: 'RB-OPTION-TWO',
displayValue: 'Exclude',
enabled: true,
selected: false,
},
],
},
{
settingCode: 'SINGLE-SELECT-DROPDOWN-TEST',
displayOrder: 2,
type: 'single-select-list',
style: 'dropdown',
showNoSelection: true,
noSelectionLabel: 'Choose One',
label: 'Key',
valueType: 'code',
required: true,
options: [
{
order: 1,
value: 'DD-OPTION-ONE',
displayValue: 'SSN',
enabled: true,
selected: false,
},
{
order: 2,
value: 'DD-OPTION-TWO',
displayValue: 'TBD',
enabled: true,
selected: false,
},
],
},
],
},
],
},
],
  }},
specificationJSON: JSON.stringify({
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
isUsed: true,
settings: [
{
settingCode: 'FIELD-DISTINCT-SSN',
valueType: 'switchcollection',
value: true,
            CtrlcCollection: [
{
item: 1,
values: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST-1',
valueType: 'Boolean',
value: 'RB-OPTION-ONE',
label: 'Business Rules',
displayValue: 'Include',
},
{
settingCode: 'SINGLE-SELECT-DROPDOWN-TEST-1',
valueType: 'code',
value: 'DD-OPTION-ONE',
label: 'Key',
displayValue: 'SSN',
},
],
},
{
item: 2,
values: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST-2',
valueType: 'Boolean',
value: 'RB-OPTION-TWO',
label: 'Business Rules',
displayValue: 'Exclude',
},
{
settingCode: 'SINGLE-SELECT-DROPDOWN-TEST-2',
valueType: 'code',
value: 'DD-OPTION-TWO',
label: 'Key',
displayValue: 'TBD',
},
],
},
],
},
],
},
],
  }},
};

```
<!-- CODESCAN_FILE_END -->

---

### 370。

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__\fakeDataDrivenTenantSpecification.ts" type=".ts" size="4798" lines="186" chars="4798" -->
```typescript
export default {
id: '11111111-1111-1111-1111-111111111111',
tenantId: '22222222-2222-2222-2222-222222222222',
templateId: '33333333-3333-3333-3333-333333333333',
recordState: 'Draft',
name: 'Some Product Name',
category: 'Lending',
type: 'Auto',
subtype: 'New',
version: 1,
versionDescription: '',
startDate: null,
endDate: null,
allowSimulation: true,
metadataJSON: '{}',
businessRulesJSON: '{}',
specificationJSON: JSON.stringify({
sections: [
{
sectionCode: 'SETUP',
sectionTitle: 'Tenant Setup',
isUsed: true,
settings: [
{
settingCode: 'CORE-PRODUCT-START-DATE',
valueType: 'text-entry',
value: '10/10/2000',
displayValue: '10/10/2000',
},
{
settingCode: 'CORE-PRODUCT-END-DATE',
valueType: 'text-entry',
value: '',
displayValue: '',
},
{
settingCode: 'CORE-PRODUCT-NAME',
valueType: 'text-entry',
value: 'Some Product Name',
displayValue: '',
},
{
settingCode: 'CORE-PRODUCT-CATEGORY',
valueType: 'text-entry',
value: 'Lending',
displayValue: 'Lending',
},
{
settingCode: 'CORE-PRODUCT-TYPE',
valueType: 'text-entry',
value: 'Auto',
displayValue: 'Auto',
},
{
settingCode: 'CORE-PRODUCT-SUBTYPE',
valueType: 'text-entry',
value: 'New',
displayValue: 'New',
},
{
settingCode: 'VEHICLE-TYPE',
valueType: 'code',
value: 'AUTO',
displayValue: 'Auto',
},
{
settingCode: 'MAX-LOAN-AMOUNT',
valueType: 'number',
value: '80000',
},
{
settingCode: 'MIN-LOAN-AMOUNT',
valueType: 'number',
value: '1000',
},
{
settingCode: 'LOAN-APPLICATION-IDLE-DURATION',
valueType: 'integer',
value: '20',
},
{
settingCode: 'LOAN-APPLICATION-EXPIRY-DURATION',
valueType: 'integer',
value: '30',
},
{
settingCode: 'ASSOC-TO-ALL-MERCHANTS',
valueType: 'boolean',
value: false,
},
{
settingCode: 'ALLOW-SIMULATION',
valueType: 'boolean',
value: true,
},
{
settingCode: 'MIN-MONTHLY-PAYMENT-DOLLARS',
valueType: 'text-entry',
value: '100',
},
{
settingCode: 'MIN-MONTHLY-PAYMENT-PERCENTAGE',
valueType: 'text-entry',
value: '200',
},
],
},
{
sectionCode: 'MEMBERSHIP',
isUsed: true,
settings: [
{
settingCode: 'ELIGIBILITY',
valueType: 'code',
value: 'MEMBERS',
displayValue: 'Members Only',
},
],
},
{
sectionCode: 'DISBURSEMENT',
isUsed: true,
settings: [
{
settingCode: 'CHECK-TO-DEALER',
valueType: 'boolean',
value: false,
},
{
settingCode: 'DIRECT-DEPOSIT-BORROWER-ACCT',
valueType: 'boolean',
value: true,
},
{
settingCode: 'CHECK-TO-BORROWER',
valueType: 'boolean',
value: false,
},
],
},
{
sectionCode: 'COLLATERAL',
isUsed: true,
settings: [
{
order: 1,
settingCode: 'COLLATERAL-VIN-REQUIRED',
valueType: 'boolean',
value: false,
},
],
},
{
sectionCode: 'INTEGRATIONS',
isUsed: true,
settings: [
{
settingCode: 'INTEGRATIONS-CORE-BANKING',
valueType: 'code',
value: 'SYMITAR',
displayValue: 'Symitar',
},
{
settingCode: 'INTEGRATIONS-HOME-BANKING',
valueType: 'code',
value: 'SYMITAR',
displayValue: 'Symitar',
},
{
settingCode: 'INTEGRATIONS-LOS',
valueType: 'code',
value: 'MERIDIAN-LINK',
displayValue: 'Meridian Link',
},
{
settingCode: 'INTEGRATIONS-VALUATION',
valueType: 'code',
value: 'KBB',
displayValue: 'KBB',
},
],
},
],
  }},
};

```
<!-- CODESCAN_FILE_END -->

---

### 371.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__ITenantIntegrationProfile.test.js'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__\TenantIntegrationProfile.test.js" type=".js" size="13618" lines="455" chars="13618" -->
```javascript
import React from 'react';
import {
fireEvent,
queryByAttribute,
render,
screen,
waitFor,
} from '@testing-library/react';

import {
renderWithMockTenant,
wrapWithMockTenant,
} from 'components/__mock__/mock-context';
import TenantIntegrationProfile from '../TenantIntegrationProfile';
import { fail } from 'assert';
import mockTenantCollection from './fakeDataDrivenTemplateCollection';
import mockTenantTemplate from './fakeDataDrivenTemplate';
import * as RouterDom from 'react-router-dom';

const getById = queryByAttribute.bind(null, 'id');

const TEST_TIMEOUT = 20000;
const tenantId = 'befce8e5-777a-476d-bace-5bbb8793e4ac';
const templateId = '30473BE5-71D2-4675-B2B1-A0BAD66189A1';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: jest.fn(),
}}];

describe('TenantIntegrationProfile', () => {
const fetchSpy = jest.spyOn(window, 'fetch').mockResolvedValue({});
const mockTenant = { id: tenantId };

  beforeEach(() => {
fetchSpy.mockResolvedValue({});
  }};

  afterEach(() => {
fetchSpy.mockClear();
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  test('Test view mode', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'view',
    }}];

    // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantCollection,
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockTemplatePromise,
    }};

    renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);
//props.debug();
//dom.debug();
//findByText blocks until the Product Setup card header is loaded (or a timeout occurs)
await screen.findByText('Distinct SSN');

    // un-select direct deposit to borrower
const disbursementCheckbox = screen.getByRole('FIELD-DISTINCT-SSN-view');
expect(disbursementCheckbox.textContent).toBe('Yes');
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Error view mode', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'view',
    }}];

    // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantTemplate,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: false,
json: () => {
throw new Error('Error converting data');
},
    }};

    renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Save as active in create mode', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'create',
    }}];

    // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantTemplate,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
    }};

    const dom = renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);

    // findByText blocks until the Product Setup card header is loaded (or a timeout occurs)
await screen.findByText('Switch Boolean');

    const nameAddressCheckbox = getById(
dom.container,
'FIELD-SWITCH-TEST-toggle',
    ];
fireEvent.click(nameAddressCheckbox);

    // populate the product name text box
const nameTextBox = getById(
dom.container,
'tenant-profile-setting-TEXT-FIELD-REQUIRED-TEST',
    ];
fireEvent.change(nameTextBox, {
target: { value: 'a'.repeat(49) },
}); // length > 20

    fetchSpy.mockImplementationOnce((endpoint, config) => {
// mock second upload, which sets the product in Active state
expect(config).not.toBeNull();
expect(config.body).not.toBeNull();
const tenantConfig = JSON.parse(config.body);
expect(tenantConfig.recordState).toBe('Active');

      return Promise.resolve({
ok: true,
json: () => {},
      }];
    }};

    const saveActiveButton = getById(dom.container, 'tenant-profile-save');
fireEvent.click(saveActiveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
}, 5000);

  test('create mode trigger validation', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'create',
    }}];

    // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantTemplate,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
    }};

    const dom = renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);

    // findByText blocks until the Product Setup card header is loaded (or a timeout occurs)
const ssnLabel = await screen.findByText('Switch Boolean');
expect(ssnLabel);

    const nameAddressCheckbox = getById(
dom.container,
'FIELD-SWITCH-TEST-toggle',
    ];
fireEvent.click(nameAddressCheckbox);

    // populate the product name text box
const nameTextBox = getById(
dom.container,
'tenant-profile-setting-TEXT-FIELD-REQUIRED-TEST',
    ];
fireEvent.change(nameTextBox, {
target: { value: 'a'.repeat(49) },
}); // length > 20

    fetchSpy.mockImplementationOnce((endpoint, config) => {
// mock second upload, which sets the product in Active state
expect(config).not.toBeNull();
expect(config.body).not.toBeNull();
const tenantConfig = JSON.parse(config.body);
expect(tenantConfig.recordState).toBe('Active');

      return Promise.resolve({
ok: true,
json: () => {},
      }];
    }};

    const saveActiveButton = getById(dom.container, 'tenant-profile-save');
fireEvent.click(saveActiveButton);

    const errorValidation = await screen.findByText(
'Multi-Line Field is a required field',
    ];
expect(errorValidation);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Error on fetch', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'create',
    }}];

    fetchSpy.mockResolvedValueOnce({
ok: false,
json: () =>
Promise.resolve(JSON.stringify({ result: { message: 'Bad Request' } })),
    }};
  }};

  test('Bad request response on GET in create mode', async () => {
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'create',
    }}];
const viewMode = 'create';

    // mock the tenant template fetch
fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(JSON.stringify({ result: { message: 'Bad Request' } })),
    }};

    renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);

    await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(consoleSpy).toHaveBeenCalled();
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Bad request response on GET in view mode', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'view',
    }}];
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // mock the tenant template fetch
fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(JSON.stringify({ result: { message: 'Bad Request' } })),
    }};

    renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);

    await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(consoleSpy).toHaveBeenCalled();
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Create mode Add Collection Item', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
tenantId: 'tenantId',
templateId: 'templateId',
viewMode: 'create',
    }}];

    // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantCollection,
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockTemplatePromise,
    }};

    const dom = renderWithMockTenant(mockTenant, <TenantIntegrationProfile />);

    await screen.findByText('Distinct SSN');

    const addItem = getById(dom.container, 'FIELD-DISTINCT-SSN-button');
fireEvent.click(addItem);

    // //   // // populate the product name text box
// const nameTextBox = getById(
//   dom.container,
//   'tenant-profile-setting-TEXT-FIELD-REQUIRED-TEST',
// );
// console.log(nameTextBox);
// fireEvent.change(nameTextBox, {
//   target: { value: '1'.repeat(5) },
// }); // length > 20

    // populate the product name text box
// const valueTextBox = getById(
//   dom.container,
//   'tenant-profile-setting-TEXT-FIELD-REQUIRED-TEST',
// );
// act(() =>
//   fireEvent.change(valueTextBox, {
//     target: { value: '2'.repeat(10) },
//   }),
// ); // length > 20

    // const popDiscard = getById(
//   dom.container,
//   'FIELD-DISTINCT-SSN-discard-changes',
// );
// act(() => fireEvent.click(popDiscard));

    //act(() => fireEvent.click(addItem));

    // const popOverAdd = getById(dom.container, 'FIELD-DISTINCT-SSN-save');
// act(() => fireEvent.click(popOverAdd));

    const deleteItem = getById(dom.container, 'FIELD-DISTINCT-SSN1_delete');
fireEvent.click(deleteItem);
// FIELD-DISTINCT-SSN-discard-changes
// _delete
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
fetchSpy.mockImplementation((endpoint, config) => {
// mock second upload, which sets the product in Active state
if (config.method !== 'GET') {
expect(config).not.toBeNull();
expect(config.body).not.toBeNull();
const tenantConfig = JSON.parse(config.body);
expect(tenantConfig.recordState).toBe('Active');
}

      return Promise.resolve({
ok: true,
json: () => {},
      }];
    }};

    const saveActiveButton = getById(dom.container, 'tenant-profile-save');
fireEvent.click(saveActiveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test.skip(
'Create mode toggle slider collection',
async () => {
const viewMode = 'create';

      const props = {
history: {
location: {
pathname: /admin/tenant/${tenantId}/tenant-integration-profiles/${templateId}/${viewMode}',
},
},
match: {
params: {
tenantId,
templateId,
viewMode,
},
},
};

      // mock the tenant template fetch
const mockTemplatePromise = Promise.resolve({
payload: mockTenantCollection,
      }];

      fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatePromise,
      }];
const { container } = render(<TenantIntegrationProfile {...props} />, {
wrapper: wrapWithMockTenant(mockTenant),
      }];

      await screen.findByText('Distinct SSN');

      fireEvent.click(
screen.getByRole('checkbox', 'FIELD-DISTINCT-SSN-toggle'),
      ];

      const addItem = getById(container, 'FIELD-DISTINCT-SSN-button');
fireEvent.click(addItem);

      const addButton = screen.getByRole('button', { name: 'Add' });
fireEvent.click(addButton);
fireEvent.click(screen.getByRole('button', { name: 'Key' }));
// Type selection

      const optionsType = await screen.findAllByRole('option');
//optionsType.forEach(option => wrapper.debug(option));
const targetTypeOption = optionsType[1];

      fireEvent.click(targetTypeOption);

      // Radio
const elementsRadio = screen.getAllByRole('radio');

      if (!elementsRadio || elementsRadio.length === 0) {
fail('No radio button elements found.');
}

      const valueKey = 'RB-OPTION-ONE';
const targetElementRadio = elementsRadio.find(
(x) => x.value === valueKey,
      ];

      if (!targetElementRadio) {
fail(`Could not find radio button with value key ${valueKey}.`);
}

      fireEvent.click(targetElementRadio);

      fetchSpy.mockImplementationOnce((endpoint, config) => {
// mock second upload, which sets the product in Active state
expect(config).not.toBeNull();
expect(config.body).not.toBeNull();
const tenantConfig = JSON.parse(config.body);
expect(tenantConfig.recordState).toBe('Active');

        return Promise.resolve({
ok: true,
json: () => Promise.resolve({}),
        }];
      }];

      const saveActiveButton = getById(container, 'tenant-profile-save');
fireEvent.click(saveActiveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
},
TEST_TIMEOUT,
  ];
}};

```
<!-- CODESCAN_FILE_END -->

---

### 372。'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__ITenantIntegrationProfilesList.test.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__ITenantIntegrationProfileslist.test.tsx" type=".tsx" size="7939" lines="248" chars="7939" -->
```typescript
import React from 'react';

import {
queryByAttribute,
fireEvent,
screen,
waitFor,
} from '@testing-library/react';
import { renderWithMockTenant } from 'components/__mock__/mock-context';

import { v4 as uuid } from 'uuid';
import TenantIntegrationProfilesList from '../TenantIntegrationProfilesList';

import * as apiClient from '../../../utils/api-client';

const tenantId = 'tenantId';
const getById = queryByAttribute.bind(null, 'id');
const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: () => ({
tenantId,
  }},
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];

describe('TenantIntegrationProfileList', () => {
const mockTenant = {
id: tenantId,
};
const integrationA = () => {
return {
description: 'ABC1 Desc',
integrationType: 'Data Staging',
lastUpdated: '2021-03-05T01:02:33.426Z',
name: 'Tennant ABC1',
recordState: 'Active',
source: 'Symitar Core',
profileId: '4930AC79-170E-48EA-9A2B-C94F9DCC296F',
version: 4,
versionDescription: 'Initial Version',
};
};

  const integrationB = () => {
return {
description: 'ABC2 Desc',
integrationType: 'Data Staging1',
lastUpdated: '2021-03-05T01:02:33.426Z',
name: 'Tennant ABC2',
recordState: 'Active',
source: 'Symitar Core2',
profileId: '5230AC79-170E-48EA-9A2B-C94F9DCC296G',
version: 4,
versionDescription: 'Initial Version',
};
};
afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  test('Test population of tenant integration profiles list', async () => {
jest.spyOn(apiClient, 'client2').mockResolvedValue({
payload: [integrationA(), integrationB()],
    }};

    renderWithMockTenant(mockTenant, <TenantIntegrationProfilesList />);
await screen.findByText('Name');

    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(3));
const rows = screen.getAllByRole('row');
const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Tennant ABC1');
expect(productRow1.item(1)).toHaveTextContent('ABC1 Desc');
expect(productRow1.item(2)).toHaveTextContent('Symitar Core');
expect(productRow1.item(3)).toHaveTextContent('Data Staging');

    expect(productRow2.item(0)).toHaveTextContent('Tennant ABC2');
expect(productRow2.item(1)).toHaveTextContent('ABC2 Desc');
expect(productRow2.item(2)).toHaveTextContent('Symitar Core2');
expect(productRow2.item(3)).toHaveTextContent('Data Staging1');

    const rowToView = rows[1];
expect(rowToView);
}, 1000);

  test.skip('Error fetching tenant integration profiles list', async () => {
jest
.spyOn(apiClient, 'client2')
.mockRejectedValue({ message: 'error message', statusCode: '500' });

    const dom = renderWithMockTenant(
tenantId,
<TenantIntegrationProfilesList />,
    ];

    const errorNotification = await dom.findByRole('full-page-status-error');
expect(errorNotification);
  }};

  test('Test Edit click', async () => {
jest.spyOn(apiClient, 'client2').mockResolvedValue({
payload: [integrationA(), integrationB()],
    }};

    // jest.spyOn(window, 'fetch').mockResolvedValue({
//   ok: true,
//   json: () => mockTenantIntegrationProfilesListPromise,
// } as Response);

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantIntegrationProfilesList />,
    ];
const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);
//console.log(rows[0].childNodes);
// console.log(rows[1].childNodes);
const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Tennant ABC1');
expect(productRow1.item(1)).toHaveTextContent('ABC1 Desc');
expect(productRow1.item(2)).toHaveTextContent('Symitar Core');
expect(productRow1.item(3)).toHaveTextContent('Data Staging');

    expect(productRow2.item(0)).toHaveTextContent('Tennant ABC2');
expect(productRow2.item(1)).toHaveTextContent('ABC2 Desc');
expect(productRow2.item(2)).toHaveTextContent('Symitar Core2');
expect(productRow2.item(3)).toHaveTextContent('Data Staging1');

    expect(nameHeader);

    const rowToView = rows[1];
expect(rowToView);

    const viewButton = getById(
wrapper.container,
'4930AC79-170E-48EA-9A2B-C94F9DCC296F_edit',
    ];
expect(viewButton);
fireEvent.click(viewButton as HTMLElement);

    expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/${tenantId}/tenant-integration-profiles/4930AC79-170E-48EA-9A2B-C94F9DCC296F/edit',
    ];
}, 1000);

  test('Test View click', async () => {
jest.spyOn(apiClient, 'client2').mockResolvedValue({
payload: [integrationA(), integrationB()],
    }};

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantIntegrationProfilesList />,
    ];
const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);
//console.log(rows[0].childNodes);
// console.log(rows[1].childNodes);
const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Tennant ABC1');
expect(productRow1.item(1)).toHaveTextContent('ABC1 Desc');
expect(productRow1.item(2)).toHaveTextContent('Symitar Core');
expect(productRow1.item(3)).toHaveTextContent('Data Staging');

    expect(productRow2.item(0)).toHaveTextContent('Tennant ABC2');
expect(productRow2.item(1)).toHaveTextContent('ABC2 Desc');
expect(productRow2.item(2)).toHaveTextContent('Symitar Core2');
expect(productRow2.item(3)).toHaveTextContent('Data Staging1');

    expect(nameHeader);

    const rowToView = rows[1];
expect(rowToView);

    const viewButton = getById(
wrapper.container,
'4930AC79-170E-48EA-9A2B-C94F9DCC296F_view',
    ];
expect(viewButton);
fireEvent.click(viewButton as HTMLElement);

    expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/${tenantId}/tenant-integration-profiles/4930AC79-170E-48EA-9A2B-C94F9DCC296F/view',
    ];
}, 1000);

  test('Test Delete click', async () => {
jest.spyOn(apiClient, 'client2').mockResolvedValue({
payload: [integrationA(), integrationB()],
    }};

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantIntegrationProfilesList />,
    ];
const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);
//console.log(rows[0].childNodes);
// console.log(rows[1].childNodes);
const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent('Tennant ABC1');
expect(productRow1.item(1)).toHaveTextContent('ABC1 Desc');
expect(productRow1.item(2)).toHaveTextContent('Symitar Core');
expect(productRow1.item(3)).toHaveTextContent('Data Staging');

    expect(productRow2.item(0)).toHaveTextContent('Tennant ABC2');
expect(productRow2.item(1)).toHaveTextContent('ABC2 Desc');
expect(productRow2.item(2)).toHaveTextContent('Symitar Core2');
expect(productRow2.item(3)).toHaveTextContent('Data Staging1');

    expect(nameHeader);

    const rowToView = rows[1];
expect(rowToView);

    const viewButton = getById(
wrapper.container,
'4930AC79-170E-48EA-9A2B-C94F9DCC296F_delete',
    ];
expect(viewButton);
fireEvent.click(viewButton as HTMLElement);
}, 1000);
}};

```
<!-- CODESCAN_FILE_END -->

---

### 373.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__ITenantProfileContext.test.js'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\__test__ITenantProfileContext.test.js" type=".js" size="17542" lines="637" chars="17542" -->
```javascript
import TenantProfileContext from '../TenantProfileContext';
import { v4 as uuid } from 'uuid';
import ViewMode from 'context/view-mode';
import { exception } from 'console';

describe('TenantProfileContext', () => {
const tenantTemplate = {
templateSpecificationJSON: {
id: uuid(),
form: {
layout: [],
},
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
isUsed: true,
settings: [],
},
],
},
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
isUsed: true,
settings: [],
},
],
recordState: 'Active',
};
const fetchSpy = jest.spyOn(window, 'fetch');

  afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  test('View', (done) => {
//let uploaderInvokeCount = 0;

    const props = {
tenant: { id: uuid() },
viewMode: ViewMode.View,
tenantTemplate,
recordState: 'Active',
setUploadError: (v) => {
if (v) done(); // if the upload error flag is true, the test is done
},

      formOperations: {
setFormError: (v) => {
if (v) fail();
},
},

      routerPush: jest.fn(),
};

    const context = new TenantProfileContext(props);

    jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    // mock upload of data-driven fields
fetchSpy.mockImplementation(() => {
return Promise.resolve({
ok: true,
json: () => {},
      }];
    }};
done();
//context.startUpload('Active');
  }};

  test('Set Error TEST', (done) => {
const props = {
tenant: { id: uuid() },
viewMode: ViewMode.View,
tenantTemplate,
recordState: 'Active',
formOperations: {
setFormError: (v) => {
if (v) fail('Form error should not be triggered');
},
},

      routerPush: jest.fn(),
};

    const context = new TenantProfileContext(props);

    // trigger the componentDidUpdate React method whenever the setState method is called
jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};
done();
  }};

  test('Error API test', (done) => {
//let uploaderInvokeCount = 0;

    const props = {
tenant: { id: uuid() },
viewMode: ViewMode.View,
tenantTemplate,
recordState: 'Active',
formOperations: {
setFormError: (v) => {
if (v) fail();
},
},

      routerPush: (v) => {
// expect(uploaderInvokeCount).toBe(3);
done();
},
};

    const context = new TenantProfileContext(props);

    jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    jest.spyOn(context, 'checkForErrors').mockImplementation((func) => {
context.state = func(context.state);
context.checkForErrors();
    }};

    // mock upload of data-driven fields
fetchSpy.mockImplementation(() => {
return Promise.resolve({
ok: true,
json: () => {},
      }];
    }};
done();
//context.startUpload('Active');
  }};

  test('Error test', (done) => {
//let uploaderInvokeCount = 0;

    const props = {
tenant: { id: uuid() },
viewMode: ViewMode.View,
tenantTemplate,
recordState: 'Active',
formOperations: {
setFormError: (v) => {
if (v) fail();
},
},

      routerpush: (v) => {
// expect(uploaderInvokeCount).toBe(3);
done();
},
};

    const context = new TenantProfileContext(props);

    jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    jest.spyOn(context, 'checkForErrors').mockImplementation((func) => {
context.state = func(context.state);
context.checkForErrors();
    }};

    // mock upload of data-driven fields
fetchSpy.mockImplementation(() => {
return new exception('Error');
    }};
done();
//context.startUpload('Active');
  }};

  test('Less Sections test', (done) => {
//let uploaderInvokeCount = 0;

    const props = {
tenant: { id: uuid() },
viewMode: ViewMode.View,
tenantTemplate: {
templateSpecificationJSON: {
id: uuid(),
form: {
layout: [],
},
sections: [],
},
sections: [],
recordState: 'Active',
},
recordState: 'Active',
formOperations: {
setFormError: (v) => {
if (v) fail();
},
},

      routerpush: (v) => {
// expect(uploaderInvokeCount).toBe(3);
done();
},
};

    const context = new TenantProfileContext(props);
jest.spyOn(context, 'checkForErrors').mockImplementation((func) => {
context.checkForErrors();
    }};

    // mock upload of data-driven fields
fetchSpy.mockImplementation(() => {
return new exception('Error');
    }};
done();
//context.startUpload('Active');
  }};

  const getSimpleTemplateLayout = () =>
JSON.parse(
JSON.stringify({
id: uuid(),
layout: {
row: {
            ; ; {
col: {
1: ['TEST'],
},
},
},
},
sections: [
{
sectionCode: 'TEST',
sectionTitle: 'Test',
showTitle: true,
isUsed: true,
isDisplayed: true,
settings: [
{
settingCode: 'ON-OFF-SWITCH',
displayOrder: 1,
type: 'on-off',
style: 'switch',
label: 'On/Off Switch',
valueType: 'Boolean',
required: true,
enabled: true,
selected: false,
},
],
},
],
      }],
    ];

  const getSimpleTemplateLayoutUniversal = () =>
JSON.parse(
JSON.stringify({
id: uuid(),
layout: {
row: {
            ; ; {
col: {
1: ['SECTION-MEMBERSHIP'],
},
},
},
},
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
sectionTitle: 'Member Definition',
showTitle: true,
isUsed: true,
isDisplayed: true,
settings: [
{
settingCode: 'FIELD-DISTINCT-SSN',
displayOrder: 1,
type: 'on-off',
style: 'switch',
label: 'On/Off Switch',
valueType: 'Boolean',
required: true,
enabled: true,
selected: true,
collectionSettings: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST',
displayOrder: 1,
type: 'single-select-list',
style: 'radiobutton',
label: 'Business Rules',
valueType: 'code',
required: true,
showNoSelection: true,
options: [
{
order: 1,
value: 'RB-OPTION-ONE',
displayValue: 'Include',
enabled: true,
selected: true,
},
{
order: 2,
value: 'RB-OPTION-TWO',
displayValue: 'Exclude',
enabled: true,
selected: true,
},
],
},
{
settingCode: 'TEXT-FIELD-REQUIRED-TEST',
displayOrder: 3,
type: 'text-entry',
label: 'Value',
valueType: 'text',
required: true,
disabled: false,
},
],
},
],
},
],
      }],
    ];

  const getSimpleTenantProfile = (recordState) =>
JSON.parse(
JSON.stringify({
templateId: uuid(),
recordState: recordState,
sections: [
{
sectionCode: 'TEST',
isUsed: true,
settings: [
{
order: 1,
settingCode: 'ON-OFF-SWITCH',
valueType: 'boolean',
value: false,
},
],
},
],
      }],
    ];

  const getSimpleTenantProfileUniversal = (recordState) =>
JSON.parse(
JSON.stringify({
templateId: uuid(),
recordState: recordState,
sections: [
{
sectionCode: 'SECTION-MEMBERSHIP',
isUsed: true,
settings: [
{
order: 1,
settingCode: 'FIELD-DISTINCT-SSN',
valueType: 'switchcollection',
value: true,
CtrlCollection: [
{
item: 1,
values: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST-1',
valueType: 'Boolean',
value: 'RB-OPTION-ONE',
label: 'Business Rules',
displayValue: 'Include',
},
{
settingCode: 'TEXT-FIELD-REQUIRED-TEST-1',
valueType: 'text-entry',
value: '99-**-****',
label: 'Value',
displayValue: '99-**-****',
},
],
},
{
item: 2,
values: [
{
settingCode: 'SINGLE-SELECT-RADIO-TEST-2',
valueType: 'Boolean',
value: 'RB-OPTION-TWO',
label: 'Business Rules',
displayValue: 'Exclude',
},
{
settingCode: 'TEXT-FIELD-REQUIRED-TEST-2',
valueType: 'text-entry',
value: '88-**-****',
label: 'Value',
displayValue: '88-**-****',
},
],
},
],
},
],
},
],
      }],
    ];

  const createSimpleTestSetup = (viewMode, productRecordState) => {
const tenantLayout = getSimpleTemplateLayout();
const tenantProfile = getSimpleTenantProfile(productRecordState);

    tenantProfile.templateSpecificationJSON = tenantLayout;
tenantProfile.templateDetails = tenantProfile;
//console.log(tenantProfile);
const props = {
tenant: { id: uuid() },
viewMode: viewMode,

      tenantTemplate: tenantProfile,

      setUploadError: (v) => {
if (v) fail('Upload error should not be triggered');
},

      formOperations: {
setFormError: (v) => {
if (v) fail('Form error should not be triggered');
},
},

      routerpush: jest.fn(),
};

    const context = new TenantProfileContext(props);

    // trigger the componentDidUpdate React method whenever the setState method is called
jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    return [props, context];
};

  const createSimpleTestSetupUniversal = (viewMode, productRecordState) => {
const tenantLayout = getSimpleTemplateLayoutUniversal();
const tenantProfile = getSimpleTenantProfileUniversal(productRecordState);

    tenantProfile.templateSpecificationJSON = tenantLayout;
tenantProfile.templateDetails = tenantProfile;
//console.log(tenantProfile);
const props = {
tenant: { id: uuid() },
viewMode: viewMode,

      tenantTemplate: tenantProfile,

      setUploadError: (v) => {
if (v) fail('Upload error should not be triggered');
},

      formOperations: {
setFormError: (v) => {
if (v) fail('Form error should not be triggered');
},
},

      routerPush: jest.fn(),
};

    const context = new TenantProfileContext(props);

    // trigger the componentDidUpdate React method whenever the setState method is called
jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    return [props, context];
};

  const createSimpleTestSetupUniversalError = (
viewMode,
productRecordState,
) => {
const tenantLayout = getSimpleTemplateLayoutUniversal();
const tenantProfile = getSimpleTenantProfileUniversal(productRecordState);

    tenantProfile.templateSpecificationJSON = tenantLayout;
tenantProfile.templateDetails = tenantProfile;
//console.log(tenantProfile);
const props = {
tenant: { id: uuid() },
viewMode: viewMode,

      tenantTemplate: tenantProfile,

      setUploadError: (v) => {
if (v) done(); // if the upload error flag is true, the test is done
},

      formOperations: {
setFormError: (v) => {
if (v) done();
},
},

      routerPush: jest.fn(),
};

    const context = new TenantProfileContext(props);

    // trigger the componentDidUpdate React method whenever the setState method is called
jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};

    return [props, context];
};

  test('Create mode to Active', (done) => {
const [props, context] = createSimpleTestSetup(ViewMode.Create);

    // updating a data-driven field
context.updateSettingValue('ON-OFF-SWITCH', true);

    //   const validationFunc = (context, settingValue) => {
//     //uploaderInvokeCount++;
//   };

    //  context.addSettingValidationListener(settingName, validationFunc);

    // mock upload of core product ... should occur twice since the state is being set to Active
jest
.spyOn(window, 'fetch')
.mockImplementationOnce((endpoint, config) => {
expect(config.method).toBe('POST');
//console.log(config.body);
// const product = JSON.parse(Base64.decode(config.body));
// expect(product.recordState).toBe('Draft');

        return Promise.resolve({
ok: true,
json: () => {},
        }];
      }]
.mockImplementationOnce((endpoint, config) => {
expect(config.method).toBe('PUT');

        // const product = JSON.parse(Base64.decode(config.body));
// expect(product.recordState).toBe('Active');

        done();

        return Promise.resolve({
ok: true,
json: () => {},
        }];
      }]
.mockImplementation(() =>
fail('Upload of tenent specification should only be called twice.'),
      ];

    context.startUpload('Active');
done();
  }};

  test('Create mode - Remove collection Items', (done) => {
const [props, context] = createSimpleTestSetupUniversal(ViewMode.Create);

    // updating a data-driven field
context.updateSettingValue('FIELD-DISTINCT-SSN', true);
context.updateSettingValue('SINGLE-SELECT-RADIO-TEST', 'RB-OPTION-ONE');
context.updateSettingValue('SINGLE-SELECT-DROPDOWN-TEST', 'TEST DATA');

    context.removeCollectionItem('FIELD-DISTINCT-SSN', 1);
context.removeAllCollectionItems('FIELD-DISTINCT-SSN');
context.checkAndGetControlCollection('SINGLE-SELECT-RADIO-TEST');
context.addCollectionItem('FIELD-DISTINCT-SSN', []);
context.handleWarningPopover(true);

    jest.spyOn(context, 'setState').mockImplementation((func) => {
context.state = func(context.state);
context.componentDidUpdate();
    }};
context.componentDidUpdate();
//context.refreshDOM();
//removeCollectionItem
//removeAllCollectionItems

    //context.startUpload('Active');
done();
  }};

  // test('Create mode - nagitive test', async done => {
//   const [props, context] = createSimpleTestSetupUniversalError(ViewMode.Create);

  //   // updating a data-driven field
//   context.updateSettingValue('FIELD-DISTINCT-SSN', true);
//   context.updateSettingValue('SINGLE-SELECT-RADIO-TEST', 'RB-OPTION-ONE');
//   context.updateSettingValue('SINGLE-SELECT-DROPDOWN-TEST', 'TEST DATA');

  //   context.removeCollectionItem('FIELD-DISTINCT-SSN', 1);
//   context.removeAllCollectionItems('FIELD-DISTINCT-SSN');
//   jest.spyOn(context, 'setState').mockImplementation(func => {
//     context.state = func(context.state);
//     context.componentDidUpdate();
       );
//   context.handleWarningPopover(true);

  //   //context.componentDidUpdate();
//   //context.refreshDOM();
//   //removeCollectionItem
//   //removeAllCollectionItems

  //   //context.startUpload('Active');
//   done();
// });
}};

```
<!-- CODESCAN_FILE_END -->

---

### 374。'C:\DevCode\AstroUI\srclcomponents\LoadTenantIntegrationProfiles\ProfileCollectionDialog.tsx'

<!-- CODESCAN_FILE_START -->
```typescript
import React from 'react';
import {
Dialog,
DialogActions,
DialogTitle,
DialogContent,
} from '@material-ui/core';
import GridItem from 'components/Grid/GridItem';
import Button from 'components/CustomButtons/Button';
import { CoreProductSettingTypes } from 'types';

const ProfileCollectionDialog = (props: any) => {
let isValid = props.isValid;
const context = props.context;
let sectionTitle = '';
context.tenantLayoutTemplate.sections.forEach((section: any) => {
section.settings.forEach((setting: any) => {
if (setting.settingCode == props.currentElement) {
sectionTitle = setting.label;
}
    }};
  }};
const handleSaveClicked = () => {
// props.ctrlCollection.map((setting: any) => {
props.ctrlCollection.map((setting: any) => {
setting.value = context.getSettingValue(setting.settingCode);
if (
(setting.value === undefined || setting.value === '') &&
setting.type === CoreProductSettingTypes.ON_OFF &&
setting.valueType === 'Boolean'
      ] {
setting.value = false;
}
if (
((!setting.value && setting.valueType !== 'Boolean') ||
setting.value === '' ||
setting.value === undefined) &&
setting.required
      ] {
isValid = false;
return;
}
    }};
const popupError = [];
if (isValid) {
context.startValidatingPopup(props.currentElement, 'Active'); // trigger validation process
props.ctrlCollection.forEach((setting: any) => {
const error = context.getErrorState(setting.settingCode);
if (error) {
popupError.push(error);
}
      }];
if (popupError.length > 0) {
isValid = false;
return;
}
}
// });
if (isValid) {
context.addCollectionItem(
props.currentElement, // parent setting code
props.ctrlCollection, // control collection
      ];
props.ctrlCollection.forEach((setting: any) => {
context.updateError(setting, '');
      }];
props.ctrlCollection.map((setting: any) => {
setting.value = '';
context.updateSettingValue(setting.settingCode, '');
      }];
props.handlePopover();
}
context.refreshDOM();
};
return (
<Dialog
role="sliderToggleWarning"
fullWidth={true}
maxWidth={'sm'}
open={props.showPopOver}
onClose={() => {
props.handlePopover();
}}
>
<DialogTitle style={{ borderBottom: '2px solid #ccc' }}>
<div>{sectionTitle}</div>
</DialogTitle>
<DialogContent style={{ padding: '20px' }}>
{props.ctrlCollection.map((setting: any, index: any) => {
return (
<GridItem key={index} xs={12}>
{props.settingFactory.createComponent(
setting,
props.context,
null,
              }}
</GridItem>
          };
        }]}
</DialogContent>

      <DialogActions style={{ borderTop: '2px solid #ccc' }}>
<span style={{ color: '#f44336', display: isValid ? 'none' : 'block' }}>
Please enter all required fields
</span>
<Button
id="toggleWarning-discard-changes"
color="danger"
simple
onClick={() => {
props.handlePopover();
}}
>
Discard Changes
</Button>
<Button
id="toggleWarning-save"
color="success"
onClick={() => handleSaveClicked()}
>
Add
</Button>
</DialogActions>
</Dialog>
  ];
};

export default ProfileCollectionDialog;

```
<!-- CODESCAN_FILE_END -->

---

### 375。'C:\DevCode\AstroUI\srclcomponents\LoadTenantIntegrationProfiles\TenantIntegrationProfile.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantIntegrationProfile.tsx" type=".tsx" size="4836" lines="156" chars="4836" -->
```typescript
import React, { ReactElement } from 'react';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import TenantProfileContext from './TenantProfileContext';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import SweetAlert from 'react-bootstrap-sweetalert';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import { makeStyles } from '@material-ui/core/styles';
import regularFormsStyle from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import customSelectStyle from 'assets/jss/material-dashboard-pro-react/customSelectStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import customCheckboxRadioSwitch from 'assets/jss/material-dashboard-pro-react/customCheckboxRadioSwitch';
import { useTenantIntegrationProfile  from'components/LoadTenantIntegrationProfiles/useTenantIntegrationProfile';
import { useLocation, useNavigate } from 'react-router-dom';

const useSweetAlertStyles = makeStyles(sweetAlertStyle);
const useFormStyles = makeStyles({
...regularFormsStyle,
...customSelectStyle,
select: {
...customSelectStyle.select,
padding: '0px 0 0px',
},
radioRoot: {
...customCheckboxRadioSwitch.radioRoot,
padding: '2px 16px 16px 16px', // order is: top, right, bottom, left
fontWeight: 'bold',
},
}};

const TenantIntegrationProfile = () => {
const {
tenant,
loading,
hideAlert,
discardChanges,
setUploadError,
alert,
setAlert,
viewMode,
errorResponse,
uploadError,
uploadErrorMessage,
errorSections,
setErrorSections,
tenantIntegrationTemplate,
} = useTenantIntegrationProfile();
const push = useNavigate();
const location = useLocation();

  /* TODO -> need to find a better approach to passing down style classes
*  to component factories, without using React hooks. Current strategy requires
*  passing the classes into the constructor of each factory. */
const formClasses = useFormStyles();
const sweetAlertClasses = useSweetAlertStyles();

  [>>
* @todo swap for commonUI modal
   >[
const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}
// pass form action methods to child components
const formOperations = {
setFormError: setErrorSections,
handleDiscardChanges: discardChangesWarning,
};
let errorSectionsMsg: ReactElement;
if (errorSections && errorSections.length > 0) {
errorSectionsMsg = (
<div id="error-sections-message">
Please fix form errors in the following sections:
<ul>
{errorSections.map((sectionName, idx) => (
<li key={idx}>{sectionName}</li>
          }]}
</ul>
</div>
    ];
} else {
errorSectionsMsg = <div />;
}

  [>>
* @todo swap snackbark for commonUI notification
   >[
return (
<div>
{alert}
{uploadError && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={uploadErrorMessage}
close={true}
color="danger"
closeNotification={() => setUploadError(false)}
/>
</GridItem>
</GridContainer>
      ]}
{errorSections && errorSections.length > 0 && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={errorSectionsMsg}
close={true}
color="danger"
closeNotification={() => setErrorSections([])}
/>
</GridItem>
</GridContainer>
      ]}
<GridContainer>
<GridItem xs={12} md={12}>
<TenantProfileContext
tenant={tenant}
viewMode={viewMode}
tenantTemplate={tenantIntegrationTemplate}
formOperations={formOperations}
routerPush={push}
location={location}
setUploadError={setUploadError}
styleClasses={formClasses}
          [>
</GridItem>
</GridContainer>
</div>
  ];
};

export default TenantIntegrationProfile;

```
<!-- CODESCAN_FILE_END -->

---

### 376.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfilesITenantIntegrationProfileInfo.ts

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantIntegrationProfileInfo.ts" type=".ts" size="355" lines="12" chars="355" -->
```typescript
export class TenantIntegrationProfileInfo {
templateId: string | undefined;
recordState: string | undefined;
name: string | undefined;
description: string | undefined;
source: string | undefined;
integrationType: string | undefined;
version: number | undefined;
versionDescription: string | undefined;
lastUpdated: string | undefined;
}

```
<!-- CODESCAN_FILE_END -->

---

### 377.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfilesITenantIntegrationProfilesDataGrid.tsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantIntegrationProfilesDataGrid.tsx" type=".tsx" size="4723" lines="162" chars="4723" -->
```typescript
import React, { useState } from 'react';
import { Table, Icon, ICON_TYPES, useConfirmModal } from 'commonui';
import GridContainer from 'components/Grid/GridContainer';
import Header from 'components/Header/Header';
import { client2 } from 'utils/api-client';
import { Paths } from 'layouts/RouterSwitch';
import { generatePath } from 'react-router-dom';
import {
SCActionButton,
SCActionButtonLink,
SCActions,
} from 'components/TableStyles';

interface ITenantIntegrationProfilesDataGrid {
tenantIntegrationProfilesList: any[];
tenant: any;
}

const TenantIntegrationProfilesDataGrid = ({
tenantIntegrationProfilesList,
tenant,
}: ITenantIntegrationProfilesDataGrid): JSX.Element => {
const [error, setError] = useState('');
const [errorResponse, setErrorResponse] = useState(null);
const setConfirm = useConfirmModal();

  const formatdata = (tenantIntegrationProfiles: any[]) =>
tenantIntegrationProfiles.map(
      [{
profileId,
name,
description,
source,
integrationType,
recordState,
}) => {
const editEligible = true;

        return {
id: profileId,
name,
description,
source,
integrationType,
isActive: recordState === 'Active',

          actions: (
<SCActions id={profileId}>
<SCActionButtonLink
id={`${profileId}_view`}
to={generatePath(Paths.TenantIntegrationProfileManage, {
viewMode: 'view',
templateId: profileId,
tenantId: tenant.id,
                }}}
color="blue"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
{editEligible && (
<SCActionButtonLink
id={`${profileId}_edit`}
to={generatePath(Paths.TenantIntegrationProfileManage, {
viewMode: 'edit',
templateId: profileId,
tenantId: tenant.id,
                  }}}
color="green"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
              }}
<SCActionButton
id={`${profileId}_delete`}
onClick={() => {
discardChangesWarning(`${tenant.id}`, `${profileId}`);
}}
color="red"
>
<Icon size={10} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
</SCActions>
          },
};
},
    ];

  const discardChangesWarning = (tenantId: string, profileId: string): void => {
setConfirm({
title: 'Remove Tenant Integration Profile?',
onContinueBtnClick: () => deActivateProfile(tenantId, profileId),
body: 'Are you sure you want to remove this profile?',
continueBtnText: 'Remove',
cancelBtnText: 'Cancel',
    }};
};

  const deActivateProfile = async (tenantID: string, profileId: string) => {
const uri = '$process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}tenant-integration-profile-deactivate/${profileIdy';
const method = 'DELETE';

    const config = {
headers: {
'Content-Type': 'application/json',
'X-TENANT-ID': `${tenantID}`,
},
};

    client2(uri, method, config, false)
.then(() => {
location.reload();
      }]
.catch((error) => {
if (error.message) {
setError(JSON.parse(error.message).result.errors[0].message);
}
      }];
};

  return (
<div>
{error}
{errorResponse}
<GridContainer role="tenantIntegrationProfilesDataGrid">
<Table
data={formatdata(tenantIntegrationProfilesList)}
filterable={false}
sortable={false}
minRows={0}
columns={[
{
Header: <Header>Name</Header>,
accessor: 'name',
},
{
Header: <Header>Description</Header>,
accessor: 'description',
},
{
Header: <Header>Source</Header>,
accessor: 'source',
},
{
Header: <Header>Integration Type</Header>,
accessor: 'integrationType',
},
{
Header: '',
accessor: 'actions',
sortable: false,
filterable: false,
maxWidth: '180px',
},
]}
        [>
</GridContainer>
</div>
  ];
};

export default TenantIntegrationProfilesDataGrid;

```
<!-- CODESCAN_FILE_END -->

---

### 378。'C:\DevCode\AstroUI\srclcomponents\LoadTenantIntegrationProfiles\TenantIntegrationProfilesList.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantIntegrationProfilesList.tsx" type=".tsx" size="3381" lines="112" chars="3381" -->
```typescript
import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { client2 } from 'utils/api-client';
import { TenantIntegrationProfileInfo } from './TenantIntegrationProfileInfo';
import TenantIntegrationProfilesDataGrid from './TenantIntegrationProfilesDataGrid';
import { useParams } from 'react-router-dom';
import { useTenantIntegrationTemplateModal } from './TenantIntegrationTemplateModal';

const TenantIntegrationProfilesList = () => {
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const {
withinTenantContext,
tenant,
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
} = useAppContext();

  const [tenantIntegrationProfilesList, setTenantIntegrationProfilesList] =
useState<TenantIntegrationProfileInfo[]>([]);
const [tenantProfileTemplates, setTenantProfileTemplates] = useState(null);
const params = useParams();

  useEffect(() => {
if (!createButtonClicked) return;
setCreateButtonClicked(false);
}, [createButtonClicked]);

  useEffect(() => {
setDisplayCreateButton(true);
if (!loading) return;

    const tenantId = (params as any).tenantId;
const titleList = new Map();
withinTenantContext(
tenantId,
() => {
const config = { headers: { 'X-TENANT-ID': tenantId } };
client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}tenant-integration-profiles`,
'GET',
config,
        }
.then((data) => {
setTenantIntegrationProfilesList(data.payload);
setLoading(false);
// get templates
client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}integration-templates`,
'GET',
config,
            }
.then((data) => {
setTenantProfileTemplates(data.payload);
setLoading(false);
              }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
              }];
          }]
.catch((error) => {
console.log(error);
setLoading(false);
setErrorResponse(error);
          }];

        if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
          };
titleList.set(
`Tenant Integration Profiles`,
`/admin/tenant/${tenantId}/tenant-integration-profiles`,
        };
setPageTitle(titleList);
},
(error) => {
console.log('reached here: ', error);
setErrorResponse(error);
setLoading(false);
},
    ];
}, [loading]);

  if (errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  useTenantIntegrationTemplateModal(
createButtonClicked,
tenantProfileTemplates ?? [],
  ];

  if (!tenantIntegrationProfilesList) return <div />;
return (
<div>
<TenantIntegrationProfilesDataGrid
tenantIntegrationProfilesList={tenantIntegrationProfilesList}
tenant={tenant}
      [>
</div>
  ];
};

export default TenantIntegrationProfilesList;

```
<!-- CODESCAN_FILE_END -->

---

### 379.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfilesITenantIntegrationTemplateModal.tsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantIntegrationTemplateModal.tsx" type=".tsx" size="1366" lines="55" chars="1366" -->
```typescript
import React from 'react';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate, generatePath } from 'react-router-dom';
import { useDynamicModal } from 'components/DynamicModal';

const useTenantIntegrationTemplateModal = (
showModal: boolean,
templates: Record<string, string>[] = [],
) => {
const group: any = {
groupCode: 'ImportForm',
groupTitle: '',
hidden: false,
required: true,
dataFields: [
{
fieldCode: 'templateId',
fieldType: 'single-select',
fieldLabel: 'Select Template',
options: [
...templates.map(({ templateId, name, version }) => ({
label: `${name}, (Version ${version})`,
value: templateId,
          }]},
],
},
],
};

  const canContinue = (data: any) => {
return !!data?.templateId;
};
const navigate = useNavigate();
const onContinueBtnClick = (state: any) => {
navigate(
generatePath(Paths.IntegrationTemplatesManage, {
templateId: state?.data?.templateId,
viewMode: 'Create',
      }],
    ];
};
useDynamicModal({
title: 'Create Template',
height: '400px',
showModal,
fieldGroups: [group],
canContinue,
continueBtnText: 'Create Template',
onContinueBtnClick,
fullPageModal: true,
  }};
};

export { useTenantIntegrationTemplateModal };

```
<!-- CODESCAN_FILE_END -->

---

### 380.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantProfileContext.js'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantProfileContext.js" -->type=".js" size="21228" lines="684" chars="21228" -->
```javascript
import ViewMode from 'context/view-mode';
import EventEmitter from 'events';
import React from 'react';
import { client2 } from 'utils/api-client';
import { DataValuesChangeTracker  from'components/CoreProduct/versioning/DataValuesChangeTracker';
import { VersioningChecker } from 'components/CoreProduct/versioning/VersioningChecker';
import ToggleCollectionwarningDialog from'components/LoadTenantIntegrationProfiles/ToggleCollectionwarningDialog';
import { TenantProfileForm } from './TenantProfileForm';
import configureValidators from '../../helpers/validation/validator-configuration';

const defaultProductTemplate = { sections: [] };

export default class TenantProfileContext extends React.Component {
validatorCount = 0;
validatorIncrement = 0;
uploaderIncrement = 0;
uploaderCount = 0;

  constructor(props) {
super(props);

    this.eventEmitter = new EventEmitter();
this.eventEmitter.setMaxListeners(1000);
this.templateSettingsMap = new Map();
this.styleClasses = props.styleClasses;
this.tenant = props.tenant;
this.tenantLayoutTemplate = {
...defaultProductTemplate,
...props.tenantTemplate.templateSpecificationJSON,
}; //tenant layout
this.recordState = props.tenantTemplate.recordState;
this.tenantProfileTemplate = {
...defaultProductTemplate,
...props.tenantTemplate,
}; // tenant profile

    this.sectionReferenceMap = new Map();
this.toggleWarningPopOverShow = false;
this.toggleWarningPopOverCurentSettingCode = '';
this.toggleWarningPopOverTitle = '';

    configureValidators(
this.tenantLayoutTemplate,
this.tenantProfileTemplate,
this,
    ];

    const collectionSettingsMap = new Map();
const settingsMap = new Map();

    this.tenantLayoutTemplate?.sections?.forEach((section) => {
if (!section.settings) return; // must be a pre-built section reference
section.settings.forEach((setting) => {
this.templateSettingsMap.set(setting.settingCode, setting);
this.sectionReferenceMap.set(setting.settingCode, section.sectionTitle);
if (
setting.collectionSettings != null &&
setting.collectionSettings.length > 0
        } {
setting.collectionSettings.forEach((chldSetting) => {
const chldSettingName = chldSetting.settingCode;
settingsMap.set(chldSettingName, chldSetting);

            this.eventEmitter.addListener(
chldSettingName,
(ctxt, updatedValue) =>
this.updateSettingValue(chldSettingName, updatedValue),
            };
          }];
}
      }];
    }};

    // build flattened settings map from arrays and add value change listeners for settings
this.tenantProfileTemplate.sections.forEach((section) => {
section.settings.forEach((setting) => {
const settingName = setting.settingCode;

        settingsMap.set(settingName, setting);

        if (setting.CtrlCollection && setting.CtrlCollection.length > 0) {
setting.CtrlCollection.forEach((collectionSetting) => {
//const colSettingName = collectionSetting.values.settingCode;
if (collectionSetting.values.length > 0) {
collectionSetting.values.forEach((chldSetting) => {
const chldSettingName = chldSetting.settingCode;
settingsMap.set(chldSettingName, chldSetting);

                this.eventEmitter.addListener(
chldSettingName,
(ctxt, updatedValue) =>
this.updateSettingValue(chldSettingName, updatedValue),
                };
              }];
}
          }];
}

        this.eventEmitter.addListener(settingName, (ctxt, updatedValue) =>
this.updateSettingValue(settingName, updatedValue),
        };
      }];
    }};

    this.changeTracker = new DataValuesChangeTracker(this.tenantLayoutTemplate);
this.versioningChecker = new VersioningChecker(
this.tenantProfileTemplate,
this.tenantLayoutTemplate,
    ];
// initialize errors object
const errors = {};
this.tenantProfileTemplate.sections.forEach((section) => {
section.settings.forEach(
(setting) => (errors[setting.settingCode] = null),
      ];
    }};

    this.objectCache = new Map();

    this.versioningSet = new Set();

    this.state = {
settingsMap: settingsMap,
collectionSettingsMap: collectionSettingsMap,
errors: errors,
requestedState: null,
validationTriggered: false,
uploadHooksTriggered: false,
uploadError: false,
reload: false,
incrementVersion: false,
};
}

  render() {
return (
<div>
<TenantProfileForm
{...this.props}
context={this}
tenantProfileRecordState={this.recordState}
        [>
<ToggleCollectionWarningDialog
showPopOver={this.toggleWarningPopOverShow}
currentElement={this.toggleWarningPopOverCurentSettingCode}
context={this}
handlePopover={() => this.handleWarningPopover(false)}
></ToggleCollectionWarningDialog>
</div>
    ];
}

  handleWarningPopover = (isPopOver) => {
this.toggleWarningPopOverShow = isPopOver;
if (
this.props.location &&
this.props.location &&
this.props.location.pathname &&
this.props.routerPush
    ] {
this.props.routerPush(this.props.location.pathname);
}
};

  refreshDOM = () => {
if (this.props.routerPush) {
this.props.routerPush(this.props.location.pathname);
}
};

  componentDidUpdate() {
if (this.state.uploadError) {
// ... if upload failed, reset the upload state and show notification
this.validatorIncrement = 0;
this.uploaderIncrement = 0;

      const errState = this.state.uploadError;

      this.setState((prev) => {
return {
...prev,
uploadHooksTriggered: false,
uploadError: false,
};
      }];

      this.props.setUploadError(errState);

      return;
}

    if (!this.state.validationTriggered) return;

    if (
this.validatorCount > 0 &&
this.validatorIncrement < this.validatorCount
    ]
return;

    this.validatorIncrement = 0;
this.uploaderIncrement = 0;

    this.setState((prev) => {
return {
...prev,
validationTriggered: false,
};
    }};

    const sectionsWithErrors = this.checkForErrors();
if (sectionsWithErrors && sectionsWithErrors.size > 0) {
// form errors exist - show in UI
this.props.formOperations.setFormError(Array.from(sectionsWithErrors));
return;
}

    // ... otherwise, validation passed - try to upload
this.props.formOperations.setFormError(false);
this.uploadTenantProfile(this.state.requestedState);
}

  startUpload = (requestedState) => {
this.setState((prev) => {
return {
...prev,
requestedState: requestedState,
validationTriggered: true,
errors: {}, // reset error state prior to validation
};
    }};

    this.validateAll(requestedState);
};

  startValidatingPopup = (parentSettingCode, requestedState) => {
this.setState((prev) => {
return {
...prev,
requestedState: requestedState,
validationTriggered: true,
errors: {}, // reset error state prior to validation
};
    }};

    this.validatePopupAll(parentSettingCode, requestedState);
};

  uploadTenantProfile = (requestedState) => {
const profile = this.createFinishedTenantProfile();
let url = '${process.enV.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}tenant-integration-profile';
let httpMethod;
let payload;

    if (this.props.viewMode === ViewMode.Create) {
httpMethod = 'POST';
payload = {
templateId: profile.templateDetails.profileId,
recordState: requestedState,
name: profile.templateDetails.name,
description: profile.templateDetails.description,
source: profile.templateDetails.sourceCode,
integrationType: profile.templateDetails.integrationTypeCode,
version: profile.templateDetails.version,
versionDescription: profile.templateDetails.versionDescription,
templateSpecificationJSON: profile.templateSpecificationJSON,
metadataJSON: profile.templateDetails.metadataJSON,
specificationJSON: { sections: profile.sections },
};
} else if (this.props.viewMode === ViewMode.Edit) {
url = `${url}/${profile.profileId}`;
httpMethod = 'PUT';
payload = {
recordState: requestedState,
name: profile.templateDetails.name,
description: profile.templateDetails.description,
source: profile.templateDetails.sourceCode,
integrationType: profile.templateDetails.integrationTypeCode,
version: profile.templateDetails.version,
versionDescription: profile.templateDetails.versionDescription,
templateSpecificationJSON: profile.templateSpecificationJSON,
metadataJSON: profile.templateDetails.metadataJSON,
specificationJSON: { sections: profile.sections },
};
}
const config = {
headers: { 'X-TENANT-ID': this.props.tenant.id },
body: payload,
};

    client2(url, httpMethod, config, true)
.then(() => {
// update state to acknowledge successful upload of data-driven elements
this.setState((prev) => {
return {
...prev,
uploadHooksTriggered: true,
};
        }];
if (this.props.routerPush) {
this.props.routerPush(
`/admin/tenant/${this.props.tenant.id}/tenant-integration-profiles`,
          };
        }
      }]
.catch((e) => {
if (e.message) {
const errorObj = JSON.parse(e.message);
if (
errorObj.result &&
errorObj.result.errors &&
errorObj.result.errors.length === 1
          } {
this.setState((prev) => {
return {
...prev,
uploadError: errorObj.result.errors[0].message,
// 'A Tenant profile with the specified name already exists.',
};
            }];

            return;
}
}

        this.setState((prev) => {
return {
...prev,
uploadError: true,
};
        }];
      }];
};

  checkForErrors = () => {
const errors = this.state.errors;

    const sectionsWithErrors = new Set();

    for (const field in errors) {
if (Object.prototype.hasOwnProperty.call(errors, field)) {
if (
errors[field] &&
errors[field].value &&
errors[field].value.length > 0 &&
errors[field].sectionName
        } {
sectionsWithErrors.add(errors[field].sectionName);
}
}
}

    return sectionsWithErrors;
};

  createFinishedTenantProfile = () => {
// update values in the product config object
this.tenantProfileTemplate.sections.forEach((section) => {
section.settings.forEach((setting) => {
const settingName = setting.settingCode;
const entry = this.state.settingsMap.get(settingName);
setting.value = entry.value;
      }];
    }};

    return this.tenantProfileTemplate;
};

  getSettingValue = (k) => {
const setting = this.state.settingsMap.get(k);
if (!setting) return null;
return setting.value;
};

  getControlCollection = (k) => {
let collection;
this.tenantProfileTemplate.sections.forEach((section) => {
if (section.settings) {
section.settings.forEach((setting) => {
if (setting.settingCode === k && setting.CtrlCollection) {
collection = setting.CtrlCollection;
}
        }];
}
    }};
return collection;
};

  // Find if SettingCode is a Controll under collectionSettings and return parent settingCode
checkAndGetControlCollection = (k) => {
let parentSettingCode;
this.tenantLayoutTemplate.sections.forEach((section) => {
if (section.settings) {
section.settings.forEach((setting) => {
if (setting.collectionSettings) {
setting.collectionSettings.forEach((childSetting) => {
if (childSetting.settingCode === k) {
return (parentSettingCode = setting.settingCode);
}
            }];
}
        }];
}
    }};

    return parentSettingCode;
};

  getSettingRequiredState = (k) => {
const templateSetting = this.templateSettingsMap.get(k);
if (!templateSetting) return null;
return templateSetting.requiredForDraft;
};

  addTemplateSetting = (settingCode, templateSetting) => {
this.templateSettingsMap.set(settingCode, templateSetting);
};

  updateSettingValue = (k, v) => {
const setting = this.state.settingsMap.get(k);
if (!setting) return;

    setting.value = v;

    this.changeTracker.trackUpdate(k, v);

    this.setState((state) => {
return {
...state,
settingsMap: state.settingsMap.set(k, setting),
incrementVersion: this.versioningChecker.updateAndCheckShouldIncrement(
k,
          >,
        },
};
    }};
};

  updateError = (k, v) => {
const section = this.sectionReferenceMap.get(k);
this.setState((state) => ({
...state,
errors: {
...state.errors,
[k]: { sectionName: section ? section : k, value: v },
},
    }}];
};

  getErrorState = (k) => {
if (!this.state.errors[k] || !this.state.errors[k].value) {
return null;
}

    return this.state.errors[k].value;
};

  [>
* validationFunc is a void function that uses the context to update
* the errors object state. It takes (context, updatedValue) as params.
   >[
addSettingValidationListener(settingName, validationFunc) {
this.eventEmitter.addListener(settingName, validationFunc);

    const increment = () => {
this.validatorIncrement++;

      this.setState((prev) => {
return {
...prev,
reload: true,
};
      }];
};
const parentSettingCode = this.checkAndGetControlCollection(settingName);
if (parentSettingCode) {
this.eventEmitter.addListener(
parentSettingCode + '-validate-all',
(context, requestedState) => {
const settingValue = context.getSettingValue(settingName);

          if (settingValue !== null && settingValue !== '') {
// if field is populated, always validate
validationFunc(context, settingValue);
//increment();
return;
}

          if (requestedState === 'Active') {
/* if the requested state is "Active", always validate the setting.
* It is up to the validators to determine whether the
* field is required. */
validationFunc(context, settingValue);
//increment();
return;
}

          const requiredForDraft = context.getSettingRequiredState(settingName);

          if (requiredForDraft) {
validationFunc(context, settingValue);
} else {
// ... not required for draft and not populated - reset the error field
context.updateError(settingName, '');
}

          //increment();
},
      ];
} else {
this.eventEmitter.addListener(
'validate-all',
(context, requestedState) => {
const settingValue = context.getSettingValue(settingName);

          if (settingValue !== null && settingValue !== '') {
// if field is populated, always validate
validationFunc(context, settingValue);
increment();
return;
}

          if (requestedState === 'Active') {
/* if the requested state is "Active", always validate the setting.
* It is up to the validators to determine whether the
* field is required. */
validationFunc(context, settingValue);
increment();
return;
}

          const requiredForDraft = context.getSettingRequiredState(settingName);

          if (requiredForDraft) {
validationFunc(context, settingValue);
          else
// ... not required for draft and not populated - reset the error field
context.updateError(settingName, '');
}

          increment();
},
      ];
// account for the listener in the validator count
this.validatorCount++;
}
}

  notifyChange(settingName, updatedValue) {
if (updatedValue === false && this.getControlCollection(settingName)) {
this.toggleWarningPopOverCurentSettingCode = settingName;

      this.tenantLayoutTemplate.sections.forEach((section) => {
section.settings.forEach((setting) => {
if (setting.settingCode == settingName) {
this.toggleWarningPopOverTitle = setting.label;
}
        }];
      }];
this.toggleWarningPopOverShow = true;
this.eventEmitter.emit(settingName, this, true);
return;
}

    this.updateError(settingName, ''); // reset error state for setting prior to validation
// provides the context to update the form's state
this.eventEmitter.emit(settingName, this, updatedValue);
}

  validateAll(requestedState) {
// provides the context to update the form's state
this.eventEmitter.emit('validate-all', this, requestedState);
}

  validatePopupAll(popUpSettingCode, requestedState) {
// provides the context to update the form's state
this.eventEmitter.emit(
popUpSettingCode + '-validate-all',
this,
requestedState,
    ];
}

  addCollectionItem(parentSettingCode, ctrlCollection) {
const ctrlCollValues = [];
const CtrlCollection = [];
this.tenantProfileTemplate.sections.forEach((section) => {
if (section.settings) {
section.settings.forEach((setting) => {
if (setting.settingCode === parentSettingCode) {
if (
setting.CtrlCollection != null &&
setting.CtrlCollection.length > 0
            } {
const maxItems = setting.CtrlCollection.sort(
(a, b) => b.item - a.item,
              };
const randomNumner = maxItems[0].item + 1;
ctrlCollection.map((item) => {
ctrlCollValues.push({
settingCode: item.settingCode + '-' + randomNumner,
valueType: item.valueType,
value: item.value,
label: item.label,
displayValue: '',
                }};
}); // end values generation
setting.CtrlCollection.push({
item: randomNumner,
values: ctrlCollValues,
              }];
} else {
ctrlCollection.map((item) => {
ctrlCollValues.push({
settingCode: item.settingCode + '-' + 1,
valueType: item.valueType,
value: item.value,
label: item.label,
displayValue: '',
                }};
}); // end values generation
setting.CtrlCollection = CtrlCollection;
setting.CtrlCollection.push({
item: 1,
values: ctrlCollValues,
              }];
}
}
        }];
}
    }};
// update state to render with control and value
ctrlCollValues.forEach((chldSetting) => {
const chldSettingName = chldSetting.settingCode;
this.state.settingsMap.set(chldSettingName, chldSetting);

      this.eventEmitter.addListener(chldSettingName, (ctxt, updatedValue) =>
this.updateSettingValue(chldSettingName, updatedValue),
      ];
    }};

    if (
this.props.location &&
this.props.location &&
this.props.location.pathname &&
this.props.routerPush
    ] {
this.props.routerPush(this.props.location.pathname);
}
}

  removeCollectionItem(parentSettingCode, ctrlCollection, itemIndex) {
this.tenantProfileTemplate.sections.forEach((section) => {
if (section.settings) {
section.settings.forEach((setting) => {
if (setting.settingCode === parentSettingCode) {
if (setting.CtrlCollection != null) {
setting.CtrlCollection = setting.CtrlCollection.filter(
(obj) => obj.item != itemIndex,
              };
}
}
        }];
}
    }};
// update state to render with control and value
this.props.routerPush(this.props.location?.pathname);
}

  removeAllCollectionItems(parentSettingCode) {
this.tenantProfileTemplate.sections.forEach((section) => {
if (section.settings) {
section.settings.forEach((setting) => {
if (setting.settingCode === parentSettingCode) {
if (setting.CtrlCollection != null) {
setting.CtrlCollection = [];
}
}
        }];
}
    }};
this.eventEmitter.emit(parentSettingCode, this, false);
}
}

```
<!-- CODESCAN_FILE_END -->

---

### 381. `C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantProfileForm.js`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\TenantProfileForm.js" type=".js" size="7320" lines="233" chars="7320" -->
```javascript
import { blackColor } from 'assets/jss/material-dashboard-pro-react';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import Button from 'components/CustomButtons/Button';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import React from 'react';
// import PrebuiltSections from 'components/CoreProduct/prebuilt-sections';
import { SettingFactory } from '../SettingsFactory/SettingFactory';

export class TenantProfileForm extends React.Component {
constructor(props) {
super(props);

    this.settingFactory = new SettingFactory(
props.viewMode,
props.styleClasses,
'tenant-profile-setting-',
    ];
//this.prebuiltSections = new PrebuiltSections(props);

    // form display columns must a factor of 12 for material UI
this.allowedDisplayColumnValues = new Set([0, 1, 2, 3, 4, 6, 12]);

    this.tenantLayoutConfig = {
sections: [],
...props.tenantTemplate.templateSpecificationJSON,
}; //tenant layout
this.tenantContext = props.context; //tenantContext

    // build the form
this.layout = this.layoutToArray({
row: [],
...this.tenantLayoutConfig?.form?.layout,
    }};
this.sectionMap = new Map();
this.tenantLayoutConfig.sections.forEach((section) => {
this.sectionMap.set(section.sectionCode, section);
    }};
}

  layoutToArray(layout) {
const rows = [];
for (const rowName in layout.row) {
if (Object.prototype.hasOwnProperty.call(layout.row, rowName)) {
const row = layout.row[rowName];
const columns = [];

        for (const colName in row.col) {
if (Object.prototype.hasOwnProperty.call(row.col, colName)) {
const col = row.col[colName];
columns.push(col);
}
}

        if (!this.allowedDisplayColumnValues.has(columns.length)) {
throw new Error(
'Column count in each row must be a factor of 12 (0,1,2,3,4,6,12). Specified row =>
JSON.stringify(columns),
          };
}

        rows.push(columns);
}
}

    return rows;
}

  // handleSaveDraftClicked = () => {
//   this.tenantContext.startUpload('Draft'); // trigger validation process
// };

  handleSaveClicked = () => {
this.tenantContext.startUpload('Active'); // trigger validation process
};

  render() {
return (
<div>
{this.createComponents(this.tenantContext)}

        {this.props.viewMode !== ViewMode.View && (
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12} sm={12} md={12}>
<Button
id="tenant-profile-discard-changes"
color="danger"
simple
onClick={() => {
this.props.formOperations.handleDiscardChanges();
}}
>
Discard Changes
</Button>

              {/* {this.props.tenantProfileRecordState !== 'Active' && (
<Button
id="tenant-profile-save-draft"
style={{
// display: viewMode !== ViewMode.View && newTenant.recordstate !=='Active' ? 'inline' : 'none',
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={this.handleSaveDraftClicked}
>
Save Draft
</Button>
              }} >[}
<Button
id="tenant-profile-save"
color="success"
onClick={this.handleSaveClicked}
>
Save
</Button>
</GridItem>
</GridContainer>
        }}
</div>
    ];
}

  createComponents(tenantContext) {
const rows = [];

    this.layout.forEach((columns, rowIndex) => {
const gridWidthForRow = 12 / columns.length;
const cols = [];

      columns.forEach((sections, columnIndex) => {
if (sections.length == 0) {
// push empty cell
cols.push(
<GridItem key={columnIndex} xs={12} md={gridWidthForRow} />,
          };
return;
}

        // create each section within a cell
const gridItems = sections.map((sectionName, sectionIndex) => {
const section = this.sectionMap.get(sectionName);

          if (!section.settings && !section.componentReference) {
throw new Error(
'Section must specify settings are reference a prebuild component => ' +
JSON.stringify(section),
            };
}

          // does the section specify a pre-built component?
// if (section.componentReference) {
//   return (
//     <div key={sectionIndex}>
//       {this.prebuiltSections.getComponentBySectionName(
//         section.componentReference,
          [[ }}
//     </div>
//   );
          [[ }

          // create each setting within each section
const settingsForSection = (section?.settings || []).map(
(setting, idx) => {
return {
inHeader: setting.inHeader,
component: (
<GridItem key={idx} xs={12}>
{this.settingFactory.createComponent(
setting,
tenantContext,
null,
                    ]}
</GridItem>
                },
};
},
          };

          return (
<Card key={sectionIndex}>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={5}>
<CardText color="cuna1">
<h4>{section.sectionTitle}</h4>
</CardText>
</GridItem>
<GridItem xs={12} sm={7}>
{settingsForSection
.filter((sec) => sec.inHeader)
.map((sec, idx) => (
<div key={idx} style={{ color: blackColor }}>
{sec.component}
</div>
                      ]}}
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<GridItem xs={12}>
{settingsForSection
.filter((sec) => !sec.inHeader)
.map((sec) => sec.component)}
</GridItem>
</CardBody>
</Card>
          };
        }];

        cols.push(
<GridItem key={columnIndex} xs={gridWidthForRow}>
{gridItems}
</GridItem>,
});
      }];

      if (cols.length > 0) {
rows.push(<GridContainer key={rowIndex}>{cols}</GridContainer>);
}
    }};

    return <GridContainer>{rows}</GridContainer>;
}
}

```
<!-- CODESCAN_FILE_END -->

---

### 382.'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\ToggleCollectionWarningDialog.tsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\ToggleCollectionwarningDia" -->log.tsx" type=".tsx" size="1985" lines="76" chars="1985" -->
```typescript
import React from 'react';
import {
Dialog,
DialogActions,
DialogTitle,
DialogContent,
} from '@material-ui/core';
import Button from 'components/CustomButtons/Button';

const ToggleCollectionWarningDialog = (props: any) => {
const [anchorEl, setAnchorEl] = React.useState<
(EventTarget & HTMLButtonElement) | null
>(null);

  //let isValid = true;
const context = props.context;
let sectionTitle = '';

  context.tenantLayoutTemplate.sections.forEach((section: any) => {
(section?.settings || []).forEach((setting: any) => {
if (setting.settingCode == props.currentElement) {
sectionTitle = setting.label;
}
    }};
  }};
const handleRemoveClicked = () => {
context.removeAllCollectionItems(
props.currentElement, // parent setting code
    ];
props.handlePopover();
};
return (
<Dialog
fullWidth={true}
maxWidth={'sm'}
open={props.showPopOver}
onClose={() => {
setAnchorEl(null);
props.handlePopover();
}}
>
<DialogTitle style={{ borderBottom: '2px solid #ccc' }}>
<div>{sectionTitle}</div>
</DialogTitle>
<DialogContent
style={{ padding: '20px', color: '#f44336', textAlign: 'center' }}
>
<div>Are you sure you want to remove this definition?</div>
<div>Any associated business rules will be deleted</div>
</DialogContent>

      <DialogActions style={{ borderTop: '2px solid #ccc' }}>
<Button
id={props.currentElement + '-discard-changes'}
color="danger"
simple
onClick={() => {
props.handlePopover();
}}
>
Discard Changes
</Button>
<Button
id={props.currentElement + '-save'}
color="danger"
onClick={() => handleRemoveClicked()}
>
Remove
</Button>
</DialogActions>
</Dialog>
  ];
};

export default ToggleCollectionWarningDialog;

```
<!-- CODESCAN_FILE_END -->

---

### 383。'C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\useTenantIntegrationProfile.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoadTenantIntegrationProfiles\useTenantIntegrationProfil" -->e.ts" type=".ts" size="5010" lines="177" chars="5010" -->
```typescript
import { useEffect, useState, ReactElement } from 'react';
import { generatePath, useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from 'context/app-context';
import { client2 } from 'utils/api-client';
import { Paths } from 'layouts/RouterSwitch';

const defaultErrorMessage =
'Server returned error while processing data. Please try again later.';

const useTenantIntegrationProfile = () => {
const push = useNavigate();
const { tenant, setDisplayCreateButton } = useAppContext();
const [loading, setLoading] = useState(true);
const [alert, setAlert] = useState<ReactElement | null>(null);
const [errorResponse, setErrorResponse] = useState<any>(null);
const [uploadError, setUploadErr] = useState(false);
const [uploadErrorMessage, setUploadErrorMessage] = useState(
'Server returned error while processing data. Please try again later.',
  ];

  const [errorSections, setErrorSections] = useState<string[]>([]);

  const [tenantIntegrationTemplate, setTenantIntegrationTemplate] =
useState(null);

  const { tenantId, templateId, viewMode } = useParams();

  useEffect(() => {
setDisplayCreateButton(false);
}, []);

  useEffect(() => {
if (!loading) return;

    const config = { headers: { 'X-TENANT-ID': tenantId } };

    if (
viewMode?.toLowerCase() === 'view' ||
viewMode?.toLowerCase() === 'edit'
    ] {
client2(
`${process.env.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}/tenant-integration-profile/${templateId}`,
'GET',
config,
      ]
.then((data) => {
const template = {
templateDetails: (({
name,
description,
sourceCode,
templateId,
integrationTypeCode,
version,
versionDescription,
metadataJSON,
}) => ({
name,
description,
sourceCode,
templateId,
integrationTypeCode,
version,
versionDescription,
metadataJSON,
}))(data.payload),
...JSON.parse(data.payload.specificationJSON), // contains profile

            templateSpecificationJSON: JSoON.parse(
data.payload.templateSpecificationJSON, //layout
            },
id: templateId,
profileId: data.payload.profileId,
recordState: data.payload.recordState,
};
setTenantIntegrationTemplate(template);
setLoading(false);
        }]
.catch((error) => {
console.error(error);
setErrorResponse(error);
setLoading(false);
        }];
} else if (viewMode?.toLowerCase() === 'create') {
console.log('create');
client2(
'${process.enV.REACT_APP_INTEGRATION_MGMT_API_BASE_URL}/integration-templates/${templateId}',
'GET',
config,
      ]
.then((data) => {
console.log({ data });
const template = {
templateDetails: (({
name,
description,
sourceCode,
templateId,
integrationTypeCode,
version,
versionDescription,
metadataJSON,
}) => ({
name,
description,
sourceCode,
templateId,
integrationTypeCode,
version,
versionDescription,
metadataJSON,
}))(data.payload),
...JSON.parse(data.payload.specificationJSON), // contains profile
templateSpecificationJSON: JSON.parse(
data.payload.templateSpecificationJSON, //layout
            },
id: templateId,
recordState: data.payload.recordState,
};
setTenantIntegrationTemplate(template);
setLoading(false);
        }]
.catch((error) => {
console.error(error);
setErrorResponse(error);
setLoading(false);
        }];
}
}, [loading]);

  const setUploadError = (errState: any) => {
if (!errState || errState === '') {
setUploadErrorMessage(defaultErrorMessage);
setUploadErr(false);
return;
}
setUploadErrorMessage(
typeof errState === 'string' ? errState : defaultErrorMessage,
    ];
setUploadErr(true);
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
tenant
? push(
generatePath(Paths.TenantIntegrationProfiles, {
tenantId: tenant.id,
          }],
        }
: push(Paths.Tenant);
};

  return {
loading,
hideAlert,
discardChanges,
setUploadError,
alert,
setAlert,
viewMode,
errorResponse,
uploadError,
uploadErrorMessage,
errorSections,
setErrorSections,
tenantIntegrationTemplate,
tenant,
};
};

export { useTenantIntegrationProfile };

```
<!-- CODESCAN_FILE_END -->

---

### 384. `C:\DevCode\AstroUI\src\components\LoanAppForm\__test__\CustomizeLoanForm.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\__test__ICustomizeLoanForm.test.tsx" type=".tsx" size="1634" lines="57" chars="1634" -->
```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CustomizeLoanForm } from '../CustomizeLoanForm';
import { IOptionalElement } from '../types';

describe('CustomizeLoanForm', () => {
it('should render sections and segments', () => {
const sections: IOptionalElement[] = [
{ id: 'FIELD-EXAMPLE-SECTION', name: 'Example Section', on: false },
];
const segments: IOptionalElement[] = [
{
id: 'FIELD-EXAMPLE-SEGMENT',
name: 'Example Section - Example Segment',
on: true,
},
];

    render(
<CustomizeLoanForm
segments={segments}
setSegments={() => segments}
sections={sections}
setSections={() => sections}
      [>,
    ];

    expect(screen.getByText('Show Optional Sections:')).toBeInTheDocument();
expect(screen.getByText('Show Optional Segments:')).toBeInTheDocument();

    expect(screen.getByText('Example Section')).toBeInTheDocument();
expect(
screen.getByText('Example Section - Example Segment'),
).toBeInTheDocument();
  }};

  it('should not render without sections and segments', () => {
const segments: IOptionalElement[] = [];
const sections: IOptionalElement[] = [];

    render(
<CustomizeLoanForm
segments={segments}
setSegments={() => segments}
sections={sections}
setSections={() => sections}
      [>,
    ];
expect(
screen.queryByText('Show Optional Sections:'),
).not.toBeInTheDocument();
expect(
screen.queryByText('Show Optional Segments:'),
).not.toBeInTheDocument();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 385. `C:\DevCode\AstroUI\src\components\LoanAppForm\__test__\CustomizeLoanFormList.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\__test__\CustomizeLoanFormList.test.tsx" type=".tsx" size="2545" lines="85" chars="2545" -->
```typescript
import React from 'react';
import userEvent from '@testing-library/user-event';
import {
fireEvent,
queryAllByAttribute,
render,
screen,
} from '@testing-library/react';
import { IOptionalElement } from '../types';
import { CustomizeLoanFormList } from '../CustomizeLoanFormList';

describe('CustomizeLoanFormList', () => {
it('should render items', () => {
const items: IOptionalElement[] = [
{ id: 'FIELD-EXAMPLE-SECTION', name: 'Example Section', on: false },
{ id: 'FIELD-EXAMPLE-SECTION-2', name: 'Example Section 2', on: false },
];

    render(
<CustomizeLoanFormList
keyId={'header-text'}
headerText={'Header Text'}
items={items}
setItems={(x) => x}
      [>,
    ];

    expect(screen.getByText('Header Text')).toBeInTheDocument();
expect(screen.getByText('Example Section')).toBeInTheDocument();
expect(screen.getByText('Example Section 2')).toBeInTheDocument();
  }};

  it('should render no items when empty', () => {
const items: IOptionalElement[] = [];

    render(
<CustomizeLoanFormList
keyId={'header-text'}
headerText={'Header Text'}
items={items}
setItems={(x) => x}
      [>,
    ];

    expect(screen.queryByText('Header Text')).not.toBeInTheDocument();
  }};

  it('onChange should toggle state', () => {
const items: IOptionalElement[] = [
{ id: 'FIELD-EXAMPLE-SECTION', name: 'Example Section', on: false },
{ id: 'FIELD-EXAMPLE-SECTION-2', name: 'Example Section 2', on: false },
{ id: 'FIELD-EXAMPLE-SECTION-3', name: 'Example Section 3', on: false },
];
const mockSetItems = jest.fn((f) => f(items));

    const { container } = render(
<CustomizeLoanFormList
keyId={'header-text'}
headerText={'Header Text'}
items={items}
setItems={mockSetItems}
      [>,
    ];
const switches = queryAllByAttribute('type', container, 'checkbox');
fireEvent.click(switches[0]);
fireEvent.click(switches[1]);
fireEvent.click(switches[2]);
expect(mockSetItems).toHaveNthReturnedWith(1, [
{ ...items[0], on: true },
{ ...items[1], on: false },
{ ...items[2], on: false },
    ]};
expect(mockSetItems).toHaveNthReturnedWith(2, [
{ ...items[0], on: false },
{ ...items[1], on: true },
{ ...items[2], on: false },
    ]};
expect(mockSetItems).toHaveNthReturnedWith(3, [
{ ...items[0], on: false },
{ ...items[1], on: false },
{ ...items[2], on: true },
    ]};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 386. `C:\DevCode\AstroUI\src\components\LoanAppForm\__test__\LoanAppForm.test.jsx`

+ <!-- CODESCAN_FILE_START
```javascript
import React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import LoanAppForm from '../LoanAppForm';
import { v4 as uuid } from 'uuid';
import * as ReactRouter from 'react-router-dom';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: jest.fn(),
useNavigate: () => mockPush,
}}];

describe('LoanAppForm', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const templateId = uuid();
const tenantId = uuid();
const loanId = uuid();
const coreProductTemplateId = uuid();
const mockTenant = {
id: tenantId,
};
const mockLoanPromise = Promise.resolve({
payload: {
loanFormId: loanId,
recordState: 'Active',
name: 'New Auto Loan',
description: 'New Auto Loan form',
version: 1,
versionDescription: 'Base version of New Auto Loan form.',
loanFormTemplateId: '894C343A-CDD4-4246-AF3A-6C56C86F1DAA',
coreProductId: '030e1d66-fc26-455c-99ba-ba754108ecdd',
metadataJSON: '{}',
businessRulesJSON: '{}',
specificationJSON:
'{"sections":[{"sectionCode": "SECTION-REDEMPTION-INFO", "segments":[{"segmentCode": "SEGMENT-CONTACT-INFORMATION", "hidden": true}J}J}',
lastUpdated: '2019-11-15T13:11:01.689Z',
},
  }};

  const mockTemplatesPromise = Promise.resolve({
payload: {
templateId: templateId,
recordState: 'Active',
coreProductTemplateId: coreProductTemplateId,
name: 'New Auto Loan Form',
description: 'Template for applications for New Auto loans',
version: 1,
versionDescription: 'Initial Version',
specificationJSON:
'{"sections":[{"sectionCode": "SECTION-REDEMPTION-INFO", "segments":[{"segmentCode": "SEGMENT-CONTACT-INFORMATION", "hidden": false}J}J}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
  }};

  afterEach(() => {
fetchSpy.mockClear();
  }};

  test('Test loan app view', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ tenantId, viewMode: 'view' });

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockLoanPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');
  }};

  test('Test loan app edit', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ tenantId, viewMode: 'edit' });
fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockLoanPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');
  }};

  test('Test loan app create', async () => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
templateId,
coreProductId: coreProductTemplateId,
viewMode: 'create',
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');

    const saveActiveButton = screen.getByRole('button', { name: 'Save' });
fetchSpy.mockClear();
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockLoanPromise,
    }};
fireEvent.click(saveActiveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  test('Test loan app draft', async () => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
templateId,
coreProductId: coreProductTemplateId,
viewMode: 'create',
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');

    const saveActiveButton = screen.getByRole('button', { name: 'Save Draft' });
fetchSpy.mockClear();
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockLoanPromise,
    }};
fireEvent.click(saveActiveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
await waitFor(() => expect(mockPush).toHaveBeenCalled());
  }};

  test('Test loan app discard', async () => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
templateId,
coreProductId: coreProductTemplateId,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');

    const saveActiveButton = screen.getByRole('button', {
name: 'Discard Changes',
    }};

    fireEvent.click(saveActiveButton);
  }};

test('Loan Name, Description, and Version Description inputs change as expected', async () =>
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
templateId,
coreProductId: coreProductTemplateId,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    const container = renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');
const name = container.getByTestId('loan_form_name_input');
const description = container.getByTestId('loan_form_description_input');
const versionDescription = container.getByTestId(
'loan_form_version_description_input',
    ];

    [>>
* NOTE: Must use CustomInput.firstChild to access input element
* with data-testid attribute
     >[
fireEvent.change(name.firstChild, { target: { value: 'New Name' } });
fireEvent.change(description.firstChild, {
target: { value: 'New Loan Form' },
    }};
fireEvent.change(versionDescription.firstChild, {
target: { value: 'New Version' },
    }};

    expect(name.firstChild.value).toEqual('New Name');
expect(description.firstChild.value).toEqual('New Loan Form');
expect(versionDescription.firstChild.value).toEqual('New Version');
  }};

  test('Test loan form upgrade', async () => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
templateId,
coreProductId: coreProductTemplateId,
formId: loanId,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockLoanPromise,
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
    }};

    renderWithMockTenant(mockTenant, <LoanAppForm />);

    await screen.findByText('Loan Application Form');
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 387. `C:\DevCode\AstroUI\src\components\LoanAppForm\__test__\utils.test.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\__test__lutils.test.ts" type=".ts" size="1134" lines="42" chars="1134" -->
```typescript
import { replaceTokens } from '../utils';

describe('LoanAppForm utils', () => {
describe('replaceTokens', () => {
test('Should replace tokens', () => {
expect(
replaceTokens(
[{ token: 'Token 1', replacement: 'Replaced' }],
'Outer [Token 1] String',
        },
).toEqual('Outer Replaced String');

      expect(
replaceTokens(
[
{ token: 'Token 1', replacement: 'Replaced 1' },
{ token: 'Token 2', replacement: 'Replaced 2' },
{ token: 'Token 3', replacement: 'Replaced 3' },
],
'Outer [Token 3] String',
        },
).toEqual('Outer Replaced 3 String');
    }};

    test('Should not affect strings with no replaceable tokens', () => {
expect(
replaceTokens(
[{ token: 'Token 1', replacement: 'Replaced' }],
'Outer [Token 2] String',
        },
).toEqual('Outer [Token 2] String');

      expect(
replaceTokens(
[{ token: 'Token 1', replacement: 'Replaced' }],
'Outer String',
        },
).toEqual('Outer String');
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 388. `C:\DevCode\AstroUI\src\components\LoanAppForm\CustomizeLoanForm.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\CustomizeLoanForm.tsx" type=".tsx" size="1176" lines="44" chars="1176" -->
```typescript
import React from 'react';

import GridContainer from 'components/Grid/GridContainer';
import { CardSection } from 'components/Card/CardSection';
import { CustomizeLoanFormList } from './CustomizeLoanFormList';

import { ICustomizeLoanForm } from './types';

export const CustomizeLoanForm = ({
sections,
segments,
setSections,
setSegments,
disabled = false,
}: ICustomizeLoanForm): JSX.Element | null => {
if (sections.length === 0 && segments.length === 0) return null;
return (
    >>
<CardSection title="Customize Loan Form">
<GridContainer
style={{
padding: '0 24px 0',
}}
>
<CustomizeLoanFormList
keyId={'optional-sections'}
headerText={'Show Optional Sections:'}
items={sections}
setItems={setSections}
disabled={disabled}
          [>
<CustomizeLoanFormList
keyId={'optional-segments'}
headerText={'Show Optional Segments:'}
items={segments}
setItems={setSegments}
disabled={disabled}
          [>
</GridContainer>
</CardSection>
</>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 389. `C:\DevCode\AstroUI\src\components\LoanAppForm\CustomizeLoanFormList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\CustomizeLoanFormList.tsx" type=".tsx" size="1898" lines="64" chars="1898" -->
```typescript
import React from 'react';

import Switch from '@material-ui/core/Switch';
import GridItem from 'components/Grid/GridItem';
import Header from 'components/Header/Header';

import { makeStyles } from '@material-ui/core';
import { default as styles } from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';

import { ICustomizeLoanFormList } from './types';
import GridContainer from 'components/Grid/GridContainer';

export const CustomizeLoanFormList = ({
keyId,
headerText,
items,
setItems,
disabled = false,
}: ICustomizeLoanFormList): JSX.Element | null => {
if (items.length === 0) return null;
const useStyles = makeStyles(styles);
const classes = useStyles();
return (
<GridContainer alignItems={'center'} key={`${keyId}-container`}>
<GridItem key={`${keyId}-header-item`} xs={12}>
<Header key={`${keyId}-header`}>{headerText}</Header>
</GridItem>
{items.map(({ id, name, on }) => [
<GridItem
style={{ borderRight: '1px solid #ccc' }}
key={`name-${id}`}
md={5}
xs={10}
>
{name}
</GridItem>,
<GridItem key={`toggle-${id}`} md={1} xs={2}>
<Switch
role="switch"
key={`toggle-switch-${id}`}
id={`${id}-switch`}
disabled={disabled}
checked={on || false}
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
onChange={() => {
setItems((items) =>
items.map((item) =>
item.id === id ? { ...item, on: !item.on } : item,
                },
              };
}}
value={on}
          [>
</GridItem>,
      ]]}
</GridContainer>
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 390. `C:\DevCode\AstroUI\src\components\LoanAppForm\LoanAppForm.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\LoanAppForm.jsx" type=".jsx" size="17450" lines="542" chars="17450" -->
```javascript
import React, { useEffect, useState } from 'react';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { useAppContext } from 'context/app-context';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import SweetAlert from 'react-bootstrap-sweetalert';

import { makeStyles } from '@material-ui/core/styles';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';

import ViewMode from 'context/view-mode';
import {
generatePath,
useParams,
useNavigate,
useLocation,
} from 'react-router-dom';
import { client2 } from 'utils/api-client';
import { Paths } from 'layouts/RouterSwitch/paths';

import { CardSection } from 'components/Card/CardSection';
import Button from 'components/CustomButtons/Button';
import CustomInput from 'components/CustomInput/CustomInput';
import { LoanFormSpecification } from './LoanFormSpecification';
import { CustomizeLoanForm } from './CustomizeLoanForm';
import { useCustomizeLoanForm } from './useCustomizeLoanForm';

import {
updateOptionalSectionsAndSegments,
updateForm,
createForm,
} from './utils';
import { RecordState } from './types';

const useSweetAlertStyles = makeStyles(sweetAlertStyle);

export default function LoanAppForm() {
const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();

  const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [alert, setAlert] = useState(null);
const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState(null);
const [templateId, setTemplateId] = useState(null);
const [coreProductId, setCoreProductId] = useState(null);
const [, setShowFormError] = useState(false);

  const [loanFormName, setLoanFormName] = useState('');
const [loanFormDescription, setLoanFormDescription] = useState('');

  const [loanFormVersionDescription, setLoanFormVersionDescription] =
useState('');
const [loanForm, setLoanForm] = useState(null);
const [loanTemplateFormData, setLoanTemplateFormData] = useState(null);
const push = useNavigate();
const params = useParams();
const { formId } = params;

  const titleList = new Map();
useEffect(() => {
setDisplayCreateButton(false);
if (!loading) return;

    if (!params.coreProductId) {
// ... must be edit/view mode

      const tenantId = params.tenantId;
const formId = params.loanFormId;

      const config = {
headers: { 'X-TENANT-ID': tenantId },
};

      if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenant.id}/view`,
        };
titleList.set(
`Loan Application Forms > `,
`/admin/tenant/${tenantId}/loan-app-forms`,
      ];

      client2(
`${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-forms/${formId}`,
'GET',
config,
      ]
.then((data) => {
setLoanFormName(data.payload.name);
setLoanFormDescription(data.payload.description);
setLoanFormVersionDescription(data.payload.versionDescription);
setLoanForm(data.payload);
if (viewMode === 'edit' || viewMode === 'view') {
titleList.set(
data.payload.name,
`/admin/tenant/${tenantId}/loan-app-form/${params.loanFormId}/${viewMode}`,
            };
}
setPageTitle(titleList);
        }]
.catch((error) => {
setErrorResponse(error);
        }]
.finally(() => setLoading(false));
} else {
setTemplateId(params.templateId);
setCoreProductId(params.coreProductId);

      const config = {
headers: { 'X-TENANT-ID': params.tenantId },
};

      try {
(async () => {
const formTemplateData = await client2(
'${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}/tenant-loan-form-templates/${params.templateIdy',
'GET',
config,
          };
if (params.viewMode === 'upgrade') {
const oldFormData = await client2(
`${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}/loan-forms/${formId}`,
'GET',
config,
            };
const oldFormTemplateData = await client2(
'${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}/tenant-loan-form-templates/${oldFormData.payload.loanFormTemplateId}',
'GET',
config,
            };
const newTemplate = formTemplateData.payload;
syncFormSettingsFromOriginalForm(
newTemplate,
oldFormTemplateData.payload,
oldFormData.payload,
            };
setLoanTemplateFormData(newTemplate);
} else {
setLoanTemplateFormData(formTemplateData.payload);
}
        }][];
} catch (error) {
setErrorResponse(error);
} finally {
setLoading(false);
}
}

    function syncFormSettingsFromOriginalForm(
newTemplate,
oldFormTemplate,
oldForm,
    ] {
const newTemplateSpec = JSON.parse(newTemplate.specificationJSON);
const oldTemplateSpec = JSON.parse(oldFormTemplate.specificationJSON);
const oldFormSpec = JSON.parse(oldForm.specificationJSON);
let restoredSettings = false;
for (const oldFormSection of oldFormSpec.sections) {
const oldTemplateSection = oldTemplateSpec.sections?.find(
(s) => s.sectionCode === oldFormSection.sectionCode,
        };
if (oldTemplateSection) {
for (const oldFormSegment of oldFormSection.segments) {
const oldTemplateSegment = oldTemplateSection.segments?.find(
(s) => s.segmentCode === oldFormSegment.segmentCode,
            };
if (
oldTemplateSegment &&
oldTemplateSegment.hidden !== oldFormSegment.hidden
            } {
const newTemplateSection = newTemplateSpec.sections?.find(
(s) => s.sectionCode === oldFormSection.sectionCode,
              };
if (newTemplateSection) {
const newTemplateSegment = newTemplateSection.segments?.find(
(s) => s.segmentCode === oldFormSegment.segmentCode,
                };
if (newTemplateSegment) {
// console.log('Restored 'hidden' setting during Form upgrade: ${oldFormSection.sectionCode} ${oldFormSegment.segmentCode} set to $oldFormSegment.hidden}');
newTemplateSegment.hidden = oldFormSegment.hidden;
restoredSettings = true;
}
}
}
}
}
}
if (restoredSettings) {
newTemplate.specificationJSON = JSON.stringify(newTemplateSpec);
}
}

    const tenantId = params.tenantId;
const viewMode = params.viewMode;

    if (viewMode === 'create' || viewMode === 'upgrade') {
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenant.id}/view`,
        };
titleList.set(
`Loan Application Forms > `,
`/admin/tenant/${tenantId}/loan-app-forms`,
      ];
titleList.set(
`New Loan Application Form`,
'/admin/tenant/${tenantId}/loan-app-forms/${params.templateId}/${params.coreProductId}/${viewMode}',
      ];
setPageTitle(titleList);
setViewMode(ViewMode.Create);
setLoading(false);
return;
} else {
setViewMode(viewMode);
return;
}
}, [loading]);

  const { sections, segments, setSections, setSegments } = useCustomizeLoanForm(
loanForm?.specificationJSON ?? '{}',
  ];

  const sweetAlertClasses = useSweetAlertStyles();

  const submitForm = async (recordState) => {
const tenantId = tenant?.id;
const formId = loanForm?.formId;
const specificationJSON = loanTemplateFormData?.specificationJSON;
let hasUpdateError = false;
let firstCall;
setError('');
try {
if (viewMode === ViewMode.Edit) {
firstCall = await updateOptionalSectionsAndSegments({
formId,
tenantId,
sections,
segments,
        }];
}
if (
viewMode !== ViewMode.View &&
loanForm?.recordState !== RecordState.Active
      ] {
if (loanForm) {
if (firstCall && firstCall.payload && firstCall.payload.lastUpdated)
loanForm.lastUpdated = firstCall.payload.lastUpdated;
await updateForm({
loanForm,
formId,
recordState,
loanFormName,
loanFormDescription,
loanFormVersionDescription,
tenantId,
          }];
} else {
await createForm({
recordState,
loanFormName,
loanFormDescription,
loanFormVersionDescription,
templateId,
coreProductId,
specificationJSON,
tenantId,
          }];
}
}
push(generatePath(Paths.LoanAppForms, { tenantId }));
} catch (e) {
hasUpdateError = true;
setError(JSON.parse(e.message)?.result.errors[0].message);
}
if (!hasUpdateError) setLoanFormName(null);
};

  const handleSaveDraftClicked = () => {
submitForm(RecordState.Draft);
};

  const handleSaveClicked = () => {
submitForm(RecordState.Active);
};

  const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
push(
generatePath(Paths.LoanAppForms, {
tenantId: params.tenantId,
      }],
    ];
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  // pass form action methods to child components
const formOperations = {
setFormError: setShowFormError,
handleDiscardChanges: discardChangesWarning,
};

  // if (viewMode === ViewMode.Edit || viewMode === ViewMode.View) {
//   setPageTitle(titleList);
// }

  return (
<div>
{alert}
<GridContainer>
<GridItem xs={12} md={12} lg={12}>
<CardSection title="Loan Application Form">
<GridContainer>
              Terror &&(
<GridItem xs={12} style={{ textAlign: 'center' }}>
<div
id="error_code"
style={{
display: 'inline-block',
paddingTop: '15px',
color: 'red',
}}
>
{error}
</div>
</GridItem>
              }}
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Loan Form Name
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_name"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={{
'data-testid': 'loan_form_name_input',
disabled:
viewMode === ViewMode.View ||
(loanForm && loanForm.recordState == 'Active'),
disableUnderline: false,
value: loanFormName,
type: 'text',
onChange: (event) => {
const value = event.target.value;
if (value.length <= 50) {
setLoanFormName(value);
}
},
}}
/>
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={{
'data-testid': 'loan_form_description_input',
disabled:
viewMode === ViewMode.View ||
(loanForm && loanForm.recordState == 'Active'),
disableUnderline: false,
value: loanFormDescription,
placeholder: 'Loan Form',
type: 'text',
                    oncChange: (event) => {
const value = event.target.value;
if (value.length <= 50) setLoanFormDescription(value);
},
}}
/>
</GridItem>

              <GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Version Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_version_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={{
'data-testid': 'loan_form_version_description_input',
disabled:
viewMode === ViewMode.View ||
(loanForm && loanForm.recordState == 'Active'),
disableUnderline: false,
value: loanFormVersionDescription,
placeholder: 'Initial version',
type: 'text',
onChange: (event) => {
const value = event.target.value;
if (value.length <= 50)
setLoanFormVersionDescription(value);
},
}}
/>
</GridItem>
</GridContainer>
</CardSection>
{loanForm && (
<CustomizeLoanForm
sections={sections}
segments={segments}
setSections={setSections}
setSegments={setSegments}
disabled={viewMode === ViewMode.View}
/>
          }}
{loanForm && <LoanFormSpecification loanForm={loanForm} />}
</GridItem>
</GridContainer>

      {viewMode !== ViewMode.View && (
<GridContainer
style={{
textAlign: 'right',
}}
>
<GridItem xs={12} sm={12} md={12}>
<Button
id="core-product-discard-changes"
color="danger"
simple
onClick={() => {
formOperations.handleDiscardChanges();
}}
>
Discard Changes
</Button>

            {((loanForm &&
loanForm.recordState == RecordState.Draft &&
viewMode === ViewMode.Edit) ||
viewMode === ViewMode.Create) && (
<Button
id="core-product-save-draft"
style={{
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={handleSaveDraftClicked}
disabled={!loanFormName}
>
Save Draft
</Button>
            }}
<Button
id="core-product-save"
color="success"
onClick={handleSaveClicked}
disabled={!loanFormName}
>
Save
</Button>
</GridItem>
</GridContainer>
      ]}
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 391. `C:\DevCode\AstroUI\src\components\LoanAppForm\LoanFormSpecification.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\LoanFormSpecification.tsx" type=".tsx" size="1983" lines="71" chars="1983" -->
```typescript
import React from 'react';
import { Core } from 'commonui';

import { CardSection } from 'components/Card/CardSection';
import { SCLargeTextArea } from './styles';
import { parseLoanForm } from './utils';

interface ILoanFormSpeciifcation {
loanForm: {
specificationJSON: string;
};
}

const flattenSpecificationToFields = (specification: {
sections: Core.LoanApplicationEntities.ISection[];
}): Core.LoanApplicationEntities.IDataField[] =>
(specification.sections || [])
.reduce<Core.LoanApplicationEntities.ISectionSegment[]>(
(allSegments, { segments }) => [...allSegments, ...(segments || [])],
[],
    ]
.reduce<Core.LoanApplicationEntities.IFieldGroup[]>(
(allFieldGroups, { fieldGroups }) => [
...allFieldGroups,
           .(fieldGroups Il []),
],
[],
    ]
.reduce<Core.LoanApplicationEntities.IDataField[]>(
(allFields, { dataFields }) => [...allFields, ...(dataFields || [])],
[],
    ];

const LoanFormSpecification = ({
loanForm,
}: ILoanFormSpeciifcation): JSX.Element => {
const specification = parseLoanForm(loanForm.specificationJSON) || {};
const allFields = flattenSpecificationToFields(specification);
const formatForTextarea = (value: any): string =>
JSON.stringify(value, undefined, 4);

  return (
    >>
<CardSection title="Loan Form Specification JSON">
<SCLargeTextArea
id="json_spec"
readOnly
value={formatForTextarea(specification)}
        [>
</CardSection>
<CardSection title="Loan Form Fields Codes">
<SCLargeTextArea
id="json_spec"
readOnly
value={formatForTextarea(
allFields.reduce(
(fieldMap, { fieldCode, fieldLabel }) => ({
...fieldMap,
[fieldCode]: fieldLabel,
              }],
{},
            },
          }}
        [>
</CardSection>
</>
  ];
};

export { LoanFormSpecification };

```
<!-- CODESCAN_FILE_END -->

---

### 392. `C:\DevCode\AstroUI\src\components\LoanAppForm\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormIstyles.ts" type=".ts" size="274" lines="13" chars="274" -->
```typescript
import styled from 'styled-components';
import { Theme } from 'commonui';

const SCLargeTextArea = styled.textarea`
width: 90%;
resize: none;
border: 1px solid ${Theme.getColor('contrastGreyscale04')};
height: 500px;
padding: 10px;
`;

export { SCLargeTextArea };

```
<!-- CODESCAN_FILE_END -->

---

### 393. `C:\DevCode\AstroUI\src\components\LoanAppForm\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\Itypes.ts" type=".ts" size="1841" lines="82" chars="1841" -->
```typescript
import { Core } from 'commonui';
import { Dispatch, SetStateAction } from 'react';

export interface ITokenSubstitutionEntity {
token: string;
replacement: string;
}

export type IOptionalSectionEntity = Core.LoanApplicationEntities.ISection & {
optional: boolean;
hidden: boolean;
};

export type IOptionalSegmentEntity =
Core.LoanApplicationEntities.ISectionSegment & {
optional: boolean;
hidden: boolean;
};

export interface IOptionalElement {
id: string;
name: string;
on: boolean;
}

export type SetOptionalElements = Dispatch<SetStateAction<IOptionalElement[]>>;

export interface IUseCustomizeLoanForm {
sections: IOptionalElement[];
segments: IOptionalElement[];
setSections: SetOptionalElements;
setSegments: SetOptionalElements;
}

export interface ICustomizeLoanForm extends IUseCustomizeLoanForm {
disabled?: boolean;
}

export interface ICustomizeLoanFormList {
keyId: string;
headerText: string;
items: IOptionalElement[];
setItems: SetOptionalElements;
disabled?: boolean;
}

export interface IUpdateOptionalSectionsAndSegments {
formId: string;
tenantId: string;
sections: IOptionalElement[];
segments: IOptionalElement[];
}

export interface ICreateForm {
recordState: RecordState;
loanFormName: string;
loanFormDescription: string | undefined;
loanFormVersionDescription: string | undefined;
templateId: string;
coreProductId: string;
specificationJSON: string;
tenantId: string;
}

export interface IUpdateForm {
loanForm: any;
formId: string;
recordState: RecordState;
loanFormName: string;
loanFormDescription: string | undefined;
loanFormVersionDescription: string | undefined;
tenantId: string;
}

export enum RecordState {
Active = 'Active',
Draft = 'Draft',
Inactive = 'Inactive',
New = 'New',
NotInUse = 'Not-in-use',
}

```
<!-- CODESCAN_FILE_END -->

---

### 394. `C:\DevCode\AstroUI\src\components\LoanAppForm\useCustomizeLoanForm.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\useCustomizeLoanForm.ts" type=".ts" size="1665" lines="56" chars="1665" -->
```typescript
import { useEffect, useState } from 'react';
import {
IOptionalElement,
IOptionalSectionEntity,
IOptionalSegmentEntity,
ITokenSubstitutionEntity,
IUseCustomizeLoanForm,
} from './types';
import { parseLoanForm, replaceTokens } from './utils';

export const useCustomizeLoanForm = (
specificationJSON: string,
): IUseCustomizeLoanForm => {
const [sections, setSections] = useState<IOptionalElement[]>([]);
const [segments, setSegments] = useState<IOptionalElement[]>([]);

  useEffect(() => {
const { tokenSubstitutions = [], sections = [] } = parseLoanForm<{
tokenSubstitutions: ITokenSubstitutionEntity[] | undefined;
sections: IOptionalSectionEntity[] | undefined;
}>(specificationJSON || '') || {
tokenSubstitutions: undefined,
sections: undefined,
};

    const optionalSections = sections
.filter(({ optional }) => optional)
.map(({ sectionCode, sectionTitle, hidden }) => ({
id: sectionCode,
name: replaceTokens(tokenSubstitutions, sectionTitle),
on: !hidden,
      }]};
setSections(optionalSections);
const optionalSegments = sections.flatMap(({ sectionTitle, segments }) =>
(segments as IOptionalSegmentEntity[])
.filter(({ optional }) => optional)
.map(({ segmentCode, segmentTitle, hidden }) => ({
id: segmentCode,
name: replaceTokens(
tokenSubstitutions,
`${sectionTitle} - ${segmentTitle}`,
          },
on: !hidden,
        }]},
    ];
setSegments(optionalSegments);
}, [specificationJSON]);

  return {
sections,
setSections,
segments,
setSegments,
};
};

```
<!-- CODESCAN_FILE_END -->

---

### 395. `C:\DevCode\AstroUI\src\components\LoanAppForm\utils.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppForm\lutils.ts" type=".ts" size="4564" lines="181" chars="4564" -->
```typescript
import { gzip } from 'pako';
import { Base64 } from 'js-base64';
import { client2 } from 'utils/api-client';
import {
ITokenSubstitutionEntity,
IUpdateForm,
ICreateForm,
IUpdateOptionalSectionsAndSegments,
} from './types';

[>>
* Takes in a string and replaces a bracket-separated substring (`[Replace Me]`) with
* a substitution as defined by the product config (substitutions). See tests for
* usage examples.
>
* Limitations: Assumes only one token exists in `str`.
>
* @param {ITokenSubstitutionEntity[]} substitutions
* @param {string} str
* @return {*}  {string}
>[
export const replaceTokens = (
substitutions: ITokenSubstitutionEntity[],
str: string,
): string => {
const token = str.match(/\[(.)+\]/g)?.[0].slice(1, -1);
const substitution = substitutions.find((t) => t.token === token);
if (!token || !substitution) return str;
return str.replace(`[${token}]`, substitution.replacement);
};

[>>
* A wrapper around PUT `optional-form-modifications` in LoanMgmt that updates
* the loan form's optional sections and segments. Does nothing if sections &
* segments are empty.
>
* @param {IUpdateOptionalSectionsAndSegments} {
*   formId,
*   tenantId,
*   sections,
*   segments,
> }
* @return {*}  {Promise<void>}
>[
export const updateOptionalSectionsAndSegments = async ({
formId,
tenantId,
sections,
segments,
}: IUpdateOptionalSectionsAndSegments): Promise<void> => {
if (sections.length === 0 && segments.length === 0) return;

const uri = ‘${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}optional-form-modifications/${formId}';
const payload = {
sections: sections.map(({ id, on }) => ({
sectionCode: id,
hidden: !on,
    }}],
segments: segments.map(({ id, on }) => ({
segmentCode: id,
hidden: !on,
    }}],
};
const config = {
headers: {
'X-TENANT-ID': tenantId,
'Content-Type': 'application/json',
},
body: JSON.stringify(payload),
};
const method = 'PUT';
return client2(uri, method, config, false);
};

[>>
* Creates a loan form. Used when a record does not already exist. A wrapper
* around POST `loan-forms` in LoanMgmt.
>
* @param {ICreateForm} {
*   recordState,
*   loanFormName,
*   loanFormDescription,
*   loanFormVersionDescription,
*   templateId,
*   coreProductId,
*   specificationJSON,
*   tenantId,
> }
* @return {*}  {Promise<void>}
>[
export const createForm = async ({
recordState,
loanFormName,
loanFormDescription,
loanFormVersionDescription,
templateId,
coreProductId,
specificationJSON,
tenantId,
}: ICreateForm): Promise<void> => {
const payload = {
recordState,
name: loanFormName,
description: loanFormDescription || 'Loan Form',
version: 1,
versionDescription: loanFormVersionDescription || 'Initial version',
loanFormTemplateId: templateId,
coreProductId,
specificationJSON,
metadataJSON: {},
businessRulesJSON: {},
};

  const uri = `${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-forms`;
const method = 'POST';

  const config = {
headers: {
'X-TENANT-ID': tenantId,
'Content-Type': 'text/plain',
},
body: Base64.fromUint8Array(gzip(JSON.stringify(payload))),
};

  return client2(uri, method, config, false);
};

[>>
* Updates the loan form's metadata. A wrapper around PUT `loan-forms` in
* LoanMgmt.
>
* @param {IUpdateForm} {
*   loanForm,
*   formId,
*   recordState,
*   loanFormName,
*   loanFormDescription,
*   loanFormVersionDescription,
*   tenantId,
> }
* @return {*}  {Promise<void>}
>[
export const updateForm = async ({
loanForm,
formId,
recordState,
loanFormName,
loanFormDescription,
loanFormVersionDescription,
tenantId,
}: IUpdateForm): Promise<void> => {
const payload = {
...JSON.parse(JSON.stringify(loanForm)),
name: loanFormName,
description: loanFormDescription || '',
versionDescription: loanFormVersionDescription || '',
recordState,
};
const uri = `${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-forms/${formId}`;
const method = 'PUT';

  const config = {
headers: {
'X-TENANT-ID': tenantId,
'Content-Type': 'text/plain',
},
body: Base64.fromUint8Array(gzip(JSON.stringify(payload))),
};

  return client2(uri, method, config, false);
};

export const parseLoanForm = <T = any>(stringJson: string): T | undefined => {
try {
return JSON.parse(stringJson) as T;
} catch (error) {
console.warn('Unable to parse JSON');
return undefined;
}
};

```
<!-- CODESCAN_FILE_END -->

---

### 396. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\__test__\LoanAppFormList.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\_test__\LoanAppFormList.test.jsx" type=".jsx" size="13995" lines="498" chars="13995" -->
```javascript
import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { renderWithMockTenant } from 'components/__mock__/mock-context';

import LoanAppFormsList from '../LoanAppFormsList';
import { v4 as uuid } from 'uuid';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';

describe.skip('LoanAppFormList', () => {
const tenantId = uuid();
const mockTenant = {
id: tenantId,
};
const mockPush = jest.fn();
const fetchSpy = jest.spyOn(window, 'fetch');
const defaultProps = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/loan-app-forms`,
},
push: mockPush,
},
match: {
params: {
tenantId,
},
},
};

  const templateIdA = uuid();
const templateIdB = uuid();
const coreProductTemplateId = uuid();

  const mockFormA = {
formId: '1',
recordState: 'Active',
name: 'Loan App Form 1',
description: 'This is a test',
version: 1,
coreProductId: '14',
lastUpdated: '2022-02-28T17:39:45.852Z',
loanFormTemplateId: '15',
productName: 'Default Product Name 1',
productVersion: '1',
loanFormTemplateId: templateIdA,
};

  const mockFormB = {
formId: '2',
recordState: 'Draft',
name: 'Loan App Form 2',
description: 'This is a test',
version: 1,
coreProductId: '10',
lastUpdated: '2022-02-28T17:39:24.456Z',
loanFormTemplateId: '11',
productName: 'Default Product Name 2',
productVersion: '2',
loanFormTemplateId: templateIdA,
};

  const mockTemplateA = {
templateId: templateIdA,
coreProductTemplateId: coreProductTemplateId,
recordState: 'Draft',
name: 'AutomatedTestTemplate-5672b55520',
description: 'Template for new auto loans',
version: 1,
versionDescription: '',
isAssigned: 'true',
templateCreateDate: '2023-05-02T16:04:09.522Z',
};

  const mockTemplateB = {
templateId: templateIdB,
coreProductTemplateId: coreProductTemplateId,
recordState: 'Draft',
name: 'AutomatedTestTemplate-5672b55522',
description: 'Template for new auto loans',
version: 2,
versionDescription: '',
isAssigned: 'true',
templateCreateDate: '2023-05-03T16:04:09.522Z',
};

  const mockProduct = {
id: '14',
templateId: coreProductTemplateId,
recordState: 'Draft',
name: 'AutomatedTestTemplate-5672b55520',
description: 'Template for new auto loans',
version: 1,
versionDescription: '',
isAssigned: 'false',
};

  const mockLoanListPromise = Promise.resolve({
payload: [mockFormA, mockFormB],
  }};

  const mockTemplatesPromise = Promise.resolve({
payload: [mockTemplateA, mockTemplateB],
  }};

  const mockProductsPromise = Promise.resolve({
payload: [mockProduct],
  }};

  afterEach(() => {
fetchSpy.mockClear();
mockPush.mockClear();
  }};

  test('Test population of loan form list', async () => {
const props = {
...defaultProps,
};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockLoanListPromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockProductsPromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
      }];

    const wrapper = renderWithMockTenant(
mockTenant,
<LoanAppFormsList {...props} />,
    ];

    const nameHeader = await screen.findByText('Name');
expect(nameHeader);

    const rows = wrapper.getAllByRole('row');
expect(rows.length).toBe(3);

    const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0).textContent).not.toBe('');
expect(productRow1.item(1).textContent).toBe('Loan App Form 1');
expect(productRow1.item(2).textContent).toBe('1');
expect(productRow1.item(3).textContent).toBe('Default Product Name 1');
expect(productRow1.item(4).textContent).toBe('1');
expect(productRow1.item(6).textContent).toBe('Active');

    expect(productRow2.item(0).textContent).not.toBe('');
expect(productRow2.item(1).textContent).toBe('Loan App Form 2');
expect(productRow2.item(2).textContent).toBe('1');
expect(productRow2.item(3).textContent).toBe('Default Product Name 2');
expect(productRow2.item(4).textContent).toBe('2');
expect(productRow2.item(6).textContent).toBe('Draft');

    expect(nameHeader);

    const rowToView = rows[1];
expect(rowToView);

    const allUpgradeButtons = screen.getAllByRole('button', {
name: 'upgrade',
    }};
expect(allUpgradeButtons.length).toBe(1);

    const allViewButtons = screen.getAllByRole('button', { name: 'view' });
/** 0-index button is the for the first mock loan form
* This matches the mockPush expect below with ID = 1 */
const firstRowViewButton = allViewButtons[0];
fireEvent.click(firstRowViewButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/loan-app-form/1/view`,
    ];
}, 10000);

  test.skip('Test create new loan form button', async () => {
const props = {
...defaultProps,
};

    const mockLoanListPromise = Promise.resolve({
payload: [mockFormA, { ...mockFormB, recordState: 'Active' }],
    }};

    const mockTemplatesPromise = Promise.resolve({
payload: [
{
...mockTemplateA,
recordState: 'Active',
},
],
    }};

    const mockProductsPromise = Promise.resolve({
payload: [
{
...mockProduct,
recordState: 'Active',
name: 'AutomatedTestTemplate',
},
],
    }};

    fetchSpy
.mockResolvedValueOnce({
ok: true,
json: () => mockProductsPromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockLoanListPromise,
      }]
.mockResolvedValueOnce({
ok: true,
json: () => mockTemplatesPromise,
      }];

    const wrapper = render(
wrapWithMockContext(
tenantId,
<div id="adminNavCreateBtn">
<LoanAppFormsList {...props} />
</div>,
      ],
    ];

    const buttons = await screen.findAllByRole('button');
const templateSelector = buttons.find(
(button) => (button.id = 'select-coreProductTemplate'),
    ];
fireEvent.click(templateSelector);

    const options = await screen.findAllByRole('option');
// options.forEach(option => wrapper.debug(option))
const targetTemplateOption = options[1];

    fireEvent.click(targetTemplateOption);

    const loanTemplateSelector = buttons.find(
(button) => (button.id = 'select-listAppForm'),
    ];
fireEvent.click(loanTemplateSelector);

    const createBtn = buttons.find(
(button) => (button.id = 'loanFormCreateBtn'),
    ];
fireEvent.click(createBtn);
}, 10000);

  // test('Test click view product', async (done) => {

  //     const tenantId = uuid()
//     const templateId = uuid()
//     const loanId = uuid()
//     const coreProductTemplateId = uuid()

  //     const props = {

  //         history: {
//             location: {
//                 // '/admin/tenant/:tenantId/core-products'
//                 pathname: `/admin/tenant/${tenantId}/loan-app-forms`
//             },
//             push: (v) => {
//                 expect(v).toBe(`/admin/tenant/${tenantId}/loan-app-form/${loanId}/view`)
//                 done()
//             }
//         }

  //     }

  //     const mockLoanListPromise = Promise.resolve(
//         {
//             payload: [

  //                 {
//                     formId: "1",
//                     recordState: "Active",
//                     name: "Loan App Form 1",
//                     description: "This is a test",
//                     version: 1,
//                     coreProductId: "14",
//                     loanFormTemplateId: "15",
//                     productName: "Default Product Name 1"
//                 }, {
//                     formId: "2",
//                     recordState: "Draft",
//                     name: "Loan App Form 2",
//                     description: "This is a test",
//                     version: 1,
//                     coreProductId: "10",
//                     loanFormTemplateId: "11",
//                     productName: "Default Product Name 2"
//                 }

  //             ]
//         })

  //     const mockProductsPromise = Promise.resolve({
//         payload: [
//             {
//                 templateId: templateId,
//                 coreProductTemplateId: coreProductTemplateId,
//                 recordState: "Draft",
//                 name: "AutomatedTestTemplate-5672b55520",
//                 description: "Template for new auto loans",
//                 version: 1,
//                 versionDescription: "",
//                 isAssigned: "false"
//             }

  //         ]
//     })

  //     jest.spyOn(window, 'fetch').mockImplementationOnce(() => {

  //         return Promise.resolve({
//             ok: true,
//             json: () => mockProductsPromise
//         })

  //     }).mockImplementationOnce(() => {

  //         return Promise.resolve({
//             ok: true,
//             json: () => mockProductsPromise
//         })

  //     })

  //     const wrapper1 = renderWithMockTenant(tenantId,<LoanAppFormsList {...props} />)

  //     const nameHeader = await wrapper1.findByText("Name")
//     expect(nameHeader)

  //     const rows = wrapper1.getAllByRole("row")

  //     expect(rows.length).toBe(2)

  //     const productRow1 = rows[1]
//     console.log(productRow1)
//     fireEvent.click(productRow1)

  /{)

  // test('Click edit button for product', async (done) => {

  //     const tenantId = uuid()
//     const templateId = uuid()
//     const productId = uuid()

  //     const props = {

  //         history: {
//             location: {
//                 pathname: `/admin/tenant/${tenantId}/core-products`
//             },
//             push: (v) => {
//expect(v).toBe('/admin/tenant/${tenantId}/core-products/${templateId}/${productId}/edit')
//                 done()
//             }
//         }

  //     }

  //     const mockProductListPromise = Promise.resolve(
//         {
//             payload: [

  //                 {
//                     id: productId,
//                     templateId: templateId,
//                     tenantId: tenantId,
//                     name: "Product 1",
//                     version: 1,
//                     category: "Lending",
//                     type: "Auto",
//                     recordState: "Draft"
//                 },
//                 {
//                     name: "Product 2",
//                     version: 2,
//                     category: "Lending",
//                     type: "Auto",
//                     recordState: "Active"
//                 }

  //             ]
//         })

  //     const mockTemplatesPromise = Promise.resolve({
//         payload: [

  //             {
//                 tenantId: tenantId,
//                 templateId: templateId,
//                 recordState: "Active",
//                 name: "001",
//                 category: "Lending",
//                 type: "Auto",
//                 subtype: "New",
//                 version: 1,
//                 versionDescription: "",
//                 isAssigned: "true"
//             }

  //         ]
//     })

  //     jest.spyOn(window, 'fetch').mockImplementationOnce(() => {

  //         return Promise.resolve({
//             ok: true,
//             json: () => mockProductListPromise
//         })

  //     }).mockImplementationOnce(() => {

  //         return Promise.resolve({
//             ok: true,
//             json: () => mockTemplatesPromise
//         })

  //     })

  //     const wrapper = renderWithMockContext(<CoreProductsList {...props} />)

  //     const nameHeader = await screen.findByText("Name")
//     expect(nameHeader)

  //     const rows = wrapper.getAllByRole("row")

  //     const rowToView = rows[1]
//     fireEvent.mouseOver(rowToView)

  //     let editButton = await getById(wrapper.container, productId + "_edit")
//     expect(editButton.style["_values"]["visibility"]).toBe("visible")
//     fireEvent.click(editButton)

  //{)

  test('Error fetching product listing', async () => {
const props = {
...defaultProps,
};

    for (let i = 0; i < 3; i++) {
fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
          },
      }];
}
const dom = renderWithMockTenant(tenantId, <LoanAppFormsList {...props} />);

    const errorNotification = await dom.findByRole('full-page-status-error');
expect(errorNotification);
  }};

  function wrapWithMockContext(tenantId, component) {
const mockContext = {
tenant: { id: tenantId },
setTenant: () => {},
setPageTitle: () => {},
setDisplayCreateButton: (v) => {},
setCreateButtonClicked: (v) => {},
createButtonClicked: true,
setDisplayLoadButton: (v) => {},
displayLoadButton: false,
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<AuthContext.Provider value={mockAuthContext}>
<AppContext.Provider value={mockContext}>
<UserContext.Provider value={{ user: { x: '' } }}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
    ];
}
}};

```
<!-- CODESCAN_FILE_END -->

---

### 397. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormActivationButton.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormActivationButton.tsx" type=".tsx" size="2149" lines="84" chars="2149" -->
```typescript
import React from 'react';
import { Icon, ICON_TYPES } from 'commonui';
import { SCActionButton } from '../TableStyles';
import { SCActivationButton } from './styles';

const actionButtonStates = {
active: {
'aria-label': 'deactivate',
color: 'red',
title: 'Deactivate loan form',
helpText: 'There are multiple active forms for this core product version',
},
inActive: {
'aria-label': 'activate',
color: 'green',
title: 'Activate loan form',
helpText: 'There are no active forms for this core product version',
},
onlyActive: {
'aria-label': 'deactivate',
color: 'orange',
title: 'Deactivate only loan form?',
helpText: 'This is the only active form for this core product version',
},
otherActive: {
'aria-label': 'activate',
color: 'orange',
title: 'Activate additional loan form?',
helpText: 'There is currently an active form for this core product version',
},
};

const ActivationButton = ({
formId,
isActive,
onClick,
otherActiveForms,
isCurrentCoreProduct,
}: {
formId: string;
isActive: boolean;
isCurrentCoreProduct: boolean;
onClick: () => void;
otherActiveForms: boolean;
}): JSX.Element => {
let buttonProps: any = actionButtonStates.active;

  if (!otherActiveForms) {
buttonProps = actionButtonStates.onlyActive;
}

  if (!isActive) {
buttonProps = otherActiveForms
? actionButtonStates.otherActive
: actionButtonStates.inActive;
}

  return (
<SCActivationButton isOldCoreProduct={!isCurrentCoreProduct}>
<SCActionButton
id={`${formId}_activate`}
onClick={onClick}
className="edit"
{...buttonProps}
>
{isActive ? (
<div>
<Icon size={14} name={ICON_TYPES.CLOSE} />
</div>
        } ; {
<Icon size={14} name={ICON_TYPES.LARGE_CHECKMARK_WHITE} />
        }}
</SCActionButton>
<span>
{isCurrentCoreProduct
? buttonProps.helpText
: buttonProps.helpText.replace('core product', 'old core product')}
</span>
</SCActivationButton>
  ];
};

export { ActivationButton };

```
<!-- CODESCAN_FILE_END -->

---

### 398. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormDataGrid.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormDataGrid.tsx" type=".tsx" size="7444" lines="241" chars="7444" -->
```typescript
import React from 'react';
import { Icon, ICON_TYPES, Spinner, Table } from 'commonui';
import Header from 'components/Header/Header';
import { LoanAppForm, LoanAppFormDataGridProps } from './types';
import { useLoanAppFormDataGrid } from './useLoanAppFormDataGrid';
import { SCActions, SCStatus, SCActionButtonLink } from '../TableStyles';
import { ActivationButton } from './LoanAppFormActivationButton';
import { DateTime } from 'luxon';
import { Link, useNavigate } from 'react-router-dom';

// Need to wrap this in a react component and pass the record state through props,
// so that the custom react sort FN can get at the record state
const Status = ({
statusChangeInProgress,
recordState,
}: {
statusChangeInProgress: boolean;
recordState: string;
}): JSX.Element => {
if (statusChangeInProgress) {
return <Spinner width={40} height={40} />;
}

  return <SCStatus status={recordState}>{recordState}</SCStatus>;
};

export default function LoanAppFormDataGrid(props: LoanAppFormDataGridProps) {
const {
setUpdatedLoanForm,
/** Provide a default value in case tenant from props is undefined
* (it should not be, but typescript doesn't know this) */
tenant = {
id: '',
legalName: '',
tenantSchema: '',
creationPending: false,
defaultMerchantId: null,
},
loanAppFormList: loanAppList,
} = props;
const {
statusChangeInProgressMap,
setStatusChangeInProgressMap,
toggleRecordState,
} = useLoanAppFormDataGrid({ setUpdatedLoanForm, tenant: tenant as any });

  const push = useNavigate();

  const formatdata = (loanAppForms: LoanAppForm[]) =>
loanAppForms.map((loanAppForm, i) => {
const {
lastUpdated,
formId,
coreProductId,
recordState,
name,
version,
productName,
productVersion,
newestTemplateID,
} = loanAppForm;
/** This looks for another loan app form tied to the same core product
* If one exists, then this one is safe to be made inactive (the core product will stillhave a loan form)
       >[
const activeFormsWithSameCoreProduct = loanAppForms.filter(
(form) =>
form.formId !== formId &&
form.coreProductId === coreProductId &&
form.recordState === 'Active',
      ];
const editEligible = true;
const isActive = recordState && recordState === 'Active';

      const coreProductVersions = loanAppForms
.filter((form) => form.productName === productName)
.map(({ productVersion }) => productVersion);

      const isLatestCoreProductVersion =
productVersion === Math.max(...coreProductVersions);

      const baseUrl = `/admin/tenant/${tenant.id}/loan-app-form/${formId}`;
const viewUrl = `${baseUrl}/view`;
const editUrl = `${baseUrl}/edit`;
const upgradeUrl = ‘/admin/tenant/${tenant.id}/loan-app-forms/${newestTemplateID}/${coreProductId}/upgrade/${formId}';
//All forms with available upgrade will be shifted up, but still sorted
const millisecondsShiftForFormsWithNewerTemplate = new Date(
'2100',
).valueOf();
return {
lastUpdated: DateTime.fromISO(lastUpdated).toRelative() ?? '',
sortIndex:
(newestTemplateID ? millisecondsShiftForFormsWithNewerTemplate : 0) +
new Date(lastUpdated).valueOf(),
lastUpdatedValue: new Date(lastUpdated).valueOf(),
id: formId,
nameValue: name,
name: <Link to={viewUrl}>{name}</Link>,
version: version,
productName: productName,
productVersion: productVersion,
isActive,
viewProduct: () => push(viewUrl),
recordState: recordState,
activateAction: (
<ActivationButton
formId={formId}
isActive={isActive}
isCurrentCoreProduct={isLatestCoreProductVersion}
otherActiveForms={activeFormsWithSameCoreProduct.length > 0}
onClick={() => {
if (statusChangeInProgressMap[i]) return;
setStatusChangeInProgressMap((prev: any) => {
return {
...prev,
[i]: true,
};
              }];
toggleRecordState(i, loanAppForm, isActive);
}}
          [>
        },
status: (
<Status
recordState={recordState}
statusChangeInProgress={statusChangeInProgressMap[i]}
          [>
        },
actions: (
// we've added some custom button actions
<SCActions>
{/* use this button to add a like kind of action */}
<SCActionButtonLink
id={`${formId}_view`}
aria-label="view"
title="View Form"
to={viewUrl}
color="blue"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
{editEligible && (
<SCActionButtonLink
id={`${formId}_edit`}
aria-label="edit"
title="Edit Form"
to={editUrl}
color="green"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
            }}
{newestTemplateID && (
<SCActionButtonLink
id={`${formId}_upgrade`}
aria-label="upgrade"
title="Upgrade Form"
to={upgradeUrl}
color="orange"
>
<Icon size={14} name={ICON_TYPES.UPLOAD_CLOUD} />
</SCActionButtonLink>
            }}
</SCActions>
        },
};
    }};

  // configure the create button action

  const tableData = formatdata(loanAppList);
const staticColumn = {
filterable: false,
sortable: false,
};
const tableColumnData = [
{
Header: <Header>Last Updated</Header>,
accessor: 'lastUpdated',
serialize: ({ lastUpdatedValue }: any) => lastUpdatedValue,
filterable: false,
maxWidth: 150,
},
{
Header: <Header>Name</Header>,
accessor: 'name',
serialize: (row: any) => row.nameValue,
},
{
Header: <Header>Version</Header>,
accessor: 'version',
maxWidth: 100,
},
{
Header: <Header>Core Product</Header>,
accessor: 'productName',
},
{
Header: <Header>Core Product Version</Header>,
accessor: 'productVersion',
maxWidth: 100,
},
{
...staticColumn,
Header: <Header>Toggle Record State</Header>,
accessor: 'activateAction',
maxWidth: 220,
},
{
filterable: false,
Header: <Header>Status</Header>,
accessor: 'status',
maxWidth: 100,
serialize: (row: any) => row.recordState,
},
{
...staticColumn,
Header: <Header>View & Edit</Header>,
accessor: 'actions',
sortable: false,
filterable: false,
maxWidth: 200,
},
];
return (
    >>
<div role="coreProductTemplateListGrid">
<Table
data={tableData}
defaultSort={{ column: 'sortIndex', direction: 'desc' }}
filterable
sortable
columns={tableColumnData.map((elem) => ({
...elem,
maxWidth: `${elem.maxWidth}px`,
          }]}}
        [>
</div>
</>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 399. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormsList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormsList.tsx" type=".tsx" size="3916" lines="146" chars="3916" -->
```typescript
import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
DynamicInputField,
DynamicNotification,
Spinner,
ToggleButton,
useConfirmModal,
} from 'commonui';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { useAppContext } from 'context/app-context';
import LoanAppFormDataGrid from './LoanAppFormDataGrid';
import { LoanAppForm } from './types';
import LoanAppFormsModal from './LoanAppFormsModal';
import { useLoanAppFormsList } from './useLoanAppFormsList';
import { SCNotificationContainer } from '../TableStyles';
import { SCTableContainer } from './styles';

export default function LoanAppFormsList(props: any) {
const params = useParams();
const tenantId = params.tenantId;

  const createLoanAppForm = useConfirmModal();

  const {
activeOnly,
dateFilter,
errorResponse,
loading,
loanAppFormList,
productList,
setActiveOnly,
setLoading,
setLoanAppFormList,
setDateFilter,
debounceLoadFormsAndData,
} = useLoanAppFormsList(tenantId);

  const {
tenant,
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
displayLoadButton,
setDisplayLoadButton,
} = useAppContext();
const titleList = new Map();

  if (tenant)
titleList.set(`${tenant?.legalName} > `, `/admin/tenant/${tenant.id}/view`);

  titleList.set(
`Loan Application Forms`,
`/admin/tenant/${tenant ? tenant.id : ''}/loan-app-forms`,
  ];

  useEffect(() => {
if (!createButtonClicked) return;
if (!loading) showCreateModal();
setCreateButtonClicked(false);
}, [createButtonClicked]);

  useEffect(() => {
setDisplayCreateButton(true);
setDisplayLoadButton(true);
if (!loading && displayLoadButton) setDisplayLoadButton(false);
if (!loading) return;
setPageTitle(titleList);
}, [loading]);

  const setUpdatedLoanForm = (i: number, loanAppForm: LoanAppForm) => {
setLoanAppFormList((state) => {
const newState = [...state];
newState[i] = loanAppForm;
return newState;
    }};
};

  const showCreateModal = async (): Promise<void> => {
// this creates the modal. the actual dropdowns are inside it
await createLoanAppForm({
id: 'create-loan-app-form',
title: 'Create: Loan Application Form',
body: (
<LoanAppFormsModal
tenant={tenant}
productList={productList}
debounceLoadFormsAndData={debounceLoadFormsAndData}
dateFilter={dateFilter}
        [>
      ],
    }};
};

  if (errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<div>
<SCNotificationContainer>
<DynamicNotification limit={1} />
</SCNotificationContainer>
<SCTableContainer>
<div>
<DynamicInputField
validateAllFields
dataField={{
fieldType: 'date',
fieldCode: 'date-filter',
fieldLabel: 'Templates after Date',
}}
value={dateFilter}
onChange={(_, newDate) => {
setDateFilter(newDate);
}}
          [>
<ToggleButton
id="forms-active-toggle"
selectedValue={activeOnly ? 'active' : 'all'}
onChange={(_name, value) => {
setActiveOnly(value === 'active');
}}
options={[
{ label: 'active', value: 'active' },
{ label: 'all', value: 'all' },
]}
size={'Large' as any}
          [>
</div>
{loading ? (
<Spinner />
        } ; {
<LoanAppFormDataGrid
loanAppFormList={loanAppFormList}
tenant={tenant}
setUpdatedLoanForm={setUpdatedLoanForm}
{...props}
          [>
        }}
</SCTableContainer>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 4oo. ‘C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormsModal.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\LoanAppFormsModal.tsx" type=".tsx" size="6451" lines="221" chars="6451" -->
```typescript
import React, { useState, useContext } from 'react';
import { ModalContext, Spinner, Combobox } from 'commonui';
import { client2 } from 'utils/api-client';
import { createForm } from '../LoanAppForm/utils';
import { RecordState } from '../LoanAppForm/types';
import {
SCDynamicInputField,
SCModalButtonsWrapper,
SCActionButton,
SCErrorField,
SCComboboxWrapper,
} from './styles';

export default function LoanAppFormsModal({
tenant,
productList,
debounceLoadFormsAndData,
dateFilter,
}: any): JSX.Element {
const { modalState } = useContext(ModalContext);

  const [loanTemplate, setLoanTemplate] = useState('');
const [product, setProduct] = useState('');
const [loanFormName, setLoanFormName] = useState('');
const [loanFormDescription, setLoanFormDescription] = useState('');
const [loanFormVersion, setLoanFormDescriptionVersion] = useState('');
const [loading, setLoading] = useState<boolean>(false);
const [loanTemplateList, setLoanTemplateList] = useState<any[]>([]);
const [error, setError] = useState<any>(null);

  const productOptions = productList?.map((product: any) => ({
label: product.name,
value: product.id,
  }}];
const loanTemplateOptions = loanTemplateList?.map((template: any) => ({
label: template.name,
value: template.templateId,
  }}];

  const getLoanTempsForSelectedProduct = (product: any): void => {
const tpId = productList.filter(
(template: any) => template.id == product,
)[0].templateId;

    const config = {
headers: {
'X-TENANT-ID': tenant?.id ?? '',
'X-PRODUCT-TEMPLATE-ID': tpId,
},
};

    client2(
`${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}tenant-loan-form-templates`,
'GET',
config,
    ]
.then((data: any) => {
const loanTemplates = data.payload.filter(
(template: any) => template.recordState === 'Active',
        };

        setLoanTemplateList(loanTemplates);
setLoading(false);
      }]
.catch((error) => {
console.log(error);
setLoading(false);
      }];
};

  const createLoanForm = async (recordState: RecordState): Promise<void> => {
if (!tenant) {
throw new Error('Tenant object not found in app context');
}
const config = {
headers: { 'X-TENANT-ID': tenant.id },
};

    try {
const formTemplateData = await client2(
'${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}/tenant-loan-form-templates/${loanTemplate}',
'GET',
config,
      ];
const specificationJSON = formTemplateData.payload?.specificationJSON;
await createForm({
recordState,
loanFormName: loanFormName,
loanFormDescription: loanFormDescription,
loanFormVersionDescription: loanFormVersion,
templateId: loanTemplate,
coreProductId: product,
specificationJSON,
tenantId: tenant.id,
      }];
debounceLoadFormsAndData.current(dateFilter);
modalState?.modalProps?.onClose();
} catch (e) {
setError(JSON.parse((e as any)?.message)?.result.errors[0].message);
}
};

  const onCreateLoanForm = async (): Promise<void> => {
const recordState = RecordState.Active;
await createLoanForm(recordState);
};

  const onSaveLoanFormAsDraft = async (): Promise<void> => {
const recordState = RecordState.Draft;
await createLoanForm(recordState);
};

  if (loading) {
return (
<div>
<Spinner width={150} height={150} />
</div>
    ];
}

  return (
    >>
<SCComboboxWrapper>
<Combobox
id="product_type"
name="productType"
label="Core Product"
value={product}
onChange={(name, value) => {
getLoanTempsForSelectedProduct(value);
setLoading(true);
setProduct(value);
}}
options={productOptions}
placeholder="Choose Type"
        [>
</SCComboboxWrapper>
<SCComboboxWrapper>
<Combobox
id="loan_template_type"
name="loanTemplateType"
label="Loan Application Template"
value={loanTemplate}
onChange={(name, value) => {
setLoanTemplate(value);
setLoanFormName(
loanTemplateOptions.filter((data) => data.value === value)[0]
.label,
            };
}}
options={loanTemplateOptions}
placeholder="Choose Type"
        [>
</SCComboboxWrapper>
<SCDynamicInputField
id="loan_form_name"
dataField={{
fieldType: 'text',
fieldCode: 'FIELD-LOAN-FORM-NAME',
fieldLabel: '* Loan Form Name',
required: true,
}}
validateAllFields
value={loanFormName}
onChange={(name, value): void => {
setLoanFormName(value);
setError('');
}}
      [>
<SCDynamicInputField
id="loan_form_description"
dataField={{
fieldType: 'text',
fieldCode: 'FIELD-LOAN-FORM-DESCRIPTION',
fieldLabel: 'Description',
placeholder: 'Loan Form',
required: false,
}}
validateAllFields={false}
value={loanFormDescription}
onChange={(name, value): void => {
setLoanFormDescription(value);
}}
      [>
<SCDynamicInputField
id="loan_form_version_description"
dataField={{
fieldType: 'text',
fieldCode: 'FIELD-LOAN-FORM-VERSION-DESCRIPTION',
fieldLabel: 'Version Description',
placeholder: 'Initial version',
required: false,
}}
validateAllFields={false}
value={loanFormVersion}
onChange={(name, value): void => {
setLoanFormDescriptionVersion(value);
}}
      [>
<SCErrorField id="error_code">{error}</SCErrorField>
<SCModalButtonsWrapper>
<SCActionButton
id="core-product-save-draft"
isSecondary
onClick={onSaveLoanFormAsDraft}
disabled={!loanTemplate || !loanFormName || !product}
>
Save As draft
</SCActionButton>
<SCActionButton
id="core-product-save"
onClick={onCreateLoanForm}
disabled={!loanTemplate || !loanFormName || !product}
>
Create
</SCActionButton>
</SCModalButtonsWrapper>
</>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 4o1. 'C:\DevCode\AstroUI\src\components\LoanAppFormsList\styles.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\styles.ts" type=".ts" size="1086" lines="54" chars="1086" -->
```typescript
import styled from 'styled-components';
import { DynamicInputField, CoreButton } from 'commonui';

const SCActivationButton = styled.div<{ isOldCoreProduct: boolean }>`
opacity: ${({ isOldCoreProduct }) => (isOldCoreProduct ? '50%' : '100%')};
display: flex;
> * {
margin-right: 8px;
}
`;

const SCDynamicInputField = styled(DynamicInputField)`
margin-bottom: 25px;
`;

const SCTableContainer = styled.div`
> div {
display: flex;
justify-content: space-between;
margin-bottom: 24px;
align-items: flex-end;
}
`;

const SCModalButtonsWrapper = styled.div`
display: flex;
justify-content: space-between;
`;

const SCActionButton = styled(CoreButton)`
text-decoration: none !important;
font-weight: 400 !important;
color: inherit !important;
`;

const SCErrorField = styled.div`
margin-bottom: 25px;
color: #f44336;
`;

const SCComboboxWrapper = styled.div`
margin-bottom: 25px;
`;

export {
SCActivationButton,
SCDynamicInputField,
SCErrorField,
SCTableContainer,
SCModalButtonsWrapper,
SCActionButton,
SCComboboxWrapper,
};

```
<!-- CODESCAN_FILE_END -->

---

### 4o2. 'C:\DevCode\AstroUI\src\components\LoanAppFormsListItypes.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\Itypes.ts" type=".ts" size="548" lines="22" chars="548" -->
```typescript
import { Tenant } from 'context/app-context';

export interface LoanAppForm {
formId: string;
name: string;
version: number;
coreProductId: string;
productName: string;
productVersion: number;
recordState: 'Active' | 'Inactive' | 'Draft';
lastUpdated: string;
loanFormTemplateId: string;
formTemplateType: string;
newestTemplateID: string;
}

export interface LoanAppFormDataGridProps {
loanAppFormList: LoanAppForm[];
setUpdatedLoanForm: (i: number, updatedLoanForm: LoanAppForm) => void;
tenant: Tenant | undefined;
}

```
<!-- CODESCAN_FILE_END -->

---

### 403. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\useLoanAppFormDataGrid.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanAppFormsList\useLoanAppFormDataGrid.ts" type=".ts" size="2880" lines="103" chars="2880" -->
```typescript
import React, { useState, useContext } from 'react';
import {
NotificationContext,
Core,
NotificationDisplay,
ICON_TYPES,
} from 'commonui';
import { client2 } from 'utils/api-client';
import { Base64 } from 'js-base64';
import { gzip } from 'pako';
import { LoanAppFormDataGridProps, LoanAppForm } from './types';

const useLoanAppFormDataGrid = ({
setUpdatedLoanForm,
tenant,
}: Omit<LoanAppFormDataGridProps, 'loanAppFormList' | 'history'>): {
toggleRecordState: (
i: number,
loanForm: LoanAppForm,
isActive: boolean,
) => void;
statusChangeInProgressMap: any;
setStatusChangeInProgressMap: React.Dispatch<any>;
} => {
const [statusChangeInProgressMap, setStatusChangeInProgressMap] =
useState<any>({});

  const { clearAndSetNotifications } = useContext(NotificationContext);
const setNote = (message: string, success: boolean): void => {
clearAndSetNotifications([
{
message,
type: success
? Core.NotificationType.SUCCESS
: Core.NotificationType.ALERT,
display: NotificationDisplay.GLOBAL,
dismissable: true,
...(success ? {} : { icon: ICON_TYPES.EXCLAMATION }),
},
    ]};
setTimeout(() => clearAndSetNotifications([]), 3000);
};

  const toggleRecordState = async (
i: number,
loanForm: LoanAppForm,
isActive: boolean,
) => {
if (!tenant) {
throw new Error(
'Tenant object was not set when trying to toggle record state',
      ];
}

    const newState = isActive ? 'Inactive' : 'Active';
let updatedLoanForm: LoanAppForm = JSON.parse(JSON.stringify(loanForm));
updatedLoanForm = { ...updatedLoanForm, recordState: newState };

const uri = ‘$process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-forms/${loanForm.formId}';

    const config = {
headers: {
'X-TENANT-ID': tenant.id,
'Content-Type': 'text/plain',
},
body: Base64.fromUint8Array(gzip(JSON.stringify(updatedLoanForm))),
};

    let loanFormResult: LoanAppForm;
try {
const res = await client2(uri, 'PUT', config, false);
loanFormResult = res.payload;
} catch (e) {
setNote('There was an error when toggling the record state', false);
console.error('Error toggling record state: ', e);
return;
} finally {
setStatusChangeInProgressMap((prev: any) => {
const newState = { ...prev };
delete newState[i];
return newState;
      }];
}

    updatedLoanForm.lastUpdated = loanFormResult.lastUpdated;
setUpdatedLoanForm(i, updatedLoanForm);
setNote(
`Record state successfully ${
newState === 'Active' ? 'activated' : 'inactivated'
}`,
true,
    ];
};

  return {
toggleRecordState,
statusChangeInProgressMap,
setStatusChangeInProgressMap,
};
};

export { useLoanAppFormDataGrid };

```
<!-- CODESCAN_FILE_END -->

---

### 404. `C:\DevCode\AstroUI\src\components\LoanAppFormsList\useLoanAppFormsList.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
import { useEffect, useRef, useState } from 'react';
import { client2 } from '../../utils/api-client';
import { LoanAppForm } from './types';
import { DateTime } from 'luxon';
import { LoanFormTemplateInfo } from '../LoanFormTemplate/LoanFormTemplateInfo';
import { RecordState } from '../../types';
import { debounce } from 'lodash';

const useLoanAppFormsList = (tenantId?: string) => {
const [productList, setProductList] = useState<any[]>([]);
const [assignedTemplates, setAssignedTemplates] = useState<
LoanFormTemplateInfo[]
  >{[]];

  const [allLoanAppForms, setAllLoanAppForms] = useState<LoanAppForm[]>([]);
const [loanAppFormList, setLoanAppFormList] = useState<LoanAppForm[]>([]);

  const [activeOnly, setActiveOnly] = useState(true);
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const today = new Date();
const aMonthAgo = new Date(today.valueOf() - 1000 * 60 * 60 * 24 * 30);
const defaultStartFilter = `${process.env.REACT_APP_LOANFORMS_DEFAULT_START_DATE_FILTER}`;
const [dateFilter, setDateFilter] = useState(
defaultStartFilter
? defaultStartFilter
: DateTime.fromJSDate(aMonthAgo).toFormat('MM/dd/yyyy'),
  ];
const config = { headers: { 'X-TENANT-ID': tenantId } }; // TODO

  const loadCoreProducts = async (): Promise<void> => {
try {
const coreProductsResponse = await client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products`,
'GET',
config,
      ];

      const products: any[] = coreProductsResponse.payload;

      const activeCoreProducts = products.filter(
({ recordState }) => recordState === RecordState.Active,
      ];

      setProductList(activeCoreProducts);
} catch (error) {
console.log(error);
setLoading(false);
setErrorResponse(error as any);
}
};

  const loadLoanForms = async (
filter: string,
activeOnly: boolean,
): Promise<void> => {
try {
const params = new URLSearchParams({
afterDate: new Date(filter).toISOString(),
...(activeOnly ? { formRecordState: 'Active' } : {}),
}).toString();

      const loanFormsResponse = await client2(
`${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-forms?${params}`,
'GET',
config,
      ];

      const loanForms: LoanAppForm[] = loanFormsResponse.payload;

      setAllLoanAppForms(loanForms);
} catch (error) {
console.log(error);
setLoading(false);
setErrorResponse(error as any);
}
};

  const loadTemplates = async (filter: string): Promise<void> => {
try {
const templatesResponse = await client2(
`${
process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL
}tenant-loan-form-template-assignments?afterDate=${new Date(
filter,
).toISOString()}`,
'GET',
config,
      ];

      const templates: LoanFormTemplateInfo[] = templatesResponse.payload;
const assignedTemplates: LoanFormTemplateInfo[] = templates.filter(
({ isAssigned }) => isAssigned === 'true',
      ];

      setAssignedTemplates(assignedTemplates);
} catch (error) {
console.log(error);
setLoading(false);
setErrorResponse(error as any);
}
};

  const loadFormsAndData = async (filter: string, activeOnly: boolean) => {
setLoading(true);
await Promise.all([
loadTemplates(filter),
loadLoanForms(filter, activeOnly),
    ]};
setLoading(false);
};

  const debounceLoadFormsAndData = useRef(debounce(loadFormsAndData, 200));

  const processForms = (): void => {
const productsById = Object.fromEntries(
Object.entries(productList).map(([_, value]) => [value.id, value]),
    ];
const mappedForms = [...allLoanAppForms];
for (const form of mappedForms) {
const product = productsById[form.coreProductId];
if (product) {
const relatedLoanFormTemplates = assignedTemplates.filter(
({ coreProductTemplateId, formTemplateType }) =>
coreProductTemplateId === product.templateId &&
formTemplateType === form.formTemplateType,
        };
const formTemplate = relatedLoanFormTemplates.find(
({ templateId }) => templateId === form.loanFormTemplateId,
        };
const newestFormTemplate = relatedLoanFormTemplates.sort((t1, t2) =>
new Date(t2.templateCreateDate) > new Date(t1.templateCreateDate)
            ] ;
: -1,
)[0];
const relatedLoanFormTemplateIds = relatedLoanFormTemplates.map(
({ templateId }) => templateId,
        };
const relatedForms = mappedForms.filter(({ loanFormTemplateId }) =>
relatedLoanFormTemplateIds.includes(loanFormTemplateId),
        };

        // First check if there is a newer version of a FormTemplate and there is no Form for it
if (
formTemplate &&
newestFormTemplate?.templateCreateDate !==
formTemplate?.templateCreateDate &&
!relatedForms.find(
({ loanFormTemplateId }) =>
loanFormTemplateId === newestFormTemplate.templateId,
          }
        } {
const formTemplatesWithForms = relatedLoanFormTemplates.filter((ft) =>
relatedForms.find((f) => f.loanFormTemplateId === ft.templateId),
          };
const mostRecentFormTemplateWithForm = formTemplatesWithForms.sort(
(t1, t2) =>
new Date(t2.templateCreateDate) > new Date(t1.templateCreateDate)
                ] ;
                ; `;,
)[0];
// Then check if there are Forms for newer FormTemplates. If there are no Forms based on newer FormTemplates, we will allow the upgrade for this Form.
// The idea is - we allow the upgrade only from a From based on most recent(but not the latest) version of a FormTemplate.
if (
formTemplate.templateId ===
mostRecentFormTemplateWithForm?.templateId
          } {
form.newestTemplateID = newestFormTemplate.templateId as string;
}
}
}
}
setLoanAppFormList(mappedForms);
};

  useEffect(() => {
processForms();
}, [assignedTemplates, allLoanAppForms, productList]);

  useEffect(() => {
if (!loading) {
return;
}
loadCoreProducts();
}, [loading]);

  useEffect(() => {
if (
/\d{2}\/\d{2}\/\d{4}/.test(dateFilter) &&
!isNaN(new Date(dateFilter).valueOf())
    ] {
debounceLoadFormsAndData.current(dateFilter, activeOnly);
}
}, [dateFilter, activeOnly]);

  return {
activeOnly,
dateFilter,
errorResponse,
loading,
loanAppFormList,
productList,
setActiveOnly,
setLoading,
setLoanAppFormList,
setDateFilter,
setErrorResponse,
debounceLoadFormsAndData,
};
};

export { useLoanAppFormsList };

```
<!-- CODESCAN_FILE_END -->

---

### 405.'C:\DevCode\AstroUI\src\components\LoanFormTemplatel_test__IViewLoanFormTemplate.test.jsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanFormTemplate\_test__IViewLoanFormTemplate.test.jsx" type=".jsx" size="5931" lines="215" chars="5931" -->
```javascript
import React from 'react';

import {
queryByAttribute,
fireEvent,
render,
screen,
} from '@testing-library/react';

const getById = queryByAttribute.bind(null, 'id');

import ViewLoanFormTemplate from '../ViewLoanFormTemplate';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import { BrowserRouter } from 'react-router-dom';
import * as ReactRouter from 'react-router-dom';

const templateId = 'templateId';
const coreProductTemplateId = 'coreProductTemplateId';
const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: jest.fn(),
useNavigate: () => mockPush,
Link: ({ children, to, ...props }) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];

test('Test loan app view', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ templateId, viewMode: 'view' });
const mockLoanPromise = Promise.resolve({
payload: {
templateId: templateId,
recordState: 'Active',
coreProductTemplateId: coreProductTemplateId,
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
  }};

  jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockLoanPromise,
    }};
  }};

  render(wrapWithMockContext(<ViewLoanFormTemplate />));

  const nameHeader = await screen.findByText('Loan Form Template');
expect(nameHeader);
}};

test('Test loan app edit', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ templateId, viewMode: 'edit' });

  const props = {
history: {
location: {
pathname: `/admin/loan-form-templates/${templateId}/edit`,
},
},
};

  const mockLoanPromise = Promise.resolve({
payload: {
templateId: templateId,
recordState: 'Active',
coreProductTemplateId: coreProductTemplateId,
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
      specificationJSsoN: '{}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
  }};

  jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockLoanPromise,
    }};
  }};

  render(wrapWithMockContext(<ViewLoanFormTemplate {...props} />));

  const nameHeader = await screen.findByText('Loan Form Template');
expect(nameHeader);
}};

test('Test loan form template create', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ coreProductTemplateId });

  const wrapper = render(wrapWithMockContext(<ViewLoanFormTemplate />));

  const nameHeader = await screen.findByText('Loan Form Template');
expect(nameHeader);

  const saveActiveButton = getById(wrapper.container, 'form-template-save');
fireEvent.click(saveActiveButton);
}};

test('Test loan form template discard', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ coreProductTemplateId });

  const mockTemplatesPromise = Promise.resolve({
payload: {
templateId: templateId,
recordState: 'Active',
coreProductTemplateId: coreProductTemplateId,
name: 'New Auto Loan Form',
description: 'Template for applications for New Auto loans',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
  }};

  jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockTemplatesPromise,
    }};
  }};

  const wrapper = render(wrapWithMockContext(<ViewLoanFormTemplate />));

  const nameHeader = await screen.findByText('Loan Form Template');
expect(nameHeader);

  const saveActiveButton = getById(
wrapper.container,
'form-template-discard-changes',
  ];

  fireEvent.click(saveActiveButton);
}};

test('Loan Name, Description, and Version Description inputs change as expected', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ coreProductTemplateId });

  const container = render(wrapWithMockContext(<ViewLoanFormTemplate />));

  const name = container.getByTestId('loan_form_name_input');
const description = container.getByTestId('loan_form_description_input');
const versionDescription = container.getByTestId(
'loan_form_version_description_input',
  ];

  [>>
* NOTE: Must use CustomInput.firstChild to access input element
* with data-testid attribute
   >[
fireEvent.change(name.firstChild, { target: { value: 'New Name' } });
fireEvent.change(description.firstChild, {
target: { value: 'New Loan Form' },
  }};
fireEvent.change(versionDescription.firstChild, {
target: { value: 'New Version' },
  }};

  expect(name.firstChild.value).toEqual('New Name');
expect(description.firstChild.value).toEqual('New Loan Form');
expect(versionDescription.firstChild.value).toEqual('New Version');
}};

function wrapWithMockContext(component) {
const mockContext = {
setPageTitle: () => {},
setDisplayCreateButton: (v) => {},
setCreateButtonClicked: (v) => {},
createButtonClicked: true,
};

  const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

  return (
<BrowserRouter>
<AuthContext.Provider value={mockAuthContext}>
<AppContext.Provider value={mockContext}>
<UserContext.Provider value={{ user: { x: '' } }}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
</BrowserRouter>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 4o6.‘C:\DevCode\AstroUI\src\components\LoanFormTemplate\LoanFormTemplate.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanFormTemplate\LoanFormTemplate.ts" type=".ts" size="225" lines="8" chars="225" -->
```typescript
import { LoanFormTemplateInfo } from './LoanFormTemplateInfo';

export interface LoanFormTemplate extends LoanFormTemplateInfo {
specificationJSON: string | undefined;
metadataJSON: string;
businessRulesJSON: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 4o7. ‘C:\DevCode\AstroUI\src\components\LoanFormTemplate\LoanFormTemplateInfo.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanFormTemplate\LoanFormTemplateInfo.ts" type=".ts" size="333" lines="13" chars="333" -->
```typescript
export interface LoanFormTemplateInfo {
templateId: string | number;
recordState: string;
coreProductTemplateId: string | undefined;
name: string | undefined;
description: string | undefined;
version: number;
versionDescription: string;
formTemplateType: string;
isAssigned: string;
templateCreateDate: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 4o8.‘C:\DevCode\AstroUI\src\components\LoanFormTemplatelViewLoanFormTemplate.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanFormTemplatelViewLoanFormTemplate.tsx" type=".tsx" size="13005" lines="398" chars="13005" -->
```typescript
import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';

import ViewMode from 'context/view-mode';
import { useNavigate, useParams } from 'react-router-dom';
import { client2 } from 'utils/api-client';

import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import CustomInput from 'components/CustomInput/CustomInput';
import { LoanFormTemplate } from './LoanFormTemplate';
import FullPageStatus from '../FullPageStatus/FullPageStatus';
import Button from 'components/CustomButtons/Button';

import SweetAlert from 'react-bootstrap-sweetalert';

import { makeStyles } from '@material-ui/core/styles';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import LoanTemplateFile from '../LoanTemplatesList/LoanTemplateFile';
import { gzip } from 'pako';
import { Base64 } from 'js-base64';
import { v4 as uuid } from 'uuid';

const useSweetAlertStyles = makeStyles(sweetAlertStyle);

export default function ViewLoanFormTemplate() {
const sweetAlertClasses = useSweetAlertStyles();

  const { setDisplayCreateButton, setPageTitle } = useAppContext();

  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<any | null>(null);

  const [loanFormTemplate, setLoanFormTemplate] = useState<
Partial<LoanFormTemplate>
>({ metadataJSON: '{}', businessRulesJSON: '{}' });

  const [alert, setAlert] = useState<JSX.Element | null>(null);
const [error, setError] = useState('');
const [errorResponse, setErrorResponse] = useState(null);
const push = useNavigate();
const params = useParams();
const { templateId, productTemplateId } = params;

  setDisplayCreateButton(false);

  useEffect(() => {
if (!loading) return;

    if (templateId) {
client2(
'${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}/loan-form-templates/${templateId}',
      ]
.then((data) => {
const template: LoanFormTemplate = data.payload;
setLoanFormTemplate(template);
setPageTitle(template.name);
setLoading(false);
        }]
.catch((error) => {
setErrorResponse(error);
setLoading(false);
        }];

      setViewMode(params.viewMode === 'view' ? ViewMode.View : ViewMode.Edit);

      return;
}

    const loanFormTemplate: Partial<LoanFormTemplate> = {};
loanFormTemplate.templateId = uuid();
loanFormTemplate.coreProductTemplateId = productTemplateId;
setLoanFormTemplate(loanFormTemplate);
setViewMode(ViewMode.Create);
setLoading(false);
}, [loading]);

  const submitForm = async () => {
let method = '';
let uri = null;

    if (viewMode === ViewMode.Create) {
if (!loanFormTemplate.specificationJSON) {
setError('A specification JSON file must be chosen');
return;
}

      loanFormTemplate.description = loanFormTemplate.description
? loanFormTemplate.description
: 'Loan Form';
loanFormTemplate.version = 1;
loanFormTemplate.versionDescription = loanFormTemplate.versionDescription
? loanFormTemplate.versionDescription
: 'Initial Version';

      uri = `${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-form-templates`;
method = 'POST';
} else {
uri = ‘${process.enV.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-form-templates/${loanFormTemplate.templateId}';
method = 'PUT';
}

    const gzippedTemplate = gzip(JSON.stringify(loanFormTemplate));

    const config = {
headers: {
'Content-Type': 'text/plain',
},
body: Base64.fromUint8Array(gzippedTemplate),
};

    setError('');

    client2(uri, method, config, false)
.then(() => {
push(`/admin/loan-form-templates`);
      }]
.catch((error) => {
//console.log(JSON.parse(error.message).result.errors[0].message)
setError(JSON.parse(error.message).result.errors[0].message);
      }];
};

  const handleSaveClicked = () => {
submitForm();
};

  const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const hideAlert = () => {
setAlert(null);
};

  const discardChanges = () => {
setAlert(null);
push(`/admin/loan-form-templates`);
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<div>
{alert}
<GridContainer>
<GridItem xs={12} md={12} lg={12}>
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={12}>
<CardText color="cuna1">
<h4>Loan Form Template</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<GridContainer>
                Terror &&(
<GridItem xs={12} style={{ textAlign: 'center' }}>
<div
id="error_code"
style={{
display: 'inline-block',
paddingTop: '15px',
color: 'red',
}}
>
{error}
</div>
</GridItem>
                }}
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* Loan Form Template Name
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_name"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'loan_form_name_input',
disabled: viewMode !== ViewMode.Create,
disableUnderline: false,
value: loanFormTemplate?.name,
type: 'text',
onChange: (e: any) => {
setLoanFormTemplate({
...loanFormTemplate,
name: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'loan_form_description_input',
disabled: viewMode === ViewMode.View,
disableUnderline: false,
value: loanFormTemplate?.description,
placeholder: 'Loan Form',
type: 'text',
onChange: (e: any) => {
setLoanFormTemplate({
...loanFormTemplate,
description: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>

                <GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
Version Description
</div>
</GridItem>
<GridItem xs={6}>
<CustomInput
id="loan_form_version_description"
formControlProps={{
style: {
display: 'inline-block',
width: '75%',
paddingTop: 0,
},
}}
inputProps={
{
'data-testid': 'loan_form_version_description_input',
disabled: viewMode === ViewMode.View,
disableUnderline: false,
value: loanFormTemplate?.versionDescription,
placeholder: 'Initial version',
type: 'text',
onChange: (e: any) => {
setLoanFormTemplate({
...loanFormTemplate,
versionDescription: e.target.value,
                          }];
},
} as any
}
                  [>
</GridItem>
{viewMode === ViewMode.Create && (
<LoanTemplateFile
setSpecificationJson={(specJson: string) => {
setLoanFormTemplate({
...loanFormTemplate,
specificationJSON: specJson,
                      }};
}}
showError={setError}
                  [>
                }}
</GridContainer>
</CardBody>
</Card>
{loanFormTemplate && viewMode !== ViewMode.Create && (
<Card>
<CardHeader color="cuna1" text>
<GridContainer>
<GridItem xs={12} sm={12}>
<CardText color="cuna1">
<h4>Template Specification JSON</h4>
</CardText>
</GridItem>
</GridContainer>
</CardHeader>
<CardBody>
<textarea
id="json_spec"
readOnly
style={{
width: '100%',
resize: 'none',
border: 'none',
height: '500px',
}}
value={JSON.stringify(
JSON.parse(
loanFormTemplate.specificationJSON
? loanFormTemplate.specificationJSON
                         ; ` `,
                    ],
undefined,
                    4.
                  ]}
></textarea>
</CardBody>
</Card>
          }}
</GridItem>
</GridContainer>
{viewMode !== ViewMode.View && (
<GridContainer
style={{
textAlign: 'right',
}}
>
<GridItem xs={12} sm={12} md={12}>
<Button
id="form-template-discard-changes"
color="danger"
simple
onClick={() => {
discardChangesWarning();
}}
>
Discard Changes
</Button>
<Button
id="form-template-save"
color="success"
onClick={handleSaveClicked}
disabled={!loanFormTemplate}
>
Save
</Button>
</GridItem>
</GridContainer>
      ]}
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 409.'C:\DevCode\AstroUI\src\components\LoanTemplatesList\_test__\LoanTemplatesList.test.tsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\__test__\LoanTemplatesList.test.tsx" type=".tsx" size="7895" lines="265" chars="7895" -->
```typescript
import React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import LoanTemplatesList from '../LoanTemplatesList';
import { v4 as uuid } from 'uuid';
import * as api from 'utils/api-client';
import * as appContext from 'context/app-context';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import { MemoryRouter } from 'react-router-dom';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: () => ({}),
Link: ({ children, to, ...props }: any) => (
<a href={to} {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];
describe('LoanTemplatesList', () => {
afterEach(() => {
jest.clearAllMocks();
  }};

  const client2Spy = jest.spyOn(api, 'client2');
const consoleSpy = jest.spyOn(console, 'log');

  const apiResponseError = JSON.stringify({
message: 'error message',
statusCode: '500',
  }};

  const useAppContextMock: any = {
tenant: {
id: 'tenantId',
legalName: 'Test Tenant',
tenantSchema: 'T25252525',
creationPending: false,
},
setTenant: jest.fn(),
pageTitle: 'Page Title',
setCreateButtonClicked: jest.fn(),
withinTenantContext: jest.fn(),
setPageTitle: jest.fn(),
displayCreateButton: true,
createButtonClicked: true,
setDisplayCreateButton: jest.fn(),
};

  const mockLoanTemplatesPromise = (
templateId: string,
coreProductTemplateId: string,
templateIdTwo?: string,
): Record<string, unknown> => ({
payload: [
{
templateId,
recordState: 'Active',
coreProductTemplateId: coreProductTemplateId,
name: 'Some Name',
description: 'Some Description',
version: 1,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
{
templateId: templateIdTwo || uuid(),
recordState: 'Draft',
coreProductTemplateId: coreProductTemplateId,
name: 'Some Name 2',
description: 'Some Description',
version: 2,
versionDescription: 'Initial Version',
specificationJSON: '{}',
metadataJSON: '{}',
businessRulesJSON: '{}',
},
],
  }};

  const coreProductsTemplatesMock = (
coreProductTemplateId: string,
): { payload: Record<string, unknown>[] } => ({
payload: [
{
id: coreProductTemplateId,
recordState: 'Active',
name: 'AutomatedTestTemplate-5672b55520',
description: 'Template for new auto loans',
version: 1,
versionDescription: '',
},
],
  }};

  test('Test population of loan form list', async () => {
const templateId = uuid();
const coreProductTemplateId = uuid();
const templateIdTwo = uuid();
const loanTemplatesMock = mockLoanTemplatesPromise(
templateId,
coreProductTemplateId,
templateIdTwo,
    ];
const coreProductTemplatesMockData = coreProductsTemplatesMock(
coreProductTemplateId,
    ];

    client2Spy
.mockResolvedValueOnce(loanTemplatesMock)
.mockResolvedValueOnce(coreProductTemplatesMockData);

    renderWithMockContext(<LoanTemplatesList />);

    await waitFor(() => {
const pleaseWaitText = screen.getByText('Please Wait...');
expect(pleaseWaitText).toBeInTheDocument();
    }};

    const nameHeader = screen.getByTitle('Name');
expect(nameHeader).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
expect(rows.length).toBe(3);

    const productRow1 = rows[1].childNodes;
const productRow2 = rows[2].childNodes;

    expect(productRow1.item(0)).toHaveTextContent(templateId);
expect(productRow1.item(1)).toHaveTextContent('Some Name');
expect(productRow1.item(4)).toHaveTextContent('1');
expect(productRow1.item(5)).toHaveTextContent('Active');

    expect(productRow2.item(0)).toHaveTextContent(templateIdTwo);
expect(productRow2.item(1)).toHaveTextContent('Some Name 2');
expect(productRow2.item(4)).toHaveTextContent('2');
expect(productRow2.item(5)).toHaveTextContent('Draft');

    const rowToView = rows[1];
expect(rowToView).toBeInTheDocument();

    const viewButton = screen.getAllByRole('link', { name: 'View Template' });
expect(viewButton[0]).toBeInTheDocument();

    fireEvent.click(viewButton[0]);
expect(mockPush).toHaveBeenCalledWith(
`/admin/loan-form-templates/${templateId}/view`,
    ];

    const editButton = screen.getAllByRole('link', { name: 'Edit Template' });
expect(editButton[0]).toBeInTheDocument();

    fireEvent.click(editButton[0]);
expect(mockPush).toHaveBeenCalledWith(
`/admin/loan-form-templates/${templateId}/edit`,
    ];

    const productRowViewLink = screen.getByRole('link', {
name: 'Some Name',
    }};
expect(productRowViewLink).toHaveAttribute(
'href',
`/admin/loan-form-templates/${templateId}/view`,
    ];
  }};

  test.skip('Test create new loan form button', async () => {
const templateId = uuid();
const coreProductTemplateId = uuid();
const loanTemplatesMock = mockLoanTemplatesPromise(
templateId,
coreProductTemplateId,
    ];

    const coreProductTemplatesMockData = coreProductsTemplatesMock(
coreProductTemplateId,
    ];

    jest.spyOn(appContext, 'useAppContext').mockReturnValue(useAppContextMock);

    client2Spy
.mockResolvedValueOnce(loanTemplatesMock)
.mockResolvedValueOnce(coreProductTemplatesMockData);

    renderWithMockContext(
<MemoryRouter initialEntries={['/admin/loan-form-templates']}>
<LoanTemplatesList />
</MemoryRouter>,
    ];

    // Wait for the API calls to finish and the set state calls to complete.
await waitFor(() => expect(client2Spy).toHaveBeenCalledTimes(2));

    const templateSelector = screen.getByRole('button', {
name: 'templateSelect',
    }};
fireEvent.click(templateSelector);

    const options = screen.getAllByRole('option');

    const targetTemplateOption = options[1];

    fireEvent.click(targetTemplateOption);

    const createBtn = screen.getByRole('button', { name: 'Create' });

    fireEvent.click(createBtn);

    expect(mockPush).toHaveBeenCalledWith(
`/admin/loan-form-templates/${coreProductTemplateId}/create`,
    ];
  }};

  test('Error fetching product listing', async () => {
jest.spyOn(appContext, 'useAppContext').mockReturnValue({
...useAppContextMock,
displayCreateButton: false,
createButtonClicked: false,
    }};

    client2Spy.mockRejectedValue(apiResponseError);

    renderWithMockContext(<LoanTemplatesList />);

    await waitFor(() => expect(client2Spy).toHaveBeenCalledTimes(1));

    const errorNotification = screen.getByRole('full-page-status-error');
expect(errorNotification).toBeInTheDocument();
expect(consoleSpy).toHaveBeenCalledWith(apiResponseError);
  }};

  test('Error fetching product templates', async () => {
const templateId = uuid();
const coreProductTemplateId = uuid();
const loanTemplatesMock = mockLoanTemplatesPromise(
templateId,
coreProductTemplateId,
    ];

    jest.spyOn(appContext, 'useAppContext').mockReturnValue({
...useAppContextMock,
displayCreateButton: false,
createButtonClicked: false,
    }};

    client2Spy
.mockResolvedValue(loanTemplatesMock)
.mockResolvedValue({ payload: undefined });

    renderWithMockContext(<LoanTemplatesList />);

    await waitFor(() => expect(client2Spy).toHaveBeenCalledTimes(1));

    expect(consoleSpy).toHaveBeenCalledWith(
new Error('No template available from core products templates'),
    ];
const errorNotification = screen.getByRole('full-page-status-error');
expect(errorNotification).toBeInTheDocument();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 410. `C:\DevCode\AstroUI\src\components\LoanTemplatesList\ImportFormModal.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\ImportFormModal.tsx" type=".tsx" size="1388" lines="55" chars="1388" -->
```typescript
import React from 'react';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate, generatePath } from 'react-router-dom';
import { useDynamicModal } from 'components/DynamicModal';
import { ProductTemplateInfo } from './ProductTemplateInfo';

const useImportFormModal = (
showModal: boolean,
productTemplates: ProductTemplateInfo[] = [],
) => {
const group: any = {
groupCode: 'ImportForm',
groupTitle: '',
hidden: false,
required: true,
dataFields: [
{
fieldCode: 'productTemplateId',
fieldType: 'single-select',
fieldLabel: 'Select Product Template',
options: [
...productTemplates.map(({ id, name, version }) => ({
label: `${name}, v${version}`,
value: id,
          }]},
],
},
],
};

  const canContinue = (data: any) => {
return !!data?.productTemplateId;
};
const navigate = useNavigate();
const onContinueBtnClick = (state: any) => {
navigate(
generatePath(Paths.LoanFormTemplatesCreate, {
productTemplateId: state?.data?.productTemplateId,
      }],
    ];
};
useDynamicModal({
title: 'Create Template',
height: '400px',
showModal,
fieldGroups: [group],
canContinue,
continueBtnText: 'Create Template',
onContinueBtnClick,
fullPageModal: true,
  }};
};

export { useImportFormModal };

```
<!-- CODESCAN_FILE_END -->

---

### 411. `C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplateDataGrid.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplateDataGrid.tsx" type=".tsx" size="5255" lines="164" chars="5255" -->
```typescript
import React, { ReactElement } from 'react';

import { Icon, ICON_TYPES, IRow, Table } from 'commonui';
import {
SCActionButtonLink,
SCActions,
SCHeader,
} from 'components/TableStyles';
import Primary from 'components/Typography/Primary';
import Success from 'components/Typography/Success';
import { LoanFormTemplateInfo } from '../LoanFormTemplate/LoanFormTemplateInfo';
import { ProductTemplateInfo } from './ProductTemplateInfo';
import { generatePath, Link } from 'react-router-dom';
import { Paths } from 'layouts/RouterSwitch';

export interface ILoanTemplateDataGridProps {
loanFormTemplates: LoanFormTemplateInfo[];
productTemplates: ProductTemplateInfo[];
}

export default function LoanTemplateDataGrid({
loanFormTemplates,
productTemplates,
}: ILoanTemplateDataGridProps): ReactElement {
const formatdata = (formTemplates: LoanFormTemplateInfo[]): IRow[] =>
formTemplates.map(
      [{
templateId,
name,
coreProductTemplateId,
version,
recordState,
}: LoanFormTemplateInfo) => {
const viewLink = generatePath(Paths.LoanFormTemplatesManage, {
templateId: `${templateId}`,
viewMode: 'view',
        }];
const editLink = generatePath(Paths.LoanFormTemplatesManage, {
templateId: `${templateId}`,
viewMode: 'edit',
        }];
const productTemplateName = productTemplates.find(
(pt: ProductTemplateInfo) => pt.id === coreProductTemplateId,
)?.name;
return {
id: templateId,
templateId, // Since id isn't available as an accessor, we add a templateId property here
name: <Link to={viewLink}>{name}</Link>,
searchableName: name, // The above name makes the serialize function un-searchable because of the component
productTemplateId: coreProductTemplateId,
productTemplateName,
version,
isActive: recordState && recordState === 'Active',
status:
recordState === 'Active' ? (
<Success>
<b>{recordState}</b>
</Success>
            } ; {
<Primary>
<b>{recordState}</b>
</Primary>
            },
actions: (
// we've added some custom button actions
<SCActions
className="actions-left"
hidden={false}
id={`${templateId}`}
>
{/* use this button to add a like kind of action */}
<SCActionButtonLink
to={viewLink}
id={`${templateId}_view`}
title="View Template"
color="blue"
className="like"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
<SCActionButtonLink
id={`${templateId}_edit`}
title="Edit Template"
to={editLink}
color="green"
className="edit"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
</SCActions>
          },
};
},
    ];

  const staticColumn = {
filterable: false,
sortable: false,
};

  return (
<div role="loanFormTemplateListGrid">
{loanFormTemplates && loanFormTemplates.length > 0 && (
<Table
data={formatdata(loanFormTemplates)}
defaultSort={{ column: 'name', direction: 'asc' }}
filterable
sortable
columns={[
{
Header: <SCHeader>Template Id</SCHeader>,
accessor: 'templateId',
serialize: ({ templateId }) => templateId,
},
{
Header: (
<SCHeader id="Name" title="Name">
Name
</SCHeader>
              },
accessor: 'name',
serialize: ({ searchableName }) => searchableName,
},
{
Header: <SCHeader>Product Template Name</SCHeader>,
accessor: 'productTemplateName',
serialize: ({ productTemplateName }) => productTemplateName,
},
{
Header: <SCHeader>Product Template ID</SCHeader>,
accessor: 'productTemplateId',
serialize: ({ coreProductTemplateId }) => coreProductTemplateId,
},
{
...staticColumn,
Header: <SCHeader>Version</SCHeader>,
accessor: 'version',
maxWidth: '100px',
},
{
...staticColumn,
Header: <SCHeader>Status</SCHeader>,
accessor: 'status',
maxWidth: '100px',
},
{
...staticColumn,
Header: '',
accessor: 'actions',
maxWidth: '120px',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
getTrGroupProps={() => ({
style: { height: '65px' },
          }]}
        [>
      ]}
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 412. `C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplateFile.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplateFile.tsx" type=".tsx" size="1816" lines="76" chars="1816" -->
```typescript
import React from 'react';
import GridItem from '../Grid/GridItem';

const handleFileChangeEvent = async (
event: any,
setSpecificationJson: any,
showError: any,
) => {
const file: File = event.target.files[0];

  if (!file) {
return;
}

  const specificationJson: string = await file.text();

  const validationErrors: string[] =
validateSpecificationJson(specificationJson);
if (validationErrors && validationErrors.length > 0) {
showError(JSON.stringify(validationErrors));
return;
}

  setSpecificationJson(specificationJson);
};

export default function LoanTemplateFile(props: any) {
const { setSpecificationJson, showError } = props;

  return (
<React.Fragment>
<GridItem xs={6} style={{ textAlign: 'right' }}>
<div
style={{
display: 'inline-block',
paddingTop: '15px',
fontWeight: 'bold',
}}
>
* JSON File
</div>
</GridItem>
<GridItem xs={12} sm={6}>
<input
id={`loan-template-file-input`}
style={{
marginBottom: '16px',
marginTop: '15px',
}}
type="file"
onChange={async (event) => {
console.log(
`event ${event.target.files ? event.target.files[0] : ''}`,
            };
await handleFileChangeEvent(event, setSpecificationJson, showError);
}}
        [>
</GridItem>
</React.Fragment>
  ];
}

const validateSpecificationJson = (specificationJson: string): string[] => {
if (!specificationJson) {
return ['Specification JSON file has no contents'];
}

  try {
JSON.parse(specificationJson);
} catch (error) {
return ['Specification JSON file contents is not properly formatted JSON'];
}

  return [];
};

```
<!-- CODESCAN_FILE_END -->

---

### 413. `C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplatesList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\LoanTemplatesList.tsx" type=".tsx" size="2941" lines="99" chars="2941" -->
```typescript
import React, { useEffect, useState } from 'react';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { useAppContext } from 'context/app-context';
import { client2 } from 'utils/api-client';
import { LoanFormTemplateInfo } from '../LoanFormTemplate/LoanFormTemplateInfo';
import LoanTemplateDataGrid from 'components/LoanTemplatesList/LoanTemplateDataGrid';
import { ProductTemplateInfo } from './ProductTemplateInfo';
import { useImportFormModal } from './ImportFormModal';

export default function LoanTemplatesList(props: any) {
const [loanFormTemplates, setLoanTemplateList] = useState<
LoanFormTemplateInfo[]
  >{[]];

  const [productTemplates, setProductTemplatesList] = useState<
ProductTemplateInfo[]
  >{[]];
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);

  const {
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
} = useAppContext();

  useEffect(() => {
setPageTitle('Loan Form Templates');
  },[};

  useEffect(() => {
if (!createButtonClicked) return;
setCreateButtonClicked(false);
}, [createButtonClicked]);

  useEffect(() => {
if (!loading) return;

    client2(
`${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}loan-form-templates`,
    ]
.then((data) => {
const loanFormTemplates: LoanFormTemplateInfo[] = data.payload;

        setLoanTemplateList(loanFormTemplates);

        client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-product-templates`,
        }
.then((data) => {
const productTemplates: ProductTemplateInfo[] = data.payload;
if (!productTemplates)
throw new Error(
'No template available from core products templates',
              };
const activeProductTemplates =
productTemplates &&
productTemplates.filter(
(productTemplate: ProductTemplateInfo) =>
productTemplate.recordState === 'Active',
              };
setProductTemplatesList(activeProductTemplates);

            setLoading(false);
setDisplayCreateButton(true);
          }]
.catch((error) => {
console.log(error);
setLoading(false);
setErrorResponse(error);
          }];
      }]
.catch((error) => {
console.log(error);
setLoading(false);
setErrorResponse(error);
      }];
}, [loading]);

  useImportFormModal(createButtonClicked, productTemplates);

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  if (!loanFormTemplates) return <div />;

  return (
<div>
<LoanTemplateDataGrid
loanFormTemplates={loanFormTemplates}
productTemplates={productTemplates}
{...props}
      [>
</div>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 414. `C:\DevCode\AstroUI\src\components\LoanTemplatesList\ProductTemplateInfo.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LoanTemplatesList\ProductTemplateInfo.ts" type=".ts" size="234" lines="9" chars="234" -->
```typescript
export class ProductTemplateInfo {
id: string | undefined;
recordState: string | undefined;
name: string | undefined;
description: string | undefined;
version: number | undefined;
versionDescription: string | undefined;
}

```
<!-- CODESCAN_FILE_END -->

---

### 415.'C:\DevCode\AstroUI\src\components\LosStatusMappings\_test__\AllegroStatusMappingList.test.jsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\__test__\AllegroStatusMappingList.test.jsx" type=".jsx" size="1371" lines="48" chars="1371" -->
```javascript
import React from 'react';
import { screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import LosStatusMappingList from '../LosStatusMappingList';
import { MemoryRouter } from 'react-router';

describe('AllegroStatusMappingList', () => {
const tenantId = uuid();
const mockTenant = { id: tenantId };

  jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useHistory: () => ({
location: {
pathname:
'/admin/tenant/3aecf597-8d77-4f71-8a55-ef26073813bc/los-status-mappings',
},
push: jest.fn(),
    }},
  }}];

  const defaultProps = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/los-status-mappings`,
},
},
match: { params: { tenantId } },
};

  test('Should display two hardcoded LOS and their Edit button', async () => {
const props = {
...defaultProps,
};

    renderWithMockTenant(mockTenant, <LosStatusMappingList {...props} />);

    const meridianLinklLabel = await screen.findByText('MeridianLink Consumer');
expect(meridianLinklLabel);
const allegroLabel = await screen.findByText('Allegro');
expect(allegroLabel);
const temenosLabel = await screen.findByText('Temenos');
expect(temenosLabel);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 416。'C:\DevCode\AstroUI\srclcomponents\LosStatusMappings\__test__\AllegrostatusMappings.test.jsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\__test__\AllegrostatusMappings.test.jsx" type=".jsx" size="2157" lines="81" chars="2157" -->
```javascript
import React from 'react';
import { queryByAttribute, fireEvent, screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import LosStatusMappings from '../LosStatusMappings';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import { LosIdEnum } from 'types';

const getLosStatusMappings = () =>
JSON.parse(
JSON.stringify(
require('components/__mock__/fakeAllegroStatusMappings.json'),
    ],
  ];

describe('AllegroStatusMappings', () => {
const tenantId = uuid();
const mockTenant = { id: tenantId };
const fetchSpy = jest.spyOn(window, 'fetch');
const mockPush = jest.fn();
const defaultProps = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/los-status-mappings/Allegro`,
},
push: mockPush,
},
match: { params: { tenantId } },
};

  afterEach(() => {
fetchSpy.mockClear();
mockPush.mockClear();
  }};

  test('Should display and cancel discard message', async () => {
const props = {
losId: LosIdEnum.ALLEGRO,
...defaultProps,
};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({ payload: getLosStatusMappings() }),
    }};

    renderWithMockTenant(mockTenant, <LosStatusMappings {...props} />);

    const discardButton = await screen.findByText('Discard Changes');
fireEvent.click(discardButton);
const confirmButton = await screen.findByText('Yes, Discard!');
fireEvent.click(confirmButton);
  }};

  test('Fetch returns error', async () => {
fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
    }};

    const props = {
...defaultProps,
};

    const dom = renderWithMockTenant(
mockTenant,
<LosStatusMappings {...props} />,
    ];

    await screen.findByRole('full-page-status-error');

    const getByArialabel = queryByAttribute.bind(null, 'aria-label');
const closeButton = getByArialabel(dom.container, 'Close');
expect(closeButton);
fireEvent.click(closeButton);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 417.'C:\DevCode\AstroUI\srclcomponents\LosStatusMappings\__test__\LosStatusMappings.test.jsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\__test__\LosStatusMappings.test.jsx" type=".jsx" size="5151" lines="186" chars="5151" -->
```javascript
import React from 'react';
import { queryByAttribute, fireEvent, screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import LosStatusMappings from '../LosStatusMappings';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import { LosIdEnum } from 'types';

const getById = queryByAttribute.bind(null, 'id');

const getLosStatusMappings = () =>
JSON.parse(
JSON.stringify(require('components/__mock__/fakeLosStatusMappings.json')),
  ];
const getDlxStatusUpdates = () =>
JSON.parse(
JSON.stringify(require('components/__mock__/fakeDlxStatusUpdates.json')),
  ];

describe('LosStatusMappings', () => {
const tenantId = uuid();
const mockTenant = { id: tenantId };
const fetchSpy = jest.spyOn(window, 'fetch');
const mockPush = jest.fn();
const defaultProps = {
losId: LosIdEnum.MERIDIANLINK,
history: {
location: {
pathname: `/admin/tenant/${tenantId}/los-status-mappings`,
},
push: mockPush,
},
match: { params: { tenantId } },
};

  afterEach(() => {
fetchSpy.mockClear();
mockPush.mockClear();
  }};

  test.skip('Update one status mapping, add another', async () => {
const props = {
...defaultProps,
};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({ payload: getLosStatusMappings() }),
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({ payload: getDlxStatusUpdates() }),
    }};

    const dom = renderWithMockTenant(
mockTenant,
<LosStatusMappings {...props} />,
    ];

    await screen.findByText('LOS Status List');

    // change Approved status
const approvedStatusDropdown = getById(
dom.container,
'select-Application-Approved',
    ];
fireEvent.click(approvedStatusDropdown);
const expiredOption = screen
.getAllByRole('option')
.find((l) => l.textContent === 'Expired');
fireEvent.click(expiredOption);

    // add mapping for Declined status
const declinedStatusDropdown = getById(
dom.container,
'select-Application-Declined',
    ];
fireEvent.click(declinedStatusDropdown);
const declinedOption = screen
.getAllByRole('option')
.find((l) => l.textContent === 'Declined');
fireEvent.click(declinedOption);

    // mock the mappings upload
fetchSpy.mockImplementationOnce((endpoint, config) => {
const expectation = {
applicationStatuses: [
{ los: 'Approved', dlx: 'Expired' },
{ los: 'Approved-Pending', dlx: 'Approved-Pending' },
{ los: 'Instant Approved', dlx: 'Approved' },
{ los: 'Cancelled', dlx: 'Not Active' },
{ los: 'Duplicate', dlx: 'Under Review' },
{ los: 'Fraud', dlx: 'Under Review' },
{ los: 'Pending', dlx: 'Under Review' },
{ los: 'Counter-Offer', dlx: 'Under Review' },
{ los: 'Declined', dlx: 'Declined' },
],
fundingStatuses: [{ los: 'Funded', dlx: 'Funded' }],
};

      expect(config.body).toBe(JSON.stringify(expectation));

      return Promise.resolve({
ok: true,
json: () => Promise.resolve(),
      }];
    }};

    // mock the status updates upload
fetchSpy.mockImplementationOnce((endpoint, config) => {
const expectation = {
statusUpdates: [
{
status: 'Approved',
update: true,
},
{
status: 'Funded',
update: false,
},
],
};

      expect(config.body).toBe(JSON.stringify(expectation));

      return Promise.resolve({
ok: true,
json: () => Promise.resolve(),
      }];
    }};

    const saveButton = await screen.findByText('Save');
fireEvent.click(saveButton);
}, 20000);

  test('Should display and cancel discard message', async () => {
const props = {
...defaultProps,
};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({ payload: getLosStatusMappings() }),
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve({ payload: getDlxStatusUpdates() }),
    }};

    renderWithMockTenant(mockTenant, <LosStatusMappings {...props} />);

    const discardButton = await screen.findByText('Discard Changes');
fireEvent.click(discardButton);
const confirmButton = await screen.findByText('Yes, Discard!');
fireEvent.click(confirmButton);
  }};

  test('Fetch returns error', async () => {
fetchSpy.mockResolvedValueOnce({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
    }};

    const props = {
...defaultProps,
};

    const dom = renderWithMockTenant(
mockTenant,
<LosStatusMappings {...props} />,
    ];

    await screen.findByRole('full-page-status-error');

    const getByArialabel = queryByAttribute.bind(null, 'aria-label');
const closeButton = getByArialabel(dom.container, 'Close');
expect(closeButton);
fireEvent.click(closeButton);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 418.'C:\DevCode\AstroUI\src\components\LosStatusMappings\_test__ITemenosStatusMappingList.test.jsx'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\__test__ITemenosStatusMappingList.test.jsx" type=".jsx" size="1171" lines="44" chars="1171" -->
```javascript
import React from 'react';
import { screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import LosStatusMappingList from '../LosStatusMappingList';
import { MemoryRouter } from 'react-router';

describe('TemenosStatusMappingList', () => {
const tenantId = uuid();
const mockTenant = { id: tenantId };

  jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useHistory: () => ({
location: {
pathname:
'/admin/tenant/3aecf597-8d77-4f71-8a55-ef26073813bc/los-status-mappings',
},
push: jest.fn(),
    }},
  }}];

  const defaultProps = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/los-status-mappings`,
},
},
match: { params: { tenantId } },
};

  test('Should display two hardcoded LOS and their Edit button', async () => {
const props = {
...defaultProps,
};

    renderWithMockTenant(mockTenant, <LosStatusMappingList {...props} />);

    const temenosLabel = await screen.findByText('Temenos');
expect(temenosLabel);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 419.

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\__test__ITemenosStatusMappings.test.jsx" type=".jsx" size="1171" lines="44" chars="1171" -->
```javascript
import React from 'react';
import { screen } from '@testing-library/react';

import { v4 as uuid } from 'uuid';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import LosStatusMappingList from '../LosStatusMappingList';
import { MemoryRouter } from 'react-router';

describe('TemenosStatusMappingList', () => {
const tenantId = uuid();
const mockTenant = { id: tenantId };

  jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useHistory: () => ({
location: {
pathname:
'/admin/tenant/3aecf597-8d77-4f71-8a55-ef26073813bc/los-status-mappings',
},
push: jest.fn(),
    }},
  }}];

  const defaultProps = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/los-status-mappings`,
},
},
match: { params: { tenantId } },
};

  test('Should display two hardcoded LOS and their Edit button', async () => {
const props = {
...defaultProps,
};

    renderWithMockTenant(mockTenant, <LosStatusMappingList {...props} />);

    const temenosLabel = await screen.findByText('Temenos');
expect(temenosLabel);
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 420. `C:\DevCode\AstroUI\src\components\LosStatusMappings\constants.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\constants.ts" type=".ts" size="4377" lines="198" chars="4377" -->
```typescript
import { LosIdEnum } from 'types';
import { LosConstantStatuses } from './LosStatusMappingsTypes';

export const notMappedStatus = 'Not Mapped';

const dlxStatuses = [
notMappedStatus,
'Approved',
'Approved-Pending',
'Under Review',
'Not Active',
'Declined',
'Funded',
'Expired',
];

const integrationsWithStatusFilter = [LosIdEnum.TEMENOS, LosIdEnum.SYNC1];

export const statuses: Record<LosIdEnum, LosConstantStatuses> = {
[LosIdEnum.MERIDIANLINK]: {
losApplicationStatuses: [
'Instant Approved',
'Approved',
'Approved-Pending',
'Approved Pending 2nd Sig',
'Approved/Member Declined',
'Pre-Approved',
'Fraud',
'Counter-Offer',
'Need More Info',
'Referred',
'Pending',
'Review',
'Duplicate',
'Incomplete',
'Member Declined Credit',
'Closed for Incompleteness',
'Co-App Declined',
'Instant Declined',
'Inquiring',
'Member Waiting',
'Membership Denied',
'Withdrawn',
'Declined',
'Cancelled',
],
losFundingStatuses: [
'Funded',
'Processing',
'Ready for Docs',
'Ready for Funding',
'Unable to Fund',
],
dlxUpdateStatuses: [
'Approved',
'Approved-Pending',
'Under Review',
'Not Active',
'Declined',
'Funded',
'Expired',
],
},
[LosIdEnum.TEMENOS]: {
losApplicationStatuses: [
'None',
'LO Approved',
'LO Rejected',
'Auto Approved',
'Auto Rejected',
'Invalid',
'Reject',
'Approve',
'Decline',
],
losFundingStatuses: [
'Suspended',
'In Progress',
'Submitted',
'Pending Review',
'Hold',
'Incomplete',
'Withdrawn',
'Decisioned',
'Disbursed',
'Pre Approved',
'Not Eligible',
'Hold for 3rd Party',
'Hold for Applicant',
'Hold for Financial Institution',
'Auto Withdrawn',
'Disbursement Error',
'Countered',
'Counteroffer Accepted',
'Sent For Signatures',
'Signatures Received',
'Disbursement Pending',
'Partially Disbursed',
],
dlxUpdateStatuses: [
'Approved',
'Approved-Pending',
'Under Review',
'Not Active',
'Declined',
'Funded',
'Expired',
],
},
[LosIdEnum.SYNC1]: {
losApplicationStatuses: [
'None',
'Approve',
'Decline',
'CounterOffer',
'Pending',
'Cancel',
],
losFundingStatuses: ['Accepted', 'Held', 'Rejected', 'Funded'],
dlxUpdateStatuses: [
'Approved',
'Approved-Pending',
'Under Review',
'Not Active',
'Declined',
'Funded',
'Expired',
],
},
[LosIdEnum.ALLEGRO]: {
losApplicationStatuses: [
'Auto Approved As Submitted',
'Approved As Submitted',
'Approved With Conditions',
'Counter Offer',
'Counter Offer - Out The Door',
'Need More Info',
'Auto Declined',
'Declined',
'Declined Reconsider with Qual Co-X',
'Withdrawn',
'Referred',
],
losFundingStatuses: [
'Funded',
'Dealer Action',
'Review By Lender',
'Reject',
],
dlxUpdateStatuses: [
'Approved',
'Approved-Pending',
'Under Review',
'Not Active',
'Declined',
'Funded',
'Expired',
],
},
};

export const mapLosApplicationStatus = (
losId: LosIdEnum,
mapFunc: (losStatus: string, idx: number) => JSX.Element,
) => {
return statuses[losId].losApplicationStatuses.sort().map(mapFunc);
};
export const mapLosFundingStatuses = (
losId: LosIdEnum,
mapFunc: (losStatus: string, idx: number) => JSX.Element,
) => {
return statuses[losId].losFundingStatuses.sort().map(mapFunc);
};
export const mapDlxUpdateStatuses = (
losId: LosIdEnum,
mapFunc: (losStatus: string, idx: number) => JSX.Element,
) => {
return statuses[losId].dlxUpdateStatuses.sort().map(mapFunc);
};

export const mapDlxStatuses = (
losId: LosIdEnum,
mapFunc: (status: string) => JSX.Element,
) => {
return dlxStatuses
.flatMap((status) => {
if (
integrationsWithStatusFilter.includes(losId) &&
['Not Active', 'Expired'].includes(status)
      ] {
return [];
}
return status;
    }}
.sort()
.map(mapFunc);
};

```
<!-- CODESCAN_FILE_END -->

---

### 421. `C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappingList.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappingList.tsx" type=".tsx" size="2887" lines="104" chars="2887" -->
```typescript
import React, { ReactElement } from 'react';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import { useAppContext } from 'context/app-context';
import { SCActions, SCHeader, SCActionButtonLink } from '../TableStyles';
import { Table, Icon, ICON_TYPES } from 'commonui';
import { generatePath } from 'react-router';
import { Paths } from '../../layouts/RouterSwitch/paths';

interface FormattedData extends Record<string, any> {
id: string;
}

export default function LosStatusMappingList(): ReactElement {
const { tenant } = useAppContext();

  const tableData = [
{
id: 'Allegro',
name: 'Allegro',
path: generatePath(Paths.AllegroStatusMappings, {
tenantId: tenant ? tenant.id : '',
      }],
},
{
id: 'MeridianLink',
name: 'MeridianLink Consumer',
path: generatePath(Paths.MeridianLinkStatusMappings, {
tenantId: tenant ? tenant.id : '',
      }],
},
{
id: 'Temenos',
name: 'Temenos',
path: generatePath(Paths.TemenosStatusMappings, {
tenantId: tenant ? tenant.id : '',
      }],
},
{
id: 'Sync1',
name: 'Sync1',
path: generatePath(Paths.Sync1StatusMappings, {
tenantId: tenant ? tenant.id : '',
      }],
},
];

  const formatdata = (losList: any[]): FormattedData[] =>
losList.map(({ id, name, path }) => ({
id,
name,
path,
actions: (
<SCActions id={id}>
<SCActionButtonLink
title="Edit Status Mappings"
id={`${id}_edit`}
aria-label="edit"
color="green"
to={path}
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
</SCActions>
      ],
    }}];

  return (
    >>
<GridContainer>
<GridItem xs={12} xl={4}>
<Card>
<CardBody>
<GridContainer>
<GridItem xs={12}>
<GridContainer>
<Table
data={formatdata(tableData)}
showPaginationBottom={false}
columns={[
{
Header: <SCHeader>Loan Origination System</SCHeader>,
accessor: 'name',
},
{
Header: 'Edit',
accessor: 'actions',
maxWidth: '120px',
},
]}
                    [>
</GridContainer>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</>
  ];
}

```
<!-- CODESCAN_FILE_END -->

---

### 422. `C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappings.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappings.tsx" type=".tsx" size="19152" lines="619" chars="19152" -->
```typescript
import {
Checkbox,
FormControl,
FormControlLabel,
MenuItem,
Select,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import customSelectStyle from 'assets/jss/material-dashboard-pro-react/customSelectStyle';
import regularFormsStyle from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import Button from 'components/CustomButtons/Button';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import { useAppContext } from 'context/app-context';
import React, { useEffect, useState } from 'react';
import SweetAlert from 'react-bootstrap-sweetalert';
import { client2 } from 'utils/api-client';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import { StaticNotification } from 'commonui';
import { useNavigate } from 'react-router-dom';
import {
ILosStatusMappingsRequest,
IStatusUpdate,
LosStatus,
StatusTypeEnum,
} from './LosStatusMappingsTypes';
import { ClassNameMap } from '@material-ui/styles';
import { LosIdEnum } from 'types';
import {
mapDlxStatuses,
mapDlxUpdateStatuses,
mapLosApplicationStatus,
mapLosFundingStatuses,
notMappedStatus,
} from './constants';

const useStyles = makeStyles({
...regularFormsStyle,
...customSelectStyle,
select: {
...customSelectStyle.select,
padding: '0px 0 0px',
},
}};
const useStyles2 = makeStyles(sweetAlertStyle);

export interface IStatusMappingsProps {
losId: LosIdEnum;
}

export interface IStatusMappingDropdownProps {
statusType: string;
dlxStatus: string;
losStatus: string;
classes: ClassNameMap<string>;
setLosStatus: (updatedDlxStatus: string) => void;
}

export interface IUpdateLosStatusParams {
losStatus: string;
dlxStatus: string;
}

export interface IUpdateStatusUpdatesParams {
dlxStatus: string;
shouldUpdate: boolean;
}

const StatusMappings: React.FC<IStatusMappingsProps> = ({
losId,
}): JSX.Element => {
const classes = useStyles();
const classes2 = useStyles2();

  const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();
const isMeridianLink = losId === 'MeridianLink';

  const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [showAlert, setShowAlert] = useState(false);
const [applicationStatuses, setApplicationStatuses] = useState<
Array<LosStatus>
  >{[]];
const [fundingStatuses, setFundingStatuses] = useState<Array<LosStatus>>([]);
const [statusUpdates, setStatusUpdates] = useState(
[] as Array<IStatusUpdate>,
  ];
if (!tenant) {
return <></>;
}
const { id: tenantId } = tenant;

  const push = useNavigate();

  useEffect(() => {
if (!loading) return;
const titleList = new Map();

    const config = {
headers: { 'X-TENANT-ID': tenantId, 'X-LOS-ID': losId },
};
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(
`Loan App Status Mapping`,
`/admin/tenant/${tenantId}/los-status-mappings`,
    ];
setPageTitle(titleList);

    client2(
`${process.env.REACT_APP_LOS_ADAPTER_API_BASE_URL}los-status-mappings`,
'GET',
config,
    ]
.then((data) => {
setApplicationStatuses(data.payload.applicationStatuses);
setFundingStatuses(data.payload.fundingStatuses);
if (!isMeridianLink) {
setLoading(false);
}
if (isMeridianLink) {
client2(
`${process.env.REACT_APP_LOAN_APP_API_BASE_URL}dlx-recordstate-update-settings`,
'GET',
config,
          }
.then((data) => {
setStatusUpdates(
data.payload.statusUpdates as Array<IStatusUpdate>,
              };
setLoading(false);
            }]
.catch((error) => {
console.error(error);
setLoading(false);
setErrorResponse(error);
            }];
}
      }]
.catch((error) => {
console.error(error);
setLoading(false);
setErrorResponse(error);
      }];
}, [loading]);

  const saveClicked = async () => {
setShowAlert(false);

    const statusMappingsWithLosId: ILosStatusMappingsRequest = {
applicationStatuses,
      fundingtatuses,
LosId: losId,
};

    const config2 = {
headers: { 'X-TENANT-ID': tenantId },
body: { statusUpdates },
};

    const losAdapterConfig = {
headers: {
'X-TENANT-ID': tenantId,
'X-CONTRACT-NUMBER': tenant.tenantSchema.replace('T', ''),
},
body: statusMappingsWithLosId,
};

    client2(
`${process.env.REACT_APP_LOS_ADAPTER_API_BASE_URL}los-status-mappings`,
'POST',
losAdapterConfig,
    ]
.then(() => {
if (!isMeridianLink) {
push(`/admin/tenant/${tenant.id}/view`);
return;
}
client2(
`${process.env.REACT_APP_LOAN_APP_API_BASE_URL}dlx-recordstate-update-settings`,
'PUT',
config2,
        }
.then(() => {
push(`/admin/tenant/${tenantId}/view`);
          }]
.catch((e) => {
setErrorResponse(e);
return;
          }];
      }]
.catch((e) => {
setErrorResponse(e);
return;
      }];
};

  const Alert = () => {
return (
<SweetAlert
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => setShowAlert(false)}
confirmBtnCssClass={classes2.button + ' ' + classes2.success}
cancelBtnCssClass={classes2.button + ' ' + classes2.danger}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>
    ];
};

  const discardChanges = () => {
setShowAlert(false);
push(`/admin/tenant/${tenant.id}/view`);
};

  const updateApplicationStatuses = ({
losStatus,
dlxStatus,
}: IUpdateLosStatusParams) => {
const targetLosMappingIndex = applicationStatuses.findIndex(
(mapping) => mapping.los === losStatus,
    ];

    if (targetLosMappingIndex < 0) {
setApplicationStatuses([
...applicationStatuses,
{ los: losStatus, dlx: dlxStatus, losid: losId },
      ]];
return;
}

    setApplicationStatuses(
applicationStatuses.map((status, i) => {
if (i === targetLosMappingIndex) {
return { ...status, dlx: dlxStatus };
}
return status;
      }],
    ];
};

  const updateFundingStatuses = ({
losStatus,
dlxStatus,
}: IUpdateLosStatusParams) => {
const targetLosMappingIndex = fundingStatuses.findIndex(
(mapping) => mapping.los === losStatus,
    ];

    if (targetLosMappingIndex < 0) {
setFundingStatuses([
...fundingStatuses,
{ los: losStatus, dlx: dlxStatus, losid: losId },
      ]];
return;
}

    setFundingStatuses(
fundingStatuses.map((status, i) => {
if (i === targetLosMappingIndex) {
return { ...status, dlx: dlxStatus };
}
return status;
      }],
    ];
};

  const updateStatusUpdates = ({
dlxStatus,
shouldUpdate,
}: IUpdateStatusUpdatesParams) => {
setStatusUpdates((prev) => {
const targetEntryIndex = prev.findIndex(
({ status }) => status === dlxStatus,
      ];
if (targetEntryIndex < 0) {
return [...prev, { status: dlxStatus, update: shouldUpdate }];
}
return prev.map((statusUpdate, i) => {
if (i === targetEntryIndex) {
return { ...statusUpdate, update: shouldUpdate };
}
return statusUpdate;
      }];
    }};
};

  useEffect(() => {
setDisplayCreateButton(false);
}, []);

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  const StatusMappingDropdown = ({
statusType,
dlxStatus: currentDlxStatus,
losStatus,
classes,
setLosStatus,
}: IStatusMappingDropdownProps): JSX.Element => {
const dlxOptions = mapDlxStatuses(losId, (status) => {
return (
<MenuItem
key={status}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={status}
>
{status}
</MenuItem>
      ];
    }};

    return (
<GridContainer style={{ paddingBottom: '12px' }}>
<GridItem xs={12} sm={5} md={5}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="statusMappings"
label={losStatus}
          [>
</GridItem>

        <GridItem xs={12} sm={6} md={6}>
<FormControl fullWidth={true}>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={currentDlxStatus}
onChange={(event) => {
const {
target: { value },
} = event;
setLosStatus(value as string);
}}
inputProps={{
name: `${statusType}-${losStatus}`,
id: `dropdown-${statusType}-${losStatus}`,
}}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
value=""
>
Choose DLX Status
</MenuItem>

              {dlxOptions}
</Select>
</FormControl>
</GridItem>
</GridContainer>
    ];
};

  return (
<div>
{showAlert && <Alert />}
<GridContainer>
<GridItem xs={12} xl={8}>
<Card id="los-mappings-card">
<CardHeader color="cuna1" text>
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
<div>
<CardText color="cuna1">
<h4
id="los-mappings-card-header"
className={classes.cardTitle}
>
LOS Status List
</h4>
</CardText>
</div>
<div
style={{ color: 'black', width: '80%' }}
id="static-element-notification"
>
<staticNotification message="Mappings only take effect once an automated job consumes this new mapping, which can take up to 24 hours. Please don't leave any settings NoTMAPPED" />
</div>
</div>
</CardHeader>

            <CardBody>
<GridContainer>
<GridItem xs={12}>
<h4 style={{ textAlign: 'left', paddingLeft: '25px' }}>
<b>Loan Origination System</b>
</h4>
</GridItem>

                {/* Application Status column */}
<GridItem xs={12} sm={6}>
<GridContainer>
<GridItem xs={12}>
<h4
style={{
textAlign: 'left',
paddingBottom: '25px',
paddingLeft: '25px',
}}
>
Application Status
</h4>
</GridItem>

                    {mapLosApplicationStatus(losId, (losStatus, idx) => {
const targetMapping = applicationStatuses.find(
(mapping) => mapping.los === losStatus,
                      ];
const dlxStatus = targetMapping
? targetMapping.dlx
: notMappedStatus;

                      return (
<GridItem key={idx} xs={12}>
<StatusMappingDropdown
classes={classes}
losStatus={losStatus}
dlxStatus={dlxStatus}
statusType={StatusTypeEnum.ApplicationStatusType}
setLosStatus={(updatedDlxStatus) =>
updateApplicationStatuses({
losStatus,
dlxStatus: updatedDlxStatus,
                              }]
}
                          [>
</GridItem>
                      ];
                    }}}
</GridContainer>
</GridItem>

                <GridItem xs={12} sm={6}>
<GridContainer>
<GridItem xs={12}>
<h4
style={{
textAlign: 'left',
paddingBottom: '25px',
paddingLeft: '25px',
}}
>
Funding Status
</h4>
</GridItem>

                    {mapLosFundingStatuses(losId, (losStatus, idx) => {
const targetMapping = fundingStatuses.find(
(mapping) => mapping.los === losStatus,
                      ];
const dlxStatus = targetMapping
? targetMapping.dlx
: notMappedStatus;
return (
<GridItem key={idx} xs={12}>
<StatusMappingDropdown
classes={classes}
losStatus={losStatus}
dlxStatus={dlxStatus}
statusType={StatusTypeEnum.FundingStatusType}
setLosStatus={(updatedDlxStatus) =>
updateFundingStatuses({
losStatus,
dlxStatus: updatedDlxStatus,
                              }]
}
                          [>
</GridItem>
                      ];
                    }}}
</GridContainer>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>

      {isMeridianLink && (
<GridContainer>
<GridItem xs={12} xl={4}>
<Card id="los-mapping-card">
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4
id="los-mappings-card-header"
className={classes.cardTitle}
>
Loan Record Updates
</h4>
</CardText>
</CardHeader>

              <CardBody>
<GridContainer>
<GridItem xs={12}>
<GridContainer>
<GridItem xs={12}>
<h4
style={{
textAlign: 'left',
paddingBottom: '25px',
paddingLeft: '25px',
}}
>
Update the Loan Record upon change to the following
state(s):
</h4>
</GridItem>

                      {mapDlxUpdateStatuses(losId, (dlxStatus, idx) => {
const target =
statusUpdates &&
statusUpdates &&
statusUpdates.find(
(mapping) => mapping.status === dlxStatus,
                          };
const shouldUpdate = target ? target.update : false;

                        return (
<GridContainer key={idx}>
<GridItem xs={5}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="statusMappings"
label={dlxStatus}
                              [>
</GridItem>
<GridItem xs={7}>
<FormControlLabel
label=""
style={{
paddingTop: '0px',
paddingBottom: '5px',
}}
control={
<Checkbox
id={dlxStatus + '-' + 'shouldUpdate'}
checked={shouldUpdate}
onChange={(event) => {
const {
target: { checked },
} = event;
updateStatusUpdates({
dlxStatus,
shouldUpdate: checked,
                                       }};
}}
value={dlxStatus}
classes={{
checked: classes.checked,
}}
/>
}
                              [>
</GridItem>
</GridContainer>
                        ];
                      }}}
</GridContainer>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
      ]}

      <GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12} xl={8}>
<Button
id="los-status-mapping-discard-changes"
color="danger"
simple
onClick={() => setShowAlert(true)}
>
Discard Changes
</Button>
<Button
id="los-status-mapping-save"
color="success"
onClick={saveClicked}
>
Save
</Button>
</GridItem>
</GridContainer>
</div>
  ];
};

export default StatusMappings;

```
<!-- CODESCAN_FILE_END -->

---

### 423. `C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappingsTypes.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\LosStatusMappings\LosStatusMappingsTypes.ts" type=".ts" size="557" lines="28" chars="557" -->
```typescript
export enum StatusTypeEnum {
ApplicationStatusType = 'Application',
FundingStatusType = 'Funding',
}

export interface LosStatus {
los: string;
dlx: string;
losid: string;
}

export interface ILosStatusMappingsRequest {
LosId?: string;
applicationStatuses: Array<LosStatus>;
fundingStatuses: Array<LosStatus>;
}

export interface IStatusUpdate {
status: string;
update: boolean;
}

export interface LosConstantStatuses {
losApplicationStatuses: Array<string>;
losFundingStatuses: Array<string>;
dlxUpdateStatuses: Array<string>;
}

```
<!-- CODESCAN_FILE_END -->

---

### 424. `C:\DevCode\AstroUI\src\components\ManageTenant\base-tenant.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\ManageTenant\base-tenant.ts" type=".ts" size="8069" lines="290" chars="8069" -->
```typescript
export interface Tenant {
abbreviatedName: string;
assetRank: any | null;
assetSize: any | null;
charterType: string;
contractNumber: string;
createdTimestamp: string;
creationPending: boolean;
cuicCustomerNumber: string;
defaultMerchantId: string | null;
defaultZipCode: string;
id: string;
isMailingSameAddress: boolean;
lastUpdatedTimestamp: string;
leagueMember: boolean;
legalName: string;
legalStatus: string;
mailingAddress: Address;
memberizationRequired: boolean;
membershipClassCode: string;
membershipClassDesc: string;
losMembershipRedirectUrl: string;
metadataJSON: any | null;
numberOfMembers: number | string | null;
operationalStatus: string;
parentTenantId: any | null;
phoneNumber: string;
physicalAddress: Address;
postalName: string;
recordState: string;
resourceUrl: string;
survivingContractNumber: any | null;
tenantSchema: string;
tenantTypeCode: string;
tenantTypeId: number | string;
tenantTypeName: string;
website: string;
addresses: UpdatedTenantAddress[];
isCnxLicensed: boolean;
isDlxLicensed: boolean;
isTextMessagingEnabled: boolean;
isAuthorizeToSubmitToLOS: boolean;
isDocUploadApprovalAutomatic: boolean;
[key: string]: any;
// FICUS API Client Values (also using legalName)
ficusApiClient: boolean;
apiContactName: string;
apiContactEmail: string;
}

export interface BaseTenant {
abbreviatedName: string;
assetRank: any | null;
assetSize: any | null;
charterType: string;
contractNumber: string;
// createdTimestamp: string;
// creationPending: boolean;
cuicCustomerNumber: string;
defaultMerchantId: string | null;
defaultZipCode: string;
id?: string;
isMailingSameAddress: boolean;
// lastUpdatedTimestamp: string;
leagueMember: boolean;
legalName: string;
legalStatus: string;
mailingAddress: Address;
memberizationRequired: boolean;
membershipClassCode: string;
membershipClassDesc: string;
losMembershipRedirectUrl: string;
losMembershipRedirectUrlPreset?: string;
losMembershipRedirectUrlRefId?: string;
// metadataJSON: any | null;
numberOfMembers: number | string;
operationalStatus: string;
// parentTenantId: any | null;
phoneNumber: string;
physicalAddress: Address;
postalName: string;
recordState: string;
// resourceUrl: string;
survivingContractNumber: any | null;
tenantSchema?: string;
tenantTypeCode: string;
tenantTypeId: number | string;
tenantTypeName: string;
website: string;
addresses?: UpdatedTenantAddress[];
[key: string]: any;
// FICUS API Client Values (also using legalName)
ficusApiClient: boolean;
apiContactName: string;
apiContactEmail: string;
}

export interface Address {
addCity: string;
addCountry: string;
addCounty: string;
addLine1: string;
addLine2: string;
addLine3: string;
addState: string;
addZip: string;
}

export interface UpdatedTenantAddress {
addressType: 'Physical' | 'Mailing';
city: string;
country: string;
county: string;
  linel: string:
line2: string;
line3: string;
postalCode: string;
state: string;
zip?: string;
}

export enum MembershipPreset {
NONE = 'NONE',
TEST = 'TEST',
PROD = 'PROD',
}

const baseConfiguration: BaseTenant = {
recordState: 'Draft',
legalName: '',
postalName: '',
abbreviatedName: '',
contractNumber: '',
cuicCustomerNumber: '',
tenantTypeId: '1',
tenantTypeCode: 'CU',
tenantTypeName: 'Credit Union',
defaultMerchantId: null,
charterType: 'State',
numberOfMembers: '',
membershipClassCode: '',
membershipClassDesc: '',
losMembershipRedirectUrl: '',
losMembershipRedirectUrlPreset: MembershipPreset.NONE,
losMembershipRedirectUrlRefId: 'N/A',
memberizationRequired: false,
leagueMember: false,
survivingContractNumber: '',
website: '',
phoneNumber: '',
assetRank: '',
assetSize: '',
legalStatus: '',
operationalStatus: '',
isMailingSameAddress: true,
physicalAddress: {
addLine1: '',
addLine2: '',
addLine3: '',
addCity: '',
addCounty: '',
addState: '',
addZip: '',
addCountry: 'US',
},
mailingAddress: {
addLine1: '',
addLine2: '',
addLine3: '',
addCity: '',
addCounty: '',
addState: '',
addZip: '',
addCountry: 'US',
},
defaultZipCode: '',
ficusApiClient: false,
apiContactEmail: '',
apiContactName: '',
};

export const LOS_MEMBERSHIP_REDIRECT_BASE_URL_TEST =
'apptest.consumer.meridianlink.com/services/lpqsso/getSSOToken.aspx?lender_ref=';

export const LOS_MEMBERSHIP_REDIRECT_BASE_URL_PROD =
'app.consumer.meridianlink.com/services/lpqsso/getSSOToken.aspx?lender_ref=';

export const EXTERNAL_API_AUTHORIZATION_NAME = 'LOSADAPTER';

export function baseTenant() {
return JSON.parse(JSON.stringify(baseConfiguration));
}

export function reformatFetchedTenant(tenantEntry?: Tenant) {
const updatedTenant = {
...baseTenant(),
...tenantEntry,
};

  // format the address data to fit the AddressCard template format

  if (!updatedTenant.addresses) {
return updatedTenant;
}

  if (updatedTenant.addresses.length == 0) {
delete updatedTenant.addresses;
return updatedTenant;
}

  if (updatedTenant.addresses[0].addressType === 'Physical') {
reformatPhysicalAddress(updatedTenant, updatedTenant.addresses[0]);

    if (updatedTenant.addresses.length > 1) {
reformatMailingAddress(updatedTenant, updatedTenant.addresses[1]);
}
} else {
reformatMailingAddress(updatedTenant, updatedTenant.addresses[0]);

    if (updatedTenant.addresses.length > 1) {
reformatPhysicalAddress(updatedTenant, updatedTenant.addresses[1]);
}
}

  // set LOS Membership Redirect URL fields
const refId =
updatedTenant.losMembershipRedirectUrl?.split('lender_ref=')[1] ?? '';

  if (!updatedTenant.losMembershipRedirectUrl) {
updatedTenant.losMembershipRedirectUrlPreset = MembershipPreset.NONE;
} else if (
updatedTenant.losMembershipRedirectUrl.includes(
LOS_MEMBERSHIP_REDIRECT_BASE_URL_TEST,
    ]
  ] {
updatedTenant.losMembershipRedirectUrlPreset = MembershipPreset.TEST;
updatedTenant.losMembershipRedirectUrlRefId = refId;
} else if (
updatedTenant.losMembershipRedirectUrl.includes(
LOS_MEMBERSHIP_REDIRECT_BASE_URL_PROD,
    ]
  ] {
updatedTenant.losMembershipRedirectUrlPreset = MembershipPreset.PROD;
updatedTenant.losMembershipRedirectUrlRefId = refId;
}

  // delete server version after reformat
delete updatedTenant.addresses;

  return updatedTenant;
}

function reformatPhysicalAddress(
updatedTenant: Tenant,
address: UpdatedTenantAddress,
] {
updatedTenant.physicalAddress.addLine1 = address.line1 ? address.line1 : '';
updatedTenant.physicalAddress.addLine2 = address.line2 ? address.line2 : '';
updatedTenant.physicalAddress.addLine3 = address.line3 ? address.line3 : '';
updatedTenant.physicalAddress.addCity = address.city ? address.city : '';
updatedTenant.physicalAddress.addState = address.state ? address.state : '';
updatedTenant.physicalAddress.addZip = address.postalCode
? address.postalCode
    ; ` `;
updatedTenant.physicalAddress.addCounty = address.county
? address.county
    ; ` `;
updatedTenant.physicalAddress.addCountry = address.country
? address.country
    ; ` `;
}

function reformatMailingAddress(
updatedTenant: Tenant,
address: UpdatedTenantAddress,
] {
updatedTenant.mailingAddress.addLine1 = address.line1 ? address.line1 : '';
updatedTenant.mailingAddress.addLine2 = address.line2 ? address.line2 : '';
updatedTenant.mailingAddress.addLine3 = address.line3 ? address.line3 : '';
updatedTenant.mailingAddress.addCity = address.city ? address.city : '';
updatedTenant.mailingAddress.addState = address.state ? address.state : '';
updatedTenant.mailingAddress.addZip = address.postalCode
? address.postalCode
    ; ` `;
updatedTenant.mailingAddress.addCounty = address.county ? address.county : '';
updatedTenant.mailingAddress.addCountry = address.country
? address.country
    ; ` `;
}

```
<!-- CODESCAN_FILE_END -->

---

### 425. `C:\DevCode\AstroUI\src\components\ManageTenant\ManageTenant.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\ManageTenant\ManageTenant.jsx" type=".jsx" size="1585" lines="57" chars="1585" -->
```javascript
import React, { useEffect, useState } from 'react';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import TenantsList from 'components/TenantsList/TenantsList';
import { useAppContext } from 'context/app-context';
import { client2 } from 'utils/api-client';
import { useNavigate } from 'react-router-dom';

const ManageTenant = (props) => {
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [data, setData] = useState(null);

  const { setTenant, setCoreProduct } = useAppContext();
const navigate = useNavigate();
const cachedToken = localStorage.getItem('astro_token');

  //call service to get the list of tenants
useEffect(() => {
if (!loading) return;
if (!cachedToken) {
return;
}

    setTenant(null); // hide merchants sidebar
setCoreProduct(undefined);

    // TODO -> need to implement sequential page fetch

    client2(`${process.env.REACT_APP_TENANT_API_BASE_URL}tenants?pageSize=500`)
.then((data) => {
setData(data.payload);
setLoading(false);
      }]
.catch((error) => {
console.log(error);
setLoading(false);
setErrorResponse(error);
      }];
}, [loading, cachedToken]);

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  if (data && data.length > 0) {
return <TenantsList data={data} {...props} />;
}

  if (data && data.length === 0) {
navigate('/admin/tenant/create');
}

  return <div></div>;
};

export default ManageTenant;

```
<!-- CODESCAN_FILE_END -->

---

### 426. `C:\DevCode\AstroUI\src\components\MapCoreProductTemplates\__test__\core-products.json`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstrouI\src\components\MapCoreProductTemplates\_test__Icore-products.json" type=".json" size="14289" lines="411" chars="14289" -->
   'json
{
"result": {
"code": 0,
"message": "Success",
"apiVer": "1.0.0",
"correlationId": "46ea16c7-acbe-4726-8252-aee4b6a487a5",
"errors": []
},
"payload": [
{
"id": "AD15EAD8-9EFA-46DA-A046-D7090D5BDB50",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "4E4AF0BB-97CE-43C1-9B7A-4DF1DB6D65E6",
"recordState": "Active",
"name": "27 Month Extended Certificate",
"category": "Deposit",
"type": "Certificate",
"subtype": "Certificate",
"version": 4,
"versionDescription": "Version 4",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Deposit",
"secondaryGroupValue": "Certificate",
"previousVersionProductId": "62D9CC9E-8121-4CB1-A081-1E7D5F5B9CE1",
"mediaUrl": null
},
{
"id": "F7D908EF-9D12-4F6C-BA4C-A32F551A898C",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "DBCD99F2-03A7-49C4-B9B5-6EDE6ED0F7D3",
"recordState": "Active",
"name": "B2B Deposits Member-New-Share",
"category": "B2B",
"type": "Account Opening",
"subtype": "Member-New-Share",
"version": 8,
"versionDescription": "Version 8",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Account Opening",
"secondaryGroupValue": "Member-New-Share",
"previousVersionProductId": "A67DF7FF-6A9A-4CB1-9808-283A0C19D773",
"mediaUrl": null
},
{
"id": "6AA532C1-573B-4A8F-B1C8-17C3C2F01B8B",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "84D8353A-BDF0-4A7C-A5AE-0DF4CB32FFC9",
"recordState": "Active",
"name": "Guaranteed Asset Protection",
"category": "Protection Product",
"type": "Insurance",
"subtype": "GAP",
"version": 2,
"versionDescription": "Version 2",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Insurance",
"secondaryGroupValue": null,
"previousVersionProductId": "6189DC61-05F5-49BA-A670-053DB354B85F",
"mediaUrl": null
},
{
"id": "1D197754-126B-4C7F-8CB1-81414094AC9E",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "6D813240-2AEA-4CA1-AF34-4F594F95868D",
"recordState": "Active",
"name": "Mechanical Repair Coverage",
"category": "Protection Product",
"type": "Warranty",
"subtype": "MRC",
"version": 2,
"versionDescription": "Version 2",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Warranty",
"secondaryGroupValue": null,
"previousVersionProductId": "2957D50E-4850-4213-9071-75769FDB9FF0",
"mediaUrl": null
},
{
"id": "2376A431-3ED3-4DBB-A23A-32E08F050523",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "D4A82520-E478-41A6-8081-6D64CA0E8ACB",
"recordState": "Active",
"name": "My Fi  Refinance Auto Loan Product",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance",
"version": 15,
"versionDescription": "Version 15",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Auto",
"secondaryGroupValue": "Refinance",
"previousVersionProductId": "585BF681-3F19-4C1D-8391-27618DA18FBE",
"mediaUrl": null
},
{
"id": "F7B02F0D-C3E4-4A81-926D-89027EC4E8ED",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "C1712DF3-39D4-4E64-ADFB-02721152D382",
"recordState": "Active",
"name": "My Fi Credit Card",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card",
"version": 14,
"versionDescription": "Version 14",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Credit Card",
"secondaryGroupValue": "Unsecured Credit Card",
"previousVersionProductId": "C7E894D9-E2BD-4BC2-BBDB-98FDCF5748FF",
"mediaUrl": null
},
{
"id": "9E2A20DC-59A3-4F53-AE94-033518D09548",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "9CF57F44-082B-4AC3-B36F-88E853CA924F",
"recordState": "Active",
"name": "My FI Credit Limit Increase",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card Limit Increase",
"version": 7,
"versionDescription": "Version 7",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Credit Card",
"secondaryGroupValue": "Credit Card Limit Increase",
"previousVersionProductId": "8DED774B-4A24-45B5-BE55-7E56817CFA77",
"mediaUrl": null
},
{
"id": "9ED48FCE-A08D-4062-89CF-CDED90DD86C6",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "2D851F48-B39F-4598-8885-953102CC5F6E",
"recordState": "Active",
"name": "My Fi Home Equity Line of Credit",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Line of Credit",
"version": 1,
"versionDescription": "Version 1",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 12,
"applicationExpiryDuration": 50,
"allowSimulation": false,
"primaryGroupValue": "Home Equity",
"secondaryGroupValue": "HELOC",
"previousVersionProductId": null,
"mediaUrl": null
},
{
"id": "C462A0EE-2210-46AD-B18F-9CEECBCC6680",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "FED2FCDC-E48C-486A-AEFC-38D20F0D4561",
"recordState": "Active",
"name": "My Fi Home Equity Loan",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Loan",
"version": 7,
"versionDescription": "Version 7",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 15,
"applicationExpiryDuration": 40,
"allowSimulation": false,
"primaryGroupValue": "Home Equity",
"secondaryGroupValue": "HEL",
"previousVersionProductId": "6D713A03-67DA-4279-9440-E11B3C7C3BCD",
"mediaUrl": null
},
{
"id": "470F79DF-D153-4DDC-A7F2-F3D9B0F33206",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "61A7E676-899F-48BD-A228-29EDF659F0B4",
"recordState": "Active",
"name": "My FI New Auto Loan Product",
"category": "Lending",
"type": "Auto",
"subtype": "New",
"version": 15,
"versionDescription": "Version 15",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": true,
"primaryGroupValue": "Auto",
"secondaryGroupValue": "New",
"previousVersionProductId": "3848E9F4-C063-4542-A762-A31CC5185C75",
"mediaUrl": null
},
{
"id": "711FBEAD-9302-4B2E-B32C-81273E1A427D",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "394E6998-F813-440B-A74D-6EA87812F602",
"recordState": "Active",
"name": "My FI Overdraft Line of Credit",
"category": "Lending",
"type": "Personal",
"subtype": "Overdraft Line of Credit",
"version": 14,
"versionDescription": "Version 14",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Personal",
"secondaryGroupValue": null,
"previousVersionProductId": "4A6D975E-3BE2-459D-BEE0-8C09BFE8B7FD",
"mediaUrl": null
},
{
"id": "E5FDEA4B-F8DD-49A3-9EBB-33977C3DF3B7",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "E2897692-5795-44D9-865F-22F8E30BF9CD",
"recordState": "Active",
"name": "My FI Personal Line Of Credit Product",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Line of Credit",
"version": 16,
"versionDescription": "Version 16",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Personal",
"secondaryGroupValue": "Line of Credit",
"previousVersionProductId": "88371391-3497-4449-826C-81A1E6C9A9AD",
"mediaUrl": null
},
{
"id": "42E8BFA9-5692-48D6-AB16-BF6D45D6BE5A",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "A3E0678A-941D-492D-ABE0-D4F4D77D13F8",
"recordState": "Active",
"name": "My FI Personal Loan Product",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Loan",
"version": 15,
"versionDescription": "Version 15",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Personal",
"secondaryGroupValue": "Personal",
"previousVersionProductId": "122CEC73-3BEF-457A-A9E8-33021EEFEEA0",
"mediaUrl": null
},
{
"id": "7E1F5C8B-B80A-4C0B-819D-8BC8470B7806",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "4CDAC858-327C-48BF-B697-C4AB69057758",
"recordState": "Active",
"name": "My Fi Recreational",
"category": "Lending",
"type": "Recreational",
"subtype": "Recreational",
"version": 17,
"versionDescription": "Version 17",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Recreational",
"secondaryGroupValue": null,
"previousVersionProductId": "F6157848-62DB-4EF9-9CC9-C012960ED64C",
"mediaUrl": null
},
{
"id": "0B4B83DB-EE64-4883-BDFA-E4BC967C32F3",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "F41D5E9D-42B4-43D6-808F-23CE4A5A7831",
"recordState": "Active",
"name": "My FI Refinance Cash Out Auto",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance - Cash Out",
"version": 16,
"versionDescription": "Version 16",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Auto",
"secondaryGroupValue": "Refinance",
"previousVersionProductId": "7579E8FF-C236-4930-BC2F-9959C5D80846",
"mediaUrl": null
},
{
"id": "32EFBEB2-A71E-4691-B819-793178376D13",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "58EE46AE-EB6D-471A-B2A8-3CC4C2ED4F38",
"recordState": "Active",
"name": "My Fi Secured Loan Form",
"category": "Lending",
"type": "Secured",
"subtype": "Secured",
"version": 8,
"versionDescription": "Version 8",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Secured",
"secondaryGroupValue": null,
"previousVersionProductId": "4E811384-4D02-4309-AF00-42FAC2B6EA12",
"mediaUrl": null
},
{
"id": "58F7339A-B1DE-497F-B029-835E2E6369CB",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "DF0697D5-5AC1-4570-B3CC-7923D57FC0F8",
"recordState": "Active",
"name": "My FI Unsecured",
"category": "Lending",
"type": "Personal",
"subtype": "Unsecured",
"version": 12,
"versionDescription": "Version 12",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": false,
"primaryGroupValue": "Personal",
"secondaryGroupValue": null,
"previousVersionProductId": "CD9CA166-0855-4FAB-9997-1F9EF3D37722",
"mediaUrl": null
},
{
"id": "A4142916-4D03-4FC6-81E6-185837F617AC",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "94AE938F-7145-4F74-9CD6-18B9E89A02D4",
"recordState": "Active",
"name": "My FI Used Auto Loan Product",
"category": "Lending",
"type": "Auto",
"subtype": "Used",
"version": 18,
"versionDescription": "Version 18",
"startDate": null,
"endDate": null,
"applicationIdleDuration": 20,
"applicationExpiryDuration": 30,
"allowSimulation": true,
"primaryGroupValue": "Auto",
"secondaryGroupValue": "Used",
"previousVersionProductId": "0A915CC7-2F27-4A8E-BB70-7245E14134A5",
"mediaUrl": null
},
{
"id": "97DC7AE4-793D-49AC-8395-EE9CDE32B02B",
"tenantId": "40FB7F4A-0DA9-4752-97B5-20E7C879325A",
"templateId": "24189695-02F8-480C-8366-11E5C1F24BA8",
"recordState": "Active",
"name": "MyFi Wildcard",
"category": "Wildcard",
"type": "Wildcard",
"subtype": "Wildcard",
"version": 2,
"versionDescription": "Version 2",
"startDate": null,
"endDate": null,
"applicationIdleDuration": null,
"applicationExpiryDuration": null,
"allowSimulation": false,
"primaryGroupValue": "Wildcard",
"secondaryGroupValue": null,
"previousVersionProductId": "7CF7DE28-F880-4286-8CA8-A16224D1516C",
"mediaUrl": null
}
]
}

```
<!-- CODESCAN_FILE_END -->

---

### 427.'C:\DevCode\AstroUI\srclcomponents\MapCoreProductTemplates\_test__\MapCoreProductTemplates.test.tsx

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapCoreProductTemplates\_test__\MapCoreProductTemplates.test.tsx" type=".tsx" size="4012" lines="136" chars="4012" -->
```typescript
import React from 'react';
import { fireEvent, queryByAttribute, screen } from '@testing-library/react';

import { renderWithMockContext } from 'components/__mock__/mock-context';
import { MapCoreProductTemplates } from '../MapCoreProductTemplates';
import { mockGetOnce } from 'components/__test__/TestUtils';
import templatesResponse from './tenant-core-product-templates.json';
import productsResponse from './core-products.json';

const getById = queryByAttribute.bind(null, 'id');

afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
}};

const props = {
history: {
location: {
pathname: '/admin/tenant/aaaaaaaaaaa/map-core-product-templates',
},
push: jest.fn(),
},
match: { params: { tenantId: 'aaaaaaaaaaa' } },
};

test('MapCoreProductContext renders', async () => {
mockGetOnce(templatesResponse);
mockGetOnce(templatesResponse);
mockGetOnce(productsResponse);

  renderWithMockContext(<MapCoreProductTemplates {...(props as any)} />);
const nameHeader = await screen.findByText('Name');
expect(nameHeader);

  const overdraftRows = screen.getAllByText(
'CUNA Overdraft Line of Credit, Product Template',
  ];
expect(overdraftRows.length).toBe(2);
}};

test('MapCoreProductContext - cannot remove assignment for used template', async () => {
const mockTemplatesResponse = {
payload: [
{
id: '689FD45A-ABD3-4E86-8B1A-89868E40F5EC',
templateId: '689FD45A-ABD3-4E86-8B1A-89868E40F5EC',
recordState: 'Active',
name: 'CUNA Credit Card, Product Template',
description: 'CUNA Credit Card, Product Template 2023-11-16',
category: 'Lending',
type: 'Credit Card',
subtype: 'Credit Card',
version: 1,
versionDescription: '1',
},
{
id: '9AEAA68D-D432-4ADE-A241-1824696199CC',
templateId: '9AEAA68D-D432-4ADE-A241-1824696199CC',
recordState: 'Active',
name: 'CUNA Credit Card, Product Template',
description: 'CUNA Credit Card, Product Template 2024-01-10',
category: 'Lending',
type: 'Credit Card',
subtype: 'Credit Card',
version: 2,
versionDescription: '2',
},
],
};

  const mockProductsResponse = {
payload: [
{
id: 'F7B02F0D-C3E4-4A81-926D-89027EC4E8ED',
tenantId: '40FB7F4A-0DA9-4752-97B5-20E7C879325A',
templateId: '689FD45A-ABD3-4E86-8B1A-89868E40F5EC',
recordState: 'Active',
name: 'My Fi Credit Card',
category: 'Lending',
type: 'Credit Card',
subtype: 'Credit Card',
version: 1,
versionDescription: 'Version 1',
startDate: null,
endDate: null,
applicationIdleDuration: 20,
applicationExpiryDuration: 30,
allowSimulation: false,
primaryGroupValue: 'Credit Card',
secondaryGroupValue: 'Unsecured Credit Card',
previousVersionProductId: 'C7E894D9-E2BD-4BC2-BBDB-98FDCF5748FF',
mediaUrl: null,
},
],
};

  mockGetOnce(mockTemplatesResponse);
mockGetOnce(mockTemplatesResponse);
mockGetOnce(mockProductsResponse);

  const wrapper = renderWithMockContext(
<MapCoreProductTemplates {...(props as any)} />,
  ];
const nameHeader = await screen.findByText('Name');
expect(nameHeader);

  const oldTemplateCheckbox = getById(
wrapper.container,
'689FD45A-ABD3-4E86-8B1A-89868E40F5EC_check',
  ];

  jest.clearAllMocks();
jest.resetAllMocks();

  const windowSpy = jest
.spyOn(window, 'fetch')
.mockImplementationOnce(async () => {
return Promise.resolve({
ok: true,
json: () => {},
text: () => '',
}) as unknown as Response;
    }};
fireEvent.click(oldTemplateCheckbox!);
expect(windowSpy).not.toHaveBeenCalled();

  const newTemplateCheckbox = getById(
wrapper.container,
'9AEAA68D-D432-4ADE-A241-1824696199CC_check',
  ];

  fireEvent.click(newTemplateCheckbox!);
expect(windowSpy).toHaveBeenCalled();
}};

```
<!-- CODESCAN_FILE_END -->

---

### 428. 'C:\DevCode\AstroUI\srclcomponents\MapCoreProductTemplates\__test__Itenant-core-product-templates.json'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapCoreProductTemplates\__test__Itenant-core-product-templates.json" type=".json" size="28124" lines="756" chars="28124" -->
   'json
{
"result": {
"code": 0,
"message": "Success",
"apiVer": "1.0.0",
"correlationId": "1ed31361-f436-4fb7-984a-0f6d23d33043",
"errors": []
},
"payload": [
{
"id": "0C27B8BB-0C1D-412F-B451-D3B3F1F87E97",
"templateId": "0C27B8BB-0C1D-412F-B451-D3B3F1F87E97",
"recordState": "Active",
"name": "Campaign API Core product, Product Template",
"description": "Core product template used for Campaign API products 2023-11-16",
"category": "Api",
"type": "External",
"subtype": "Campaigns",
"version": 1,
"versionDescription": "1"
},
{
"id": "3F739FA1-C854-4D47-A485-02D97D094F37",
"templateId": "3F739FA1-C854-4D47-A485-02D97D094F37",
"recordState": "Active",
"name": "CUNA Account, Product Template",
"description": "Core product template used to create account products. 2024-01-10",
"category": "Account",
"type": "Account",
"subtype": "New",
"version": 18,
"versionDescription": "18"
},
{
"id": "689FD45A-ABD3-4E86-8B1A-89868E40F5EC",
"templateId": "689FD45A-ABD3-4E86-8B1A-89868E40F5EC",
"recordState": "Active",
"name": "CUNA Credit Card, Product Template",
"description": "CUNA Credit Card, Product Template 2023-11-16",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card",
"version": 24,
"versionDescription": "24"
},
{
"id": "9AEAA68D-D432-4ADE-A241-1824696199CC",
"templateId": "9AEAA68D-D432-4ADE-A241-1824696199CC",
"recordState": "Active",
"name": "CUNA Credit Card, Product Template",
"description": "CUNA Credit Card, Product Template 2024-01-10",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card",
"version": 25,
"versionDescription": "25"
},
{
"id": "1898596E-832E-4B20-8913-CBF45243E86C",
"templateId": "1898596E-832E-4B20-8913-CBF45243E86C",
"recordState": "Active",
"name": "CUNA Credit Limit Increase, Product Template",
"description": "CUNA Credit Limit Increase, Product Template 2023-06-01",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card Limit Increase",
"version": 16,
"versionDescription": "16"
},
{
"id": "9CF57F44-082B-4AC3-B36F-88E853CA924F",
"templateId": "9CF57F44-082B-4AC3-B36F-88E853CA924F",
"recordState": "Active",
"name": "CUNA Credit Limit Increase, Product Template",
"description": "CUNA Credit Limit Increase, Product Template 2024-01-10",
"category": "Lending",
"type": "Credit Card",
"subtype": "Credit Card Limit Increase",
"version": 17,
"versionDescription": "17"
},
{
"id": "83F69F0F-3EB7-40ED-8A9B-4D388213C4DF",
"templateId": "83F69F0F-3EB7-40ED-8A9B-4D388213C4DF",
"recordState": "Active",
"name": "CUNA Digital Memberization",
"description": "Core product template used to create a membership account. 2023-03-27",
"category": "Account",
"type": "Account",
"subtype": "Digital Memberization",
"version": 5,
"versionDescription": "5"
},
{
"id": "8A2DCE05-28DD-43FA-8F8A-5EC8359843E7",
"templateId": "8A2DCE05-28DD-43FA-8F8A-5EC8359843E7",
"recordState": "Active",
"name": "CUNA Digital Memberization",
"description": "Core product template used to create a membership account. 2024-01-10",
"category": "Account",
"type": "Account",
"subtype": "Digital Memberization",
"version": 6,
"versionDescription": "6"
},
{
"id": "08291759-336D-42C9-8494-D87337A46A00",
"templateId": "08291759-336D-42C9-8494-D87337A46A00",
"recordState": "Active",
"name": "CUNA GAP Protection Product, Product Template",
"description": "Core product template used for standalone GAP products 2023-03-09",
"category": "Protection Product",
"type": "Insurance",
"subtype": "GAP",
"version": 1,
"versionDescription": "1"
},
{
"id": "E812CBEE-2754-43CE-ABD5-F6E501023D0B",
"templateId": "E812CBEE-2754-43CE-ABD5-F6E501023D0B",
"recordState": "Active",
"name": "CUNA GAP Protection Product, Product Template",
"description": "Core product template used for standalone GAP products 2023-05-04",
"category": "Protection Product",
"type": "Insurance",
"subtype": "GAP",
"version": 2,
"versionDescription": "2"
},
{
"id": "84D8353A-BDF0-4A7C-A5AE-0DF4CB32FFC9",
"templateId": "84D8353A-BDF0-4A7C-A5AE-0DF4CB32FFC9",
"recordState": "Active",
"name": "CUNA GAP Protection Product, Product Template",
"description": "Core product template used for standalone GAP products 2024-01-10",
"category": "Protection Product",
"type": "Insurance",
"subtype": "GAP",
"version": 3,
"versionDescription": "3"
},
{
"id": "952BDF7D-7567-41F0-A610-BDF83B528C6A",
"templateId": "952BDF7D-7567-41F0-A610-BDF83B528C6A",
"recordState": "Active",
"name": "CUNA Home Equity Line of Credit, Product Template",
"description": "CUNA product template for home equity line of credit products 2023-03-27",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Line of Credit",
"version": 13,
"versionDescription": "13"
},
{
"id": "8E174A94-EA8F-4B92-A1F3-5B85BAC0E18B",
"templateId": "8E174A94-EA8F-4B92-A1F3-5B85BAC0E18B",
"recordState": "Active",
"name": "CUNA Home Equity Line of Credit, Product Template",
"description": "CUNA product template for home equity line of credit products 2023-06-01",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Line of Credit",
"version": 15,
"versionDescription": "15"
},
{
"id": "5403F02A-D20A-43CF-BFAD-598FB4704C95",
"templateId": "5403F02A-D20A-43CF-BFAD-598FB4704C95",
"recordState": "Active",
"name": "CUNA Home Equity Line of Credit, Product Template",
"description": "CUNA product template for home equity line of credit products 2024-01-10",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Line of Credit",
"version": 16,
"versionDescription": "16"
},
{
"id": "BE4D7992-ABF1-43AD-971C-E60D62C3FCD1",
"templateId": "BE4D7992-ABF1-43AD-971C-E60D62C3FCD1",
"recordState": "Active",
"name": "CUNA Home Equity Loan, Product Template",
"description": "CUNA product template for home equity loan products 2023-03-27",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Loan",
"version": 16,
"versionDescription": "16"
},
{
"id": "C73295F4-743B-4154-9489-37E2DC69525D",
"templateId": "C73295F4-743B-4154-9489-37E2DC69525D",
"recordState": "Active",
"name": "CUNA Home Equity Loan, Product Template",
"description": "CUNA product template for home equity loan products 2023-06-01",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Loan",
"version": 18,
"versionDescription": "18"
},
{
"id": "FED2FCDC-E48C-486A-AEFC-38D20F0D4561",
"templateId": "FED2FCDC-E48C-486A-AEFC-38D20F0D4561",
"recordState": "Active",
"name": "CUNA Home Equity Loan, Product Template",
"description": "CUNA product template for home equity loan products 2024-01-10",
"category": "Lending",
"type": "Home Equity",
"subtype": "Home Equity Loan",
"version": 19,
"versionDescription": "19"
},
{
"id": "D0142486-B611-4DFE-B860-C60301233452",
"templateId": "D0142486-B611-4DFE-B860-C60301233452",
"recordState": "Active",
"name": "CUNA Member New Share",
"description": "Core product template used to add shares to an existing membership account. 2023-10-19",
"category": "B2B",
"type": "Account Opening",
"subtype": "Member-New-Share",
"version": 13,
"versionDescription": "13"
},
{
"id": "0BB2F391-9F37-4ED4-A433-2046AC14C33D",
"templateId": "0BB2F391-9F37-4ED4-A433-2046AC14C33D",
"recordState": "Active",
"name": "CUNA Member New Share",
"description": "Core product template used to add shares to an existing membership account. 2023-11-16",
"category": "B2B",
"type": "Account Opening",
"subtype": "Member-New-Share",
"version": 14,
"versionDescription": "14"
},
{
"id": "3AD242BF-73E6-436F-B5B2-A985608E555C",
"templateId": "3AD242BF-73E6-436F-B5B2-A985608E555C",
"recordState": "Active",
"name": "CUNA Member New Share",
"description": "Core product template used to add shares to an existing membership account. 2023-12-14",
"category": "B2B",
"type": "Account Opening",
"subtype": "Member-New-Share",
"version": 15,
"versionDescription": "15"
},
{
"id": "DBCD99F2-03A7-49C4-B9B5-6EDE6ED0F7D3",
"templateId": "DBCD99F2-03A7-49C4-B9B5-6EDE6ED0F7D3",
"recordState": "Active",
"name": "CUNA Member New Share",
"description": "Core product template used to add shares to an existing membership account. 2024-01-10",
"category": "B2B",
"type": "Account Opening",
"subtype": "Member-New-Share",
"version": 16,
"versionDescription": "16"
},
{
"id": "9AB8B53B-B5A1-4A02-93B8-ECFF443F9B00",
"templateId": "9AB8B53B-B5A1-4A02-93B8-ECFF443F9B00",
"recordState": "Active",
"name": "CUNA Membership Savings",
"description": "Core product template used to define a base Membership Savings 2023-10-19",
"category": "Deposit",
"type": "Savings",
"subtype": "Savings",
"version": 1,
"versionDescription": "1"
},
{
"id": "200840E2-E4BB-46ED-A56E-7399FEBE47B0",
"templateId": "200840E2-E4BB-46ED-A56E-7399FEBE47B0",
"recordState": "Active",
"name": "CUNA Membership Savings",
"description": "Core product template used to define a base Membership Savings 2023-11-16",
"category": "Deposit",
"type": "Savings",
"subtype": "Savings",
"version": 2,
"versionDescription": "2"
},
{
"id": "AB55E41C-6DD6-4CE7-B1AC-B00C7E883559",
"templateId": "AB55E41C-6DD6-4CE7-B1AC-B00C7E883559",
"recordState": "Active",
"name": "CUNA Membership Savings",
"description": "Core product template used to define a base Membership Savings 2024-01-10",
"category": "Deposit",
"type": "Savings",
"subtype": "Savings",
"version": 3,
"versionDescription": "3"
},
{
"id": "DEE1568B-6010-49AF-9122-59DDD19760C4",
"templateId": "DEE1568B-6010-49AF-9122-59DDD19760C4",
"recordState": "Active",
"name": "CUNA Money Market",
"description": "Core product template used to define a base Money Market 2023-11-16",
"category": "Deposit",
"type": "Savings",
"subtype": "Money Market",
"version": 1,
"versionDescription": "1"
},
{
"id": "8A7144CC-7D21-447C-8583-673A5B139949",
"templateId": "8A7144CC-7D21-447C-8583-673A5B139949",
"recordState": "Active",
"name": "CUNA Money Market",
"description": "Core product template used to define a base Money Market 2024-01-10",
"category": "Deposit",
"type": "Savings",
"subtype": "Money Market",
"version": 2,
"versionDescription": "2"
},
{
"id": "E80EF3B9-F9F7-4A7F-8045-3D2E10663178",
"templateId": "E80EF3B9-F9F7-4A7F-8045-3D2E10663178",
"recordState": "Active",
"name": "CUNA MRC Protection Product, Product Template",
"description": "Core product template used for standalone MRC products 2023-03-09",
"category": "Protection Product",
"type": "Warranty",
"subtype": "MRC",
"version": 1,
"versionDescription": "1"
},
{
"id": "EBDDA0A3-9ECF-4F08-A7A3-FBAD73B95C70",
"templateId": "EBDDA0A3-9ECF-4F08-A7A3-FBAD73B95C70",
"recordState": "Active",
"name": "CUNA MRC Protection Product, Product Template",
"description": "Core product template used for standalone MRC products 2023-05-04",
"category": "Protection Product",
"type": "Warranty",
"subtype": "MRC",
"version": 2,
"versionDescription": "2"
},
{
"id": "6D813240-2AEA-4CA1-AF34-4F594F95868D",
"templateId": "6D813240-2AEA-4CA1-AF34-4F594F95868D",
"recordState": "Active",
"name": "CUNA MRC Protection Product, Product Template",
"description": "Core product template used for standalone MRC products 2024-01-10",
"category": "Protection Product",
"type": "Warranty",
"subtype": "MRC",
"version": 3,
"versionDescription": "3"
},
{
"id": "955DAC7A-1461-416C-A5A4-465753551A66",
"templateId": "955DAC7A-1461-416C-A5A4-465753551A66",
"recordState": "Active",
"name": "CUNA Multi-Vehicle Product Template",
"description": "Core product template used to create multi-vehicle loan products 2023-03-09",
"category": "Lending",
"type": "Recreational",
"subtype": "Recreational",
"version": 23,
"versionDescription": "23"
},
{
"id": "B8CAF7C4-C7BA-4ED8-A2B5-D6EEA75BD20F",
"templateId": "B8CAF7C4-C7BA-4ED8-A2B5-D6EEA75BD20F",
"recordState": "Active",
"name": "CUNA Multi-Vehicle Product Template",
"description": "Core product template used to create multi-vehicle loan products 2023-06-01",
"category": "Lending",
"type": "Recreational",
"subtype": "Recreational",
"version": 26,
"versionDescription": "26"
},
{
"id": "FE8883E1-ABA3-45DD-A885-1A2AE8621D03",
"templateId": "FE8883E1-ABA3-45DD-A885-1A2AE8621D03",
"recordState": "Active",
"name": "CUNA Multi-Vehicle Product Template",
"description": "Core product template used to create multi-vehicle loan products 2023-11-16",
"category": "Lending",
"type": "Recreational",
"subtype": "Recreational",
"version": 27,
"versionDescription": "27"
},
{
"id": "4CDAC858-327C-48BF-B697-C4AB69057758",
"templateId": "4CDAC858-327C-48BF-B697-C4AB69057758",
"recordState": "Active",
"name": "CUNA Multi-Vehicle Product Template",
"description": "Core product template used to create multi-vehicle loan products 2o24-01-10",
"category": "Lending",
"type": "Recreational",
"subtype": "Recreational",
"version": 28,
"versionDescription": "28"
},
{
"id": "24F5AA14-9497-4CD9-8F4D-B59A020F0652",
"templateId": "24F5AA14-9497-4CD9-8F4D-B59A020F0652",
"recordState": "Active",
"name": "CUNA New Auto Loan, Product Template",
"description": "Core product template used to create auto loan products for new cars, trucks, suVs, etc. 2024-01-10",
"category": "Lending",
"type": "Auto",
"subtype": "New",
"version": 118,
"versionDescription": "118"
},
{
"id": "0EB4F391-83F7-44FC-8B11-F5551AD92AF8",
"templateId": "0EB4F391-83F7-44FC-8B11-F5551AD92AF8",
"recordState": "Active",
"name": "CUNA New Member New Share",
"description": "Core product template used to add shares to a new membership account. 2023-10-19",
"category": "B2B",
"type": "Account Opening",
"subtype": "New-Member",
"version": 4,
"versionDescription": "4"
},
{
"id": "5ADE6D5D-1AED-4318-9AA3-0F8F1302F812",
"templateId": "5ADE6D5D-1AED-4318-9AA3-0F8F1302F812",
"recordState": "Active",
"name": "CUNA New Member New Share",
"description": "Core product template used to add shares to a new membership account. 2023-11-16",
"category": "B2B",
"type": "Account Opening",
"subtype": "New-Member",
"version": 5,
"versionDescription": "5"
},
{
"id": "21CDA0AA-1BE6-4453-B484-DE94DD470307",
"templateId": "21CDA0AA-1BE6-4453-B484-DE94DD470307",
"recordState": "Active",
"name": "CUNA New Member New Share",
"description": "Core product template used to add shares to a new membership account. 2024-01-10",
"category": "B2B",
"type": "Account Opening",
"subtype": "New-Member",
"version": 6,
"versionDescription": "6"
},
{
"id": "6524D126-0E46-498C-905C-02100931122B",
"templateId": "6524D126-0E46-498C-905C-02100931122B",
"recordState": "Active",
"name": "CUNA Overdraft Line of Credit, Product Template",
"description": "Core product template for overdraft line of credit products 2023-11-16",
"category": "Lending",
"type": "Personal",
"subtype": "Overdraft Line of Credit",
"version": 27,
"versionDescription": "27"
},
{
"id": "2F42BA9D-3B66-4833-BC36-554F036C1A7E",
"templateId": "2F42BA9D-3B66-4833-BC36-554F036C1A7E",
"recordState": "Active",
"name": "CUNA Overdraft Line of Credit, Product Template",
"description": "Core product template for overdraft line of credit products 2024-01-10",
"category": "Lending",
"type": "Personal",
"subtype": "Overdraft Line of Credit",
"version": 28,
"versionDescription": "28"
},
{
"id": "F3C7941E-BC02-40F8-9781-266176E791F8",
"templateId": "F3C7941E-BC02-40F8-9781-266176E791F8",
"recordState": "Active",
"name": "CUNA Personal Line of Credit, Product Template",
"description": "Core product template for personal line of credit products 2023-11-16",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Line of Credit",
"version": 23,
"versionDescription": "23"
},
{
"id": "A65AFFD6-0F64-4B86-A128-2A2C1454AA24",
"templateId": "A65AFFD6-0F64-4B86-A128-2A2C1454AA24",
"recordState": "Active",
"name": "CUNA Personal Line of Credit, Product Template",
"description": "Core product template for personal line of credit products 2024-01-10",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Line of Credit",
"version": 24,
"versionDescription": "24"
},
{
"id": "A4CA93EA-C61D-4A09-AAB5-903B96A6D5F0",
"templateId": "A4CA93EA-C61D-4A09-AAB5-903B96A6D5F0",
"recordState": "Active",
"name": "CUNA Personal Loan, Product Template",
"description": "Core product template for personal loan products 2023-11-16",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Loan",
"version": 23,
"versionDescription": "23"
},
{
"id": "D65ECC99-1037-4193-A7B0-FF313A204A1C",
"templateId": "D65ECC99-1037-4193-A7B0-FF313A204A1C",
"recordState": "Active",
"name": "CUNA Personal Loan, Product Template",
"description": "Core product template for personal loan products 2024-01-10",
"category": "Lending",
"type": "Personal",
"subtype": "Personal Loan",
"version": 24,
"versionDescription": "24"
},
{
"id": "F362AFC3-B415-4269-AD44-E8F21706D4AF",
"templateId": "F362AFC3-B415-4269-AD44-E8F21706D4AF",
"recordState": "Active",
"name": "CUNA Refinance Auto Loan, Product Template",
"description": "Core product template used to create auto loan products for refinancingloans on cars, trucks, SuVs, etc. 2023-11-16",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance",
"version": 26,
"versionDescription": "26"
},
{
"id": "6852171C-E9B1-4CAC-9227-3F1C9A7035AE",
"templateId": "6852171C-E9B1-4CAC-9227-3F1C9A7035AE",
"recordState": "Active",
"name": "CUNA Refinance Auto Loan, Product Template",
"description": "Core product template used to create auto loan products for refinancing loans on cars, trucks, SUVs, etc. 2024-01-10",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance",
"version": 27,
"versionDescription": "27"
},
{
"id": "2C9B8B7F-B836-4439-80AC-F2F4013ABF60",
"templateId": "2C9B8B7F-B836-4439-80AC-F2F4013ABF60",
"recordState": "Active",
"name": "CUNA Refinance Cash Out Auto Loan Product Template",
"description": "Core product template used to create auto loan products for refinancingcash out loans on cars, trucks, suVs, etc. 2023-11-16",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance - Cash Out",
"version": 26,
"versionDescription": "26"
},
{
"id": "E4649D8A-D36F-4634-80B6-5EFA54D84F73",
"templateId": "E4649D8A-D36F-4634-80B6-5EFA54D84F73",
"recordState": "Active",
"name": "CUNA Refinance Cash Out Auto Loan Product Template",
"description": "Core product template used to create auto loan products for refinancingcash out loans on cars, trucks, suVs, etc. 2024-01-10",
"category": "Lending",
"type": "Auto",
"subtype": "Refinance - Cash Out",
"version": 27,
"versionDescription": "27"
},
{
"id": "61042D9B-7E75-40AF-A7AC-0BD3F231B750",
"templateId": "61042D9B-7E75-40AF-A7AC-0BD3F231B750",
"recordState": "Active",
"name": "CUNA Secured Consumer Loan, Product Template",
"description": "Core product template used for secured consumer loan products 2023-03-27",
"category": "Lending",
"type": "Secured",
"subtype": "Secured",
"version": 19,
"versionDescription": "19"
},
{
"id": "8984E137-9C96-40D6-80CD-25F60CE1D74C",
"templateId": "8984E137-9C96-40D6-80CD-25F60CE1D74C",
"recordState": "Active",
"name": "CUNA Secured Consumer Loan, Product Template",
"description": "Core product template used for secured consumer loan products 2023-06-01",
"category": "Lending",
"type": "Secured",
"subtype": "Secured",
"version": 21,
"versionDescription": "21"
},
{
"id": "58EE46AE-EB6D-471A-B2A8-3CC4C2ED4F38",
"templateId": "58EE46AE-EB6D-471A-B2A8-3CC4C2ED4F38",
"recordState": "Active",
"name": "CUNA Secured Consumer Loan, Product Template",
"description": "Core product template used for secured consumer loan products 2024-01-10",
"category": "Lending",
"type": "Secured",
"subtype": "Secured",
"version": 22,
"versionDescription": "22"
},
{
"id": "8EF9E2FE-26DC-4B14-BFEC-8071E90F339B",
"templateId": "8EF9E2FE-26DC-4B14-BFEC-8071E90F339B",
"recordState": "Active",
"name": "CUNA Share Certificate",
"description": "Core product template used to define share certificates 2023-10-19",
"category": "Deposit",
"type": "Certificate",
"subtype": "Certificate",
"version": 5,
"versionDescription": "5"
},
{
"id": "07921F25-E77D-4D9C-BC8D-457BE4FD29C2",
"templateId": "07921F25-E77D-4D9C-BC8D-457BE4FD29C2",
"recordState": "Active",
"name": "CUNA Share Certificate",
"description": "Core product template used to define share certificates 2023-11-16",
"category": "Deposit",
"type": "Certificate",
"subtype": "Certificate",
"version": 6,
"versionDescription": "6"
},
{
"id": "AC21A2E3-1699-4616-9C35-975DF5E73A5B",
"templateId": "AC21A2E3-1699-4616-9C35-975DF5E73A5B",
"recordState": "Active",
"name": "CUNA Share Certificate",
"description": "Core product template used to define share certificates 2023-12-14",
"category": "Deposit",
"type": "Certificate",
"subtype": "Certificate",
"version": 7,
"versionDescription": "7"
},
{
"id": "4E4AF0BB-97CE-43C1-9B7A-4DF1DB6D65E6",
"templateId": "4E4AF0BB-97CE-43C1-9B7A-4DF1DB6D65E6",
"recordState": "Active",
"name": "CUNA Share Certificate",
"description": "Core product template used to define share certificates 2024-01-10",
"category": "Deposit",
"type": "Certificate",
"subtype": "Certificate",
"version": 8,
"versionDescription": "8"
},
{
"id": "7347F788-1294-49FD-B936-D6723DC08228",
"templateId": "7347F788-1294-49FD-B936-D6723DC08228",
"recordState": "Active",
"name": "CUNA Unsecured Personal Loan, Product Template",
"description": "Core product template used for unsecured personal loans 2023-11-16",
"category": "Lending",
"type": "Personal",
"subtype": "Unsecured",
"version": 23,
"versionDescription": "23"
},
{
"id": "7BEF8528-A308-4537-BFD0-279E5AF5FC9E",
"templateId": "7BEF8528-A308-4537-BFD0-279E5AF5FC9E",
"recordState": "Active",
"name": "CUNA Unsecured Personal Loan, Product Template",
"description": "Core product template used for unsecured personal loans 2024-01-10",
"category": "Lending",
"type": "Personal",
"subtype": "Unsecured",
"version": 24,
"versionDescription": "24"
},
{
"id": "26C3EAE6-7FEA-4311-90BF-3EB70197DF0A",
"templateId": "26C3EAE6-7FEA-4311-90BF-3EB70197DF0A",
"recordState": "Active",
"name": "CUNA Used Auto Loan, Product Template",
"description": "Core product template used to create auto loan products for used cars,trucks, SuVs, etc. 2023-11-16",
"category": "Lending",
"type": "Auto",
"subtype": "Used",
"version": 26,
"versionDescription": "26"
},
{
"id": "BD964069-F3EB-45D3-B217-87CABE270D34",
"templateId": "BD964069-F3EB-45D3-B217-87CABE270D34",
"recordState": "Active",
"name": "CUNA Used Auto Loan, Product Template",
"description": "Core product template used to create auto loan products for used cars,trucks, suVs, etc. 2024-01-10",
"category": "Lending",
"type": "Auto",
"subtype": "Used",
"version": 27,
"versionDescription": "27"
},
{
"id": "28FC6C72-AB0F-449E-B722-2B0159D9FEF5",
"templateId": "28FC6C72-AB0F-449E-B722-2B0159D9FEF5",
"recordState": "Active",
"name": "CUNA Wildcard Template",
"description": "Core product template used for wildcard products 2023-06-01",
"category": "Lending",
"type": "Wildcard",
"subtype": "Wildcard",
"version": 3,
"versionDescription": "3"
},
{
"id": "24189695-02F8-480C-8366-11E5C1F24BA8",
"templateId": "24189695-02F8-480C-8366-11E5C1F24BA8",
"recordState": "Active",
"name": "CUNA Wildcard Template",
"description": "Core product template used for wildcard products 2024-01-10",
"category": "Lending",
"type": "Wildcard",
"subtype": "Wildcard",
"version": 4,
"versionDescription": "4"
},
{
"id": "086FD17C-479D-4D3D-83F3-F8199950E511",
"templateId": "086FD17C-479D-4D3D-83F3-F8199950E511",
"recordState": "Active",
"name": "Leads API Core product, Product Template",
"description": "Core product template used for Leads API products 2023-11-16",
"category": "Api",
"type": "External",
"subtype": "Leads",
"version": 1,
"versionDescription": "1"
},
{
"id": "88FC99A7-DFF9-4EA8-8F02-4388AEB3290B",
"templateId": "88FC99A7-DFF9-4EA8-8F02-4388AEB3290B",
"recordState": "Active",
"name": "Offer API Core product template, Product Template",
"description": "Core product template used for Offer API products 2023-08-04",
"category": "Api",
"type": "External",
"subtype": "Offers",
"version": 1,
"versionDescription": "1"
}
]
}

```
<!-- CODESCAN_FILE_END -->

---

### 429. `C:\DevCode\AstroUI\src\components\MapCoreProductTemplates\MapCoreProductTemplates.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapCoreProductTemplates\MapCoreProductTemplates.tsx" type=".tsx" size="8724" lines="308" chars="8724" -->
```typescript
import React, { useContext, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { useAppContext } from 'context/app-context';
import { client2 } from 'utils/api-client';
import {
Table,
CoreCheckBox,
DynamicNotification,
Core,
NotificationDisplay,
NotificationContext,
} from 'commonui';
import { SCHeader } from '../TableStyles';
import { useParams } from 'react-router-dom';

export const MapCoreProductTemplates = () => {
const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();

  const { addNotification, clearAllNotifications } =
useContext(NotificationContext);
const [loading, setLoading] = useState(true);
const [fetchError, setFetchError] = useState(false);
const [templates, setTemplates] = useState<any[]>([]);
const [assigned, setAssigned] = useState<any[]>([]);
const [tenantUUID, setTenantUUID] = useState('');
const [freeze, setFreeze] = useState(true);
const [usedTemplateIds, setUsedTemplateIds] = useState<
Set<string> | undefined
>(undefined);

  const titleList = new Map();

  function note(msg: any) {
addNotification({
message: msg,
type: Core.NotificationType.SUCCESS,
display: NotificationDisplay.GLOBAL,
dismissable: true,
    }};
setTimeout(clearAllNotifications, 3000);
}

  const getCoreProducts = async (): Promise<any[] | undefined> => {
const config = { headers: { 'X-TENANT-ID': tenant?.id } };

    const productInfos = await client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-products?recordState[]=Active`,
'GET',
config,
    ];

    return productInfos.payload;
};

  const getUsedTemplates = async (): Promise<void> => {
try {
const productInfos = await getCoreProducts();
if (!productInfos) return;
setUsedTemplateIds(
new Set<string>(productInfos.map((p) => p.templateId.toUpperCase())),
      ];
} catch (error) {
console.log(error);
}
};

  const removeMapping = (id: string) => {
const config = { headers: { 'X-TENANT-ID': tenantUUID } };
client2(
'${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}tenant-core-product-template-assignments/${id}',
'DELETE',
config,
    ]
.then((data) => {
console.log(`Template ${id} removed.`);
note(`Template ${id} removed.`);
      }]
.catch((error) => {
console.log(error);
setFetchError(true);
      }];
};

  const addMapping = (id: string) => {
const config = { headers: { 'X-TENANT-ID': tenantUUID } };
client2(
'${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}tenant-core-product-template-assignments/${id}',
'POST',
config,
    ]
.then((data) => {
console.log(`Template ${id} added.`);
note(`Template ${id} added.`);
      }]
.catch((error) => {
console.log(error);
setFetchError(true);
      }];
};

  const params = useParams();
useEffect(() => {
if (!loading) return;
setDisplayCreateButton(false);

    const tenantId = params.tenantId ?? '';

    setTenantUUID(tenantId);
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(
`Configure Core Product Template Assignments`,
`/admin/tenant/${tenantId}/map-core-product-templates`,
    ];
setPageTitle(titleList);

    const getMappingsFunc = async (tenantId: string): Promise<void> => {
const data = await getMappings(tenantId);
const tempA: any = [];
if (data.payload.length > 0) {
data.payload.map((d: any) => {
tempA.push(d.id);
        }];
}
setAssigned(tempA);
const allTemplatesResponse = await getAllTemplates(tenantId);
setTemplates(allTemplatesResponse.payload);
setFreeze(false);
};

    const fetchConfigurations = async (tenantId: string): Promise<void> => {
await getMappingsFunc(tenantId);
await getUsedTemplates();
setLoading(false);
};

    fetchConfigurations(tenantId).catch((error) => {
console.log(error);
setFetchError(true);
setLoading(false);
    }};
}, []);

  const formatdata = (templates: any) => {
return (
templates &&
templates.map(
        [{
id,
lastUpdatedDate,
name,
description,
category,
type,
subtype,
version,
recordState,
}: any) => {
const isItemSelected =
assigned && assigned.indexOf(id) > -1 ? true : false;
return {
id,
lastUpdated: DateTime.fromISO(lastUpdatedDate).toRelative() ?? '',
lastUpdatedValue: new Date(lastUpdatedDate).valueOf(),
name,
description,
category,
type,
subtype,
version,
recordState,
status: (
<CoreCheckBox
ariaLabel="Assign Core Product Template"
id={id + '_check'}
disabled={
                   !usedTemplateIds Il
(isItemSelected && usedTemplateIds.has(id.toUpperCase()))
}
checked={isItemSelected}
onChange={(checked): void => {
const index = assigned.indexOf(id) > -1 ? true : false;
if (!checked && index) {
removeMapping(id);
const newA = assigned.slice();
newA.splice(assigned.indexOf(id), 1);
setAssigned(newA);
} else {
addMapping(id);
const newA = assigned.slice();
newA.push(id);
setAssigned(newA);
}
}}
/>
            },
};
},
      ]
    ];
};

  if (loading) {
return <div />;
}

  if (templates && templates.length > 0) {
const staticColumn = {
filterable: false,
sortable: false,
};
return (
<div>
<DynamicNotification limit={1} />
<Table
data={formatdata(templates)}
defaultSort={{ column: 'lastUpdated', direction: 'desc' }}
filterable
sortable
pageSize={25}
columns={[
{
Header: <SCHeader>Last Updated</SCHeader>,
accessor: 'lastUpdated',
serialize: ({ lastUpdatedValue }: any) => lastUpdatedValue,
filterable: false,
},
{
Header: <SCHeader>Name</SCHeader>,
accessor: 'name',
filterable: true,
sortable: true,
maxWidth: '150px',
},
{
Header: <SCHeader>Description</SCHeader>,
accessor: 'description',
sortable: true,
filterable: false,
},
{
Header: <SCHeader>Category</SCHeader>,
accessor: 'category',
filterable: true,
sortable: true,
},
{
Header: <SCHeader>Type</SCHeader>,
accessor: 'type',
filterable: true,
sortable: true,
},
{
Header: <SCHeader>Sub-Type</SCHeader>,
accessor: 'subtype',
filterable: true,
sortable: true,
},
{
Header: <SCHeader>Version</SCHeader>,
accessor: 'version',
filterable: false,
maxWidth: '80px',
sortable: true,
},
{
Header: <SCHeader>State</SCHeader>,
accessor: 'recordState',
filterable: false,
sortable: true,
},
{
...staticColumn,
Header: <SCHeader>Assigned</SCHeader>,
accessor: 'status',
filterable: false,
maxWidth: '110px',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
        [>
</div>
    ];
} else {
return null;
}
};
const getMappings = (tenantId: string) => {
const config = { headers: { 'X-TENANT-ID': tenantId } };
return client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}tenant-core-product-templates`,
'GET',
config,
  ];
};

const getAllTemplates = (tenantId: string) => {
return client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-product-templates`,
'GET',
  ];
};

```
<!-- CODESCAN_FILE_END -->

---

### 430. `C:\DevCode\AstroUI\src\components\MapLoanTemplates\__test__\MapLoanTemplates.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapLoanTemplates\__test__\MapLoanTemplates.test.tsx" type=".tsx" size="3800" lines="128" chars="3800" -->
```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationContext } from 'commonui';
import { AppContext } from 'context/app-context';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import MapLoanTemplates from '../MapLoanTemplates';

const mockPush = jest.fn();
jest.setTimeout(30000);
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: (): any => ({ tenantId: '1dd6b431-de32-4492-a78b-eeced1c5f881' }),
useNavigate: () => mockPush,
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}];
describe('MapLoanTemplates', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
beforeEach(() => {
jest.clearAllMocks();
  }};

  const addNotification = jest.fn();
const appContextMocks: any = {
setPageTitle: jest.fn(),
setDisplayCreateButton: jest.fn(),
createButtonClicked: false,
setCreateButtonClicked: jest.fn(),
};

  const wrapper = ({
children,
}: {
children?: React.ReactNode;
}): JSX.Element => (
<AppContext.Provider value={appContextMocks}>
<NotificationContext.Provider
value={
{
addNotification,
clearAllNotifications: jest.fn(),
notificationList: [],
} as any
}
>
<BrowserRouter>{children}</BrowserRouter>
</NotificationContext.Provider>
</AppContext.Provider>
  ];

  const createTemplate = (id: number): any => ({
id,
templateId: 'templateId',
isAssigned: 'false',
recordState: 'Active',
name: 'name',
description: 'description',
version: 1,
  }};

  it('should render two rows with no loan application templates', async () => {
const fetchedTemplates = {
payload: [],
};

    const mockJsonPromise = Promise.resolve(fetchedTemplates);

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
} as Response | Promise<Response>);

    render(<MapLoanTemplates />, { wrapper });
// rows = header + numRows eg: 1 + 0
await waitFor(() => {
expect(fetchSpy).toHaveBeenCalled();
    }};
await waitFor(() => {
expect(screen.getAllByRole('row').length).toEqual(1);
    }};
  }};
it('should render with a list of loan application templates', async () => {
const fetchedTemplates = {
payload: Array.from(Array(1).keys()).map(createTemplate),
};

    const mockJsonPromise = Promise.resolve(fetchedTemplates);

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
} as Response | Promise<Response>);

    render(<MapLoanTemplates />, { wrapper });
// rows = header + numRows eg: 1 + 1
await waitFor(() => {
expect(fetchSpy).toHaveBeenCalled();
    }};
await waitFor(() => {
expect(screen.getAllByRole('row').length).toEqual(2);
    }};
}, 10000);
it('should trigger an add and remove notification when checkbox is clicked', async () => {
const fetchedTemplates = {
payload: Array.from(Array(1).keys()).map(createTemplate),
};

    const mockJsonPromise = Promise.resolve(fetchedTemplates);

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
} as Response | Promise<Response>);
jest.useFakeTimers();
// There is a timeout to clear the notification
render(<MapLoanTemplates />, { wrapper });
await screen.findByRole('checkbox');
fireEvent.click(screen.getByRole('checkbox'));
await waitFor(() => expect(addNotification).toHaveBeenCalled());
fireEvent.click(screen.getByRole('checkbox'));
await waitFor(() => expect(addNotification).toHaveBeenCalled());
jest.useRealTimers();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 431. `C:\DevCode\AstroUI\src\components\MapLoanTemplates\MapLoanTemplates.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapLoanTemplates\MapLoanTemplates.tsx" type=".tsx" size="4097" lines="149" chars="4097" -->
```typescript
import React, { ReactElement } from 'react';
import {
CoreCheckBox,
DynamicNotification,
Table,
Spinner,
DynamicInputField,
} from 'commonui';
import { DateTime } from 'luxon';
import {
SCHeader,
SCNotificationContainer,
SCStatus,
} from 'components/TableStyles';
import { LoanFormTemplate } from './types';
import { SCMapLoanTemplatesSpinnerContainer, SCTableContainer } from './styles';
import { useMapLoanTemplates } from './useMapLoanTemplates';
import { useParams } from 'react-router-dom';

const MapLoanTemplates = (): ReactElement => {
const tenantUUID = useParams().tenantId;
if (!tenantUUID) throw new Error('Could not find tenant id from app context');

  const {
addMapping,
dateFilter,
removeMapping,
setDateFilter,
templates,
loading,
} = useMapLoanTemplates(tenantUUID);

  const formatRows = (payload: any[]) =>
payload.map(
      [{
templateId,
isAssigned,
name,
description,
version,
recordState,
templateCreateDate,
}: LoanFormTemplate) => ({
id: templateId,
templateId,
isAssigned,
name,
description,
version,
templateCreateDate:
DateTime.fromISO(templateCreateDate).toRelative() ?? '',
templateCreateDateValue: new Date(templateCreateDate).valueOf(),
assigned: (
<CoreCheckBox
ariaLabel={`Assign template ${templateId}`}
id={`${templateId}_check`}
checked={isAssigned === 'true'}
onChange={handleChange(templateId, isAssigned)}
          [>
}),
status: <SCStatus status={recordState}>{recordState}</SCStatus>,
      }],
    ];

  const handleChange = (id: string, isAssigned: string) => () => {
if (isAssigned === 'true') {
removeMapping(id);
} else {
addMapping(id);
}
};

  const staticColumn = {
filterable: false,
sortable: false,
};

  return (
    >>
<SCNotificationContainer>
<DynamicNotification limit={1} />
</SCNotificationContainer>
<SCTableContainer>
<DynamicInputField
validateAllFields
dataField={{
fieldType: 'date',
fieldCode: 'date-filter',
fieldLabel: 'Templates after Date',
}}
value={dateFilter}
onChange={(_, newDate) => {
setDateFilter(newDate);
}}
        [>
{loading ? (
<SCMapLoanTemplatesSpinnerContainer>
<Spinner width={150} height={150} />
</SCMapLoanTemplatesSpinnerContainer>
        } ; {
<Table
data={formatRows(Object.values(templates))}
defaultSort={{ column: 'templateCreateDate', direction: 'desc' }}
filterable
sortable
columns={[
{
Header: <SCHeader>Template Create Date</SCHeader>,
accessor: 'templateCreateDate',
filterable: false,
serialize: ({ templateCreateDateValue }) =>
templateCreateDateValue,
},
{
Header: <SCHeader>Name</SCHeader>,
accessor: 'name',
},
{
Header: <SCHeader>Version</SCHeader>,
accessor: 'version',
},
{
Header: <SCHeader>Description</SCHeader>,
accessor: 'description',
},
{
...staticColumn,
Header: <SCHeader>Status</SCHeader>,
maxWidth: '100px',
accessor: 'status',
},
{
sortable: true,
Header: <SCHeader>Assigned</SCHeader>,
accessor: 'assigned',
filterable: false,
maxWidth: '150px',
serialize: ({ isAssigned }) => isAssigned,
},
]}
          [>
        }}
</SCTableContainer>
</>
  ];
};

export default MapLoanTemplates;

```
<!-- CODESCAN_FILE_END -->

---

### 432. `C:\DevCode\AstroUI\src\components\MapLoanTemplates\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapLoanTemplates\styles.ts" type=".ts" size="252" lines="14" chars="252" -->
```typescript
import styled from 'styled-components';

export const SCMapLoanTemplatesSpinnerContainer = styled.div`
width: 100%;
display: flex;
justify-content: center;
`;

export const SCTableContainer = styled.div`
> div {
margin-bottom: 24px;
}
`;

```
<!-- CODESCAN_FILE_END -->

---

### 433. `C:\DevCode\AstroUI\src\components\MapLoanTemplates\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapLoanTemplatesItypes.ts" type=".ts" size="295" lines="15" chars="295" -->
```typescript
export interface FormattedData extends Record<string, any> {
id: string;
}

export interface LoanFormTemplate {
id: string;
templateId: string;
isAssigned: 'true' | 'false';
recordState: string;
name: string;
description: string;
version: number;
templateCreateDate: string;
}

```
<!-- CODESCAN_FILE_END -->

---

### 434. `C:\DevCode\AstroUI\src\components\MapLoanTemplates\useMapLoanTemplates.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\MapLoanTemplates\useMapLoanTemplates.tsx" type=".tsx" size="4133" lines="142" chars="4133" -->
```typescript
import { Core, NotificationContext, NotificationDisplay } from 'commonui';
import { useAppContext } from 'context/app-context';
import { useContext, useEffect, useRef, useState } from 'react';
import { client2 } from 'utils/api-client';
import { FormattedData } from './types';
import { DateTime } from 'luxon';
import { debounce } from 'lodash';

const useMapLoanTemplates = (tenantUUID: string) => {
COnst TENANT_LOAN_FORM_TEMPLATE_ASSIGMENTS_URL ='${process.env.REACT_APP_LOAN_APP_FORMS_API_BASE_URL}tenant-loan-form-template-assignments';
const [templates, setTemplates] = useState<Record<string, FormattedData>>({});
const [loading, setLoading] = useState(false);
const { tenant, setPageTitle } = useAppContext();
const { addNotification, clearAllNotifications } =
useContext(NotificationContext);
const titleList = new Map();
const today = new Date();
const aMonthAgo = new Date(today.valueOf() - 1000 * 60 * 60 * 24 * 30);
const [dateFilter, setDateFilter] = useState(
DateTime.fromJSDate(aMonthAgo).toFormat('MM/dd/yyyy'),
  ];

  const getTemplateAssignments = async (
tenantId: string,
filter: string,
): Promise<void> => {
setLoading(true);
const config = { headers: { 'X-TENANT-ID': tenantId } };
const result = await client2(
`${TENANT_LOAN_FORM_TEMPLATE_ASSIGMENTS_URL}?afterDate=${new Date(
filter,
).toISOString()}`,
'GET',
config,
    ];

    if (result && result.payload) {
setTemplates(
result.payload.reduce((prev: any, curr: any) => {
return {
...prev,
[curr.templateId]: {
templateId: curr.templateId,
isAssigned: curr.isAssigned,
name: curr.name,
description: curr.description,
version: curr.version,
recordState: curr.recordState,
templateCreateDate: curr.templateCreateDate,
},
};
        ()
      ];
setLoading(false);
}
};

  const debouncedGetTemplateAssignments = useRef(
debounce(getTemplateAssignments, 200),
  ];

  useEffect(() => {
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenant?.id}/view`,
      ];
titleList.set(
`Configure Loan Application Template Assignments`,
`/admin/tenant/${tenant?.id}/map-loan-templates`,
    ];
setPageTitle(titleList);
}, []);

  useEffect(() => {
if (
/\d{2}\/\d{2}\/\d{4}/.test(dateFilter) &&
!isNaN(new Date(dateFilter).valueOf())
    ] {
debouncedGetTemplateAssignments.current(tenantUUID, dateFilter);
}
}, [dateFilter]);

  const toggleAssigned = (templateId: string, isAssigned: string) => {
setTemplates((templates) => ({
...templates,
[templateId]: { ...templates[templateId], isAssigned },
    }}];
};

  const setNote = (message: string): void => {
addNotification({
message,
type: Core.NotificationType.SUCCESS,
display: NotificationDisplay.GLOBAL,
dismissable: true,
    }};
    setTimeout(clearAllNotifications, 30oo);
};

const removeMapping = (id: string) => {
toggleAssigned(id, 'false');
const config = { headers: { 'X-TENANT-ID': tenantUUID } };
client2({
       '${TENANT_LOAN_FORM_TEMPLATE_ASSIGMENTS_URL}/${id},
'DELETE',
config,
    ]
.then(() => {
setNote(`Template ${id} removed.`);
      }]
.catch(() => {
setNote(`Template ${id} assignment error.`);
toggleAssigned(id, 'true');
      }];
};

  const addMapping = (id: string) => {
toggleAssigned(id, 'true');
const config = { headers: { 'X-TENANT-ID': tenantUUID } };
client2(`${TENANT_LOAN_FORM_TEMPLATE_ASSIGMENTS_URL}/${id}`, 'POST', config)
.then(() => {
setNote(`Template ${id} added.`);
      }]
.catch(() => {
setNote(`Template ${id} assignment error.`);
toggleAssigned(id, 'false');
      }];
};

  return {
addMapping,
removeMapping,
templates,
loading,
dateFilter,
setDateFilter,
};
};

export { useMapLoanTemplates };

```
<!-- CODESCAN_FILE_END -->

---

### 435.'C:\DevCode\AstrouI\src\components\Membershipl_test__l_snapshots__luseEligibility.test.tsx.sna

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__\__snapshots__\useEligibility.test.tsx.snap" type=".snap" size="2788" lines="105" chars="2788" -->
、、'snap
// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[`useEligibility should fetch eligibility questions 1`] = `
Object {
"addCustomIdentification": [Function],
"alert": null,
"discardChanges": [Function],
"handleSaveClicked": [Function],
"handleSaveDraftClicked": [Function],
"hasError": false,
"hideAlert": [Function],
"loading": false,
"model": Object {
"customIdentificationDocuments": Array [],
"identificationDocuments": Array [
Object {
"enabled": false,
"id": "testDocument",
},
Object {
"enabled": false,
"id": "testDocument2",
},
],
"membershipDetails": Array [
Object {
"description": "",
"key": "testDetail",
"value": "",
},
Object {
"description": "",
"key": "testDetail2",
"value": "",
},
],
"questionCategories": Array [
Object {
"enabled": true,
"id": "testCategory",
"name": "testCategory",
"questions": Array [
Object {
"customValue": "",
"enabled": true,
"fieldType": "",
"id": "testQuestion",
"responseOptions": "test",
"value": "",
},
Object {
"customValue": "",
"enabled": true,
"fieldType": "",
"id": "testQuestion2",
"responseOptions": "test",
"value": "",
},
],
},
Object {
"enabled": true,
"id": "testCategory2",
"name": "testCategory2",
"questions": Array [
Object {
"customValue": "",
"enabled": true,
"fieldType": "",
"id": "testQuestion3",
"responseOptions": "test",
"value": "",
},
],
},
],
"state": "Active",
},
"openConfirmationDialog": false,
"openEligibility": [Function],
"openErrorDialog": false,
"sendSaveRequest": [Function],
"serverMsg": null,
"setAlert": [Function],
"setCategoryProperty": [Function],
"setCustomIdentification": [Function],
"setDeleteCustomIdentification": [Function],
"setDetails": [Function],
"setHasError": [Function],
"setIdentification": [Function],
"setLoading": [Function],
"setModel": [Function],
"setOpenConfirmationDialog": [Function],
"setOpenErrorDialog": [Function],
"setQuestionProperty": [Function],
"setServerMsg": [Function],
"validate": [Function],
"validateAndSave": [Function],
}
`;

exports['useEligibility should validate custom documents: error1 1'] = '"Document name must bedefined"';

exports['useEligibility should validate custom documents: error2 1'] = '"Value must be lessthan 100 characters long."';

```
<!-- CODESCAN_FILE_END -->

---

### 436. `C:\DevCode\AstroUI\src\components\Membership\__test__\Eligibility.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__\Eligibility.test.tsx" type=".tsx" size="11417" lines="433" chars="11417" -->
```typescript
import React from 'react';
import Eligibility from '../Eligibility';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

describe('Eligibility', () => {
const fetchSpy: jest.SpyInstance = jest.spyOn(window, 'fetch');
beforeEach(() => {
global.document.createRange = () =>
      [{
setStart: () => {},
setEnd: () => {},
commonAncestorContainer: {
nodeName: 'BODY',
ownerDocument: document,
},
} as any);
  }};
afterEach(() => {
fetchSpy.mockClear();
  }};

  const mockMembershipPromise = Promise.resolve({
payload: {
state: 'Active',
questionCategories: [
{
id: 1,
name: 'Residency Questions',
areQuestionsGrouped: true,
questions: [
{
id: 1,
value: 'Are you a resident of one of the following cities?',
customValue: 'I am a resident of the following cities',
enabled: true,
categoryId: 1,
responseOptions: 'Chicago\nNew York\nMilwaukee',
},
],
enabled: true,
},
],
identificationDocuments: [
{
id: 1,
name: 'State Issues ID',
enabled: false,
},
],
customIdentificationDocuments: [
{
id: 1,
name: 'Custom ID',
enabled: true,
},
],
},
  }};

  test('Renders', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    const eligibility = render(
wrapWithMockContext('12345', <Eligibility {...props} />),
    ];

    const eligibilityContainer = await eligibility.findByRole(
'eligibility-container',
    ];

    expect(eligibilityContainer);
const saveDraftButton = screen.queryByRole('eligibility-save-draft');
expect(saveDraftButton).not.toBeInTheDocument();
  }};

  test('Renders for draft tenant', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />, 'Draft'));

    const eligibilityContainer = await screen.findByRole(
'eligibility-container',
    ];

    expect(eligibilityContainer);
const saveDraftButton = screen.getByRole('eligibility-save-draft');
expect(saveDraftButton).toBeInTheDocument();
  }};

  test('Save_click', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />));

    await screen.findByRole('eligibility-container');

    const saveButton = screen.getByRole('eligibility-save');
fireEvent.click(saveButton);
fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  }};

  test('Save_Draft_click', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    const mockMembershipPromise = Promise.resolve({
payload: {
state: 'Draft',
questionCategories: [
{
id: 1,
name: 'Residency Questions',
areQuestionsGrouped: true,
questions: [
{
id: 1,
value: 'Are you a resident of one of the following cities?',
customValue: 'I am a resident of the following cities',
enabled: true,
categoryId: 1,
responseOptions: 'Chicago\nNew York\nMilwaukee',
},
],
enabled: true,
},
],
identificationDocuments: [
{
id: 1,
name: 'State Issues ID',
enabled: false,
},
],
customIdentificationDocuments: [
{
id: 1,
name: 'Custom ID',
enabled: true,
},
],
},
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />));
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    await screen.findByRole('eligibility-container');

    const saveButton = screen.getByRole('eligibility-save-draft');
fireEvent.click(saveButton);
await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  }};

  test('Discard_click', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    const mockMembershipPromise = Promise.resolve({
payload: {
state: 'Active',
questionCategories: [
{
id: 1,
name: 'Residency Questions',
areQuestionsGrouped: true,
questions: [
{
id: 1,
value: 'Are you a resident of one of the following cities?',
customValue: 'I am a resident of the following cities',
enabled: true,
categoryId: 1,
responseOptions: 'Chicago\nNew York\nMilwaukee',
},
],
enabled: true,
},
],
identificationDocuments: [
{
id: 1,
name: 'State Issues ID',
enabled: false,
},
],
customIdentificationDocuments: [
{
id: 1,
name: 'Custom ID',
enabled: true,
},
],
},
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />));
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    await screen.findByRole('eligibility-container');

    const saveButton = screen.getByRole('eligibility-discard-changes');
fireEvent.click(saveButton);
  }};

  test('Add_Custom_Identification', async () => {
global.document.createRange = () =>
      [{
setStart: () => {},
setEnd: () => {},
commonAncestorContainer: {
nodeName: 'BODY',
ownerDocument: document,
},
} as any);

    const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};

    const mockMembershipPromise = Promise.resolve({
payload: {
state: 'Draft',
questionCategories: [],
identificationDocuments: [],
customIdentificationDocuments: [
{
id: 1,
name: 'Custom ID',
enabled: true,
},
],
},
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />));
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
await screen.findByRole('checkbox');

    const addButton = screen.getByText('+ ADD');
expect(addButton).toBeInTheDocument();
fireEvent.click(addButton);
await waitFor(() =>
expect(screen.queryAllByRole('checkbox')).toHaveLength(2),
    ];

    await screen.findByLabelText('Custom ID 2:');
fireEvent.change(screen.getByLabelText('Custom ID 2:'), {
target: { value: 'Custom Doc 2' },
    }};

    const checkboxes = screen.getAllByRole('checkbox');
const customDocCheck = checkboxes.find(
({ id }) => id === 'eligibility-custom-identification-checkbox1',
    ];
expect(customDocCheck).toBeDefined();
fireEvent.change(customDocCheck as any, { target: { checked: true } });
  }};

  test('Delete_Custom_Identification', async () => {
const props: any = {
match: { params: { tenantId: '12345' } },
history: {
location: {
pathname: '/admin/tenant/12345/membership',
},
},
};
const mockMembershipPromise = Promise.resolve({
payload: {
state: 'Draft',
questionCategories: [
{
id: 1,
name: 'Residency Questions',
areQuestionsGrouped: true,
questions: [
{
id: 1,
value: 'Are you a resident of one of the following cities?',
customValue: 'I am a resident of the following cities',
enabled: true,
categoryId: 1,
responseOptions: 'Chicago\nNew York\nMilwaukee',
},
],
enabled: true,
},
],
identificationDocuments: [
{
id: 1,
name: 'State Issues ID',
enabled: false,
},
],
customIdentificationDocuments: [
{
id: 1,
name: 'Custom ID',
enabled: true,
},
],
},
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockMembershipPromise,
    }};

    render(wrapWithMockContext('12345', <Eligibility {...props} />));

    const deleteCustomDocumentButton = await screen.findByRole('button', {
name: 'Delete custom identification document',
    }};
fireEvent.click(deleteCustomDocumentButton);
await waitFor(() =>
expect(
screen.queryByRole('eligibility-custom-identification-name1'),
).not.toBeInTheDocument(),
    ];
  }};

  function wrapWithMockContext(
tenantId: string,
component: any,
recordState = 'Active',
): any {
const mockContext = {
tenant: { id: tenantId, recordState },
setTenant: () => {},
withinTenantContext: (
tenantId: string,
successFunc: any,
failFunc: any,
) => {
successFunc();
},
setPageTitle: () => {},
setDisplayCreateButton: () => {},
setCreateButtonClicked: () => {},
createButtonClicked: true,
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<AuthContext.Provider value={mockAuthContext as any}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
    ];
}
}};

```
<!-- CODESCAN_FILE_END -->

---

### 437. `C:\DevCode\AstroUI\src\components\Membership\__test__\EligibilityDetails.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__\EligibilityDetails.test.tsx" type=".tsx" size="1013" lines="35" chars="1013" -->
```typescript
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EligibilityDetails from '../EligibilityDetails';

describe('EligibilityQuestionCategory', () => {
const mockDetail = {
id: 0,
description: 'description 1',
key: 'DESC-1',
value: 'value 1',
};
const props = {
model: [mockDetail],
setDetails: jest.fn(),
};
it('Show allow detail customization', async () => {
render(<EligibilityDetails {...props} />);
fireEvent.click(screen.getByText('DESC-1'));

    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
target: { value: 'new description' },
    }};
expect(props.setDetails).toHaveBeenCalledWith(mockDetail.key, {
description: 'new description',
    }};

    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), {
target: { value: 'new value' },
    }};
expect(props.setDetails).toHaveBeenCalledWith(mockDetail.key, {
value: 'new value',
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 438. `C:\DevCode\AstroUI\src\components\Membership\__test__\EligibilityQuestion.test.jsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__\EligibilityQuestion.test.jsx" type=".jsx" size="3861" lines="134" chars="3861" -->
```javascript
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import EligibilityQuestion from '../EligibilityQuestion';

describe('EligibilityQuestion', () => {
const props = {
model: {
enabled: true,
id: 'questionId',
value: 'Custom Question',
customValue: '',
responseOptions: '',
errors: '',
fieldType: 'single-select',
},
categoryId: 'testCategory',
setQuestionProperty: jest.fn(),
};

  test('Renders with a disabled question', async () => {
const testProps = {
...props,
model: {
...props.model,
enabled: false,
},
};

    render(<EligibilityQuestion {...testProps} />);

    // Every UI element in quetion component should be disabled
expect(
screen.getByRole('textbox', { name: 'Custom Question' }),
).toBeDisabled();

    expect(screen.getByRole('button', { name: 'Field Type' })).toBeDisabled();

    expect(
screen.getByRole('textbox', {
name: 'Configure available options. Values should be seperated by new line',
      }],
).toBeDisabled();
  }};

  test('Renders with a question', async () => {
render(<EligibilityQuestion {...props} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Custom Question' }), {
target: { value: 'test' },
    }};

    expect(props.setQuestionProperty).toHaveBeenCalledWith(
'testCategory',
'questionId',
{ customValue: 'test' },
    ];
  }};

  test('OnChange event fires for fieldType', async () => {
render(<EligibilityQuestion {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Field Type' }));
fireEvent.click(screen.getByRole('option', { name: 'single-question' }));

    expect(props.setQuestionProperty).toHaveBeenCalledWith(
'testCategory',
'questionId',
{ fieldType: 'single-question' },
    ];
  }};

  test('OnChange event fires for enabled switch', async () => {
render(<EligibilityQuestion {...props} />);
fireEvent.click(screen.getByRole('checkbox', { checked: true }));

    expect(props.setQuestionProperty).toHaveBeenCalledWith(
'testCategory',
'questionId',
{ enabled: false },
    ];
  }};

  test('OnChange event fires for options', async () => {
render(<EligibilityQuestion {...props} />);

    fireEvent.change(
screen.getByRole('textbox', {
name: 'Configure available options. Values should be seperated by new line',
      }],
{
target: { value: 'test' },
},
    ];

    expect(props.setQuestionProperty).toHaveBeenCalledWith(
'testCategory',
'questionId',
{ responseOptions: 'test' },
    ];
  }};

  test('FieldType should have correct options in list', () => {
render(<EligibilityQuestion {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Field Type' }));

    expect(screen.getByRole('option', { name: 'single-select' })).toBeTruthy();
expect(screen.getByRole('option', { name: 'text' })).toBeTruthy();
expect(
screen.getByRole('option', { name: 'single-question' }),
).toBeTruthy();
  }};

  test('Options should be hidden when fieldType === "text"', () => {
props.model.fieldType = 'text';
render(<EligibilityQuestion {...props} />);
const optionsElement = screen.queryByRole('textbox', {
name: 'Configure available options. Values should be seperated by new line',
    }};

    expect(optionsElement).toBeFalsy();
  }};

  test('Options should be show when fieldType !== "text"', () => {
props.model.fieldType = 'single-select';
render(<EligibilityQuestion {...props} />);
const optionsElement = screen.queryByRole('textbox', {
name: 'Configure available options. Values should be seperated by new line',
    }};

    expect(optionsElement).toBeTruthy();
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 439.'C:\DevCode\AstroUI\src\components\Membershipl_test__\EligibilityQuestionCategory.test.jsx'

<!-- CODESCAN_FILE_START -->
```javascript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EligibilityQuestionCategory from '../EligibilityQuestionCategory';

describe('EligibilityQuestionCategory', () => {
const props = {
model: {
enabled: true,
id: 'testCategory',
name: 'testCategory',
areQuestionsGrouped: true,
questions: [
{
enabled: true,
id: 'questionId',
value: 'Custom Question',
customValue: '',
responseOptions: '',
errors: '',
},
],
},
setQuestionProperty: jest.fn(),
setCategoryProperty: jest.fn(),
setCategoryGroupProperty: jest.fn(),
};
it('Should render open', async () => {
render(<EligibilityQuestionCategory {...props} />);
expect(
screen.queryByRole('textbox', { name: 'Custom Question' }),
).toBeInTheDocument();
  }};
test('Renders with a category label', async () => {
render(<EligibilityQuestionCategory {...props} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Category Label' }), {
target: { value: 'residence' },
    }};
expect(props.setCategoryProperty).toHaveBeenCalledWith('testCategory', {
name: 'residence',
    }};
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 440. `C:\DevCode\AstroUI\src\components\Membership\__test__\useEligibility.test.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__\useEligibility.test.tsx" type=".tsx" size="4899" lines="191" chars="4899" -->
```typescript
import { act, renderHook } from '@testing-library/react-hooks/dom';
import { waitFor } from '@testing-library/react';
import { useEligibility } from '../useEligibility';
import { wrapWithMockTenant } from 'components/__mock__/mock-context';
import * as api from 'utils/api-client';

describe('useEligibility', () => {
const client2Mock = jest.spyOn(api, 'client2');
const mockQuestion = {
enabled: true,
customValue: '',
id: 'testQuestion',
value: '',
responseOptions: 'test',
fieldType: '',
};

  const mockQuestion2 = {
...mockQuestion,
id: 'testQuestion2',
};

  const mockCategory = {
enabled: true,
id: 'testCategory',
name: 'testCategory',
questions: [mockQuestion, mockQuestion2],
};

  const mockCategory2 = {
enabled: true,
id: 'testCategory2',
name: 'testCategory2',
questions: [{ ...mockQuestion, id: 'testQuestion3' }],
};

  const mockDetail = {
key: 'testDetail',
description: '',
value: '',
};

  const mockDetail2 = {
...mockDetail,
key: 'testDetail2',
};

  const mockDocument = {
id: 'testDocument',
enabled: false,
};

  const mockDocument2 = {
id: 'testDocument2',
enabled: false,
};

  const mockPayload = {
state: 'Active',
questionCategories: [mockCategory, mockCategory2],
identificationDocuments: [mockDocument, mockDocument2],
customIdentificationDocuments: [],
membershipDetails: [mockDetail, mockDetail2],
};

  const wrapper = wrapWithMockTenant({ id: 'testId' });

  beforeEach(() => {
client2Mock.mockResolvedValue({ payload: mockPayload });
  }};
it('should fetch eligibility questions', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
expect(result.current.model.questionCategories).toHaveLength(
mockPayload.questionCategories.length,
    ];
expect(result.current).toMatchSnapshot();
  }};
it('update question property', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
act(() => {
result.current.setQuestionProperty('testCategory', 'testQuestion', {
fieldType: 'test',
      }];
    }};
expect(
result.current.model.questionCategories[0].questions[0].fieldType,
).toEqual('test');
  }};
it('update eligibility details', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
act(() => {
result.current.setDetails('testDetail', {
description: 'testDescription',
      }];
    }};
expect(result.current.model.membershipDetails[0].description).toEqual(
'testDescription',
    ];
  }};
it('update documents', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
expect(result.current.model.identificationDocuments[0].enabled).toEqual(
false,
    ];
act(() => {
result.current.setIdentification('testDocument', true);
    }};
expect(result.current.model.identificationDocuments[0].enabled).toEqual(
true,
    ];
  }};
it('add custom document', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
act(() => {
result.current.addCustomIdentification();
    }};
act(() => {
result.current.setCustomIdentification(0, { name: 'customName' });
    }};
expect(result.current.model.customIdentificationDocuments[0].name).toEqual(
'customName',
    ];
  }};
it('should validate custom documents', async () => {
const { result } = renderHook(() => useEligibility('testId'), {
wrapper,
    }};

    await waitFor(() => expect(client2Mock).toHaveBeenCalled());
act(() => {
result.current.addCustomIdentification();
    }};

    act(() => {
result.current.validate();
    }};

    expect(
result.current.model.customIdentificationDocuments[0].errors,
).toMatchSnapshot('error1');

    act(() => {
result.current.setCustomIdentification(0, {
name: 'customName',
      }];
    }};

    act(() => {
result.current.validate();
    }};

    expect(
result.current.model.customIdentificationDocuments[0].errors,
).toBeFalsy();

    act(() => {
result.current.setCustomIdentification(0, {
name: 'customName'.repeat(20),
      }];
    }};

    act(() => {
result.current.validate();
    }};

    expect(
result.current.model.customIdentificationDocuments[0].errors,
).toMatchSnapshot('error2');
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 441. `C:\DevCode\AstroUI\src\components\Membership\__test__\validate-question.test.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\__test__Ivalidate-question.test.ts" type=".ts" size="498" lines="18" chars="498" -->
```typescript
import { validateQuestion } from '../validate-question';

describe('Unit test ValidateQuestions', () => {
test('Returns true', () => {
expect(validateQuestion({ responseOptions: 'test' })).toBe('');
  }};

  test('Returns false', () => {
expect(validateQuestion({ responseOptions: '' })).not.toBe('');
  }};

  test('Field Type of "text" should not validate opitons input', () => {
expect(validateQuestion({ responseOptions: '', fieldType: 'text' })).toBe(
      ` `,
    ];
  }};
}};

```
<!-- CODESCAN_FILE_END -->

---

### 442. `C:\DevCode\AstroUI\src\components\Membership\Eligibility.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\Eligibility.tsx" type=".tsx" size="9571" lines="301" chars="9571" -->
```typescript
import React from 'react';
import { CoreButton } from 'commonui';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import { makeStyles } from '@material-ui/core/styles';
import Warning from '@material-ui/icons/Warning';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import EligiblityDetails from 'components/Membership/EligibilityDetails';
import { useAppContext } from 'context/app-context';
import { useEligibility } from 'components/Membership/useEligibility';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import Danger from 'components/Typography/Danger';
import SweetAlert from 'react-bootstrap-sweetalert';
import EligibilityDocuments from './EligibilityDocuments';
import EligibilityQuestionCategory from './EligibilityQuestionCategory';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { SCEligibilityQuestionHeader } from './styles';

const useStyles = makeStyles(styles);
const useStyles2 = makeStyles(sweetAlertStyle);

const Eligibility = (): JSX.Element => {
const { tenant } = useAppContext();
const classes = useStyles();
const classes2 = useStyles2();
const {
loading,
serverMsg,
setServerMsg,
alert,
setAlert,
openErrorDialog,
setOpenErrorDialog,
openEligibility,
openConfirmationDialog,
setOpenConfirmationDialog,
model,
setQuestionProperty,
setCategoryProperty,
setIdentification,
addCustomIdentification,
setCustomIdentification,
setDeleteCustomIdentification,
handleSaveDraftClicked,
handleSaveClicked,
sendSaveRequest,
hideAlert,
discardChanges,
setDetails,
} = useEligibility(tenant?.id ?? '');
const discardChangesWarning = (): void => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => hideAlert()}
confirmBtnCssClass={classes2.button + ' ' + classes2.success}
cancelBtnCssClass={classes2.button + ' ' + classes2.danger}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  return (
<div>
{alert}
<GridContainer role="eligibility-container">
{loading && <p>Please wait...</p>}
{serverMsg && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message={serverMsg}
close={true}
color="danger"
closeNotification={() => setServerMsg(null)}
/>
</GridItem>
</GridContainer>
        }}
        {[>>
*  <GridItem id="eligibility-grid-item" xs={12}>
<Card id="eligibility-questions-card">
         >[}
<GridItem xs={12}>
<EligiblityDetails
model={model.membershipDetails}
setDetails={setDetails}
          [>
<Card>
<CardHeader color="cuna1" text>
<SCEligibilityQuestionHeader>
<CardText color="cuna1">
<h4
id="eligibility-questions-card-header"
className={classes.cardTitle}
>
Membership Eligibility Questions
</h4>
</CardText>
<CoreButton onClick={openEligibility}>
Preview Eligibility Modal
</CoreButton>
</SCEligibilityQuestionHeader>
</CardHeader>
<CardBody>
              >>
{model.questionCategories.map((item) => (
<EligibilityQuestionCategory
model={item}
key={item.id}
setQuestionProperty={setQuestionProperty}
setCategoryProperty={setCategoryProperty}
                  [>
                }}}
              >[>
</CardBody>
</Card>
          {[>>
           >
<Card id="eligibility-identification-card">
*/}
</GridItem>
</GridContainer>
<EligibilityDocuments
addCustomIdentification={addCustomIdentification}
setIdentification={setIdentification}
setCustomIdentification={setCustomIdentification}
setDeleteCustomIdentification={setDeleteCustomIdentification}
identificationDocuments={model.identificationDocuments}
customIdentificationDocuments={model.customIdentificationDocuments}
      [>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12}>
<CoreButton
isSecondary
id="eligibility-discard-changes"
role="eligibility-discard-changes"
color="danger"
onClick={discardChangesWarning}
>
Discard Changes
</CoreButton>
{(model.state !== 'Active' || tenant?.recordState !== 'Active') && (
<CoreButton
id="eligibility-save-draft"
role="eligibility-save-draft"
style={{
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={() => {
handleSaveDraftClicked();
}}
>
Save Draft
</CoreButton>
          }}
<CoreButton
id="eligibility-save"
role="eligibility-save"
color="success"
onClick={handleSaveClicked}
>
Save
</CoreButton>
</GridItem>
<Dialog
id="form-errors-dialog"
onClose={() => {
setOpenErrorDialog(false);
}}
aria-labelledby="form-error-title"
open={openErrorDialog}
>
<DialogTitle
id="form-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Form Errors</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
Please correct errors in the highlighted fields.
</DialogContentText>
</DialogContent>
</Dialog>
<Dialog
id="form-confirmation-dialog"
onClose={() => {
setOpenConfirmationDialog(false);
}}
open={openConfirmationDialog}
>
<DialogTitle
id="form-confirmation-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Note:</b>
</p>
</DialogTitle>
<DialogContent>
<DialogContentText>
Your changes will be effective immediately. Are you sure you want
to continue?
</DialogContentText>
<DialogActions>
<CoreButton
id="confirmationDialogNo"
autoFocus
onClick={() => {
setOpenConfirmationDialog(false);
}}
color="primary"
>
No
</CoreButton>
<CoreButton
id="confirmationDialogYes"
onClick={() => {
sendSaveRequest('Active');
setOpenConfirmationDialog(false);
}}
color="primary"
autoFocus
>
Yes
</CoreButton>
</DialogActions>
</DialogContent>
</Dialog>
</GridContainer>

      {loading && <FullPageStatus />}
</div>
  ];
};

export default Eligibility;

```
<!-- CODESCAN_FILE_END -->

---

### 443. `C:\DevCode\AstroUI\src\components\Membership\EligibilityDetails.tsx`

<!-- CODESCAN_FILE_START -->
```typescript
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
'please provide a url. The http(s) protocol will be removed on save',
order: 1,
},
]
: [],
}}
value={value}
onChange={(_, newValue) => {
setDetails(key, { value: newValue });
}}
                    [>
</SCDetail>
}
buttonComponent={
<SCTitle expandedText={key} collapsedText={key} />
}
/>
</SCCategory>
          };
        }]}
</CardBody>
</Card>
  ];
};

export default EligiblityDetails;

```
<!-- CODESCAN_FILE_END -->

---

### 444. `C:\DevCode\AstroUI\src\components\Membership\EligibilityDocuments.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\EligibilityDocuments.tsx" type=".tsx" size="3768" lines="108" chars="3768" -->
```typescript
import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import { IEligibilityDocuments } from 'components/Membership/types';
import { Icon, ICON_TYPES, CoreCheckBox, DynamicInputField } from 'commonui';
import { SCIconButton, SCButton, SCDocument, SCDocuments } from './styles';

const useStyles = makeStyles(styles);

const EligiblityDocuments = ({
addCustomIdentification,
setCustomIdentification,
setIdentification,
setDeleteCustomIdentification,
identificationDocuments,
customIdentificationDocuments,
}: IEligibilityDocuments): JSX.Element => {
const classes = useStyles();
return (
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4
id="eligibility-identification-card-header"
className={classes.cardTitle}
>
Membership Identification
</h4>
</CardText>
</CardHeader>
<CardBody>
<SCDocuments>
<div>Membership requirements</div>
<div>
{identificationDocuments.map(({ enabled, id, name }) => (
<SCDocument key={id}>
<CoreCheckBox
ariaLabel={name}
id={id}
checked={!!enabled}
onChange={(checked) => {
setIdentification(id, checked);
}}
/>
<label htmlFor={id}>{name}</label>
</SCDocument>
            }]}
{customIdentificationDocuments.map(
({ enabled, name, errors }, index) => (
<SCDocument key={`custom${index}`}>
<CoreCheckBox
ariaLabel={name}
id={`eligibility-custom-identification-checkbox${index}`}
checked={!!enabled}
onChange={(checked) => {
setCustomIdentification(index, {
enabled: checked,
                      }};
}}
                  [>
<DynamicInputField
validateAllFields
error={errors}
dataField={{
disabled: !enabled,
fieldType: 'text',
fieldCode: `elegibility-custom-identification-name${index}`,
fieldLabel: `Custom ID ${index + 1}:`,
}}
value={name}
onChange={(_, newValue) => {
setCustomIdentification(index, { name: newValue });
}}
                  [>
<SCIconButton
id={`${index}_delete`}
aria-label="Delete custom identification document"
title="Delete"
color="red"
onClick={() => {
setDeleteCustomIdentification(index);
}}
>
<Icon size={14} name={ICON_TYPES.CLOSE} />
</SCIconButton>
</SCDocument>
              },
            }}
<SCButton
id="createCustomDocumentButton"
role="createCustomDocumentButton"
onClick={addCustomIdentification}
>
+ ADD
</SCButton>
</div>
</SCDocuments>
</CardBody>
</Card>
  ];
};

export default EligiblityDocuments;

```
<!-- CODESCAN_FILE_END -->

---

### 445. `C:\DevCode\AstroUI\src\components\Membership\EligibilityQuestion.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\EligibilityQuestion.tsx" type=".tsx" size="3452" lines="114" chars="3452" -->
```typescript
import { makeStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { DynamicInputField, FieldType } from 'commonui';
import { SCOptionInput, SCQuestion } from 'components/Membership/styles';
import { IEligibilityQuestion } from 'components/Membership/types';
import React from 'react';

const useStyles = makeStyles(styles);

const EligibilityQuestion = ({
allowedFieldTypes = [
FieldType.SINGLE_SELECT,
FieldType.SINGLE_QUESTION,
FieldType.TEXT,
],
categoryId,
model,
setQuestionProperty,
}: IEligibilityQuestion): JSX.Element => {
const classes = useStyles();
const switchClasses = {
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
};
const {
enabled,
id: modelId,
value,
customValue,
responseOptions,
errors,
fieldType,
} = model;
return (
<SCQuestion id={`eligibility-question-container-${modelId}`}>
<div>
<Switch
id={`eligibility-question-switch-${modelId}`}
checked={!!enabled}
classes={switchClasses}
onChange={({ target }) =>
setQuestionProperty(categoryId, modelId, {
enabled: target.checked,
            }]
}
        [>
</div>
<div>
<DynamicInputField
validateAllFields
dataField={{
disabled: !enabled,
placeholder: 'Please select the field type',
fieldType: 'single-select',
fieldCode: `${modelId}-fieldType`,
fieldLabel: 'Field Type',
options: allowedFieldTypes.map((value) => ({
value,
label: value,
            }]},
}}
value={fieldType as string}
onChange={(_, newValue) => {
setQuestionProperty(categoryId, modelId, { fieldType: newValue });
}}
        [>
<DynamicInputField
validateAllFields
dataField={{
disabled: !enabled,
placeholder: 'Please customize the question',
fieldType: 'text',
fieldCode: modelId,
fieldLabel: value,
}}
key={modelId}
value={customValue}
onChange={(_, newValue) => {
setQuestionProperty(categoryId, modelId, { customValue: newValue });
}}
        [>
{fieldType !== 'text' && (
<SCOptionInput>
<DynamicInputField
error={!!enabled && !!errors && errors.length > 0 ? errors : ''}
validateAllFields
dataField={{
disabled: !enabled,
placeholder: 'Option 1\nOption 2\nOption 3\nOption 4',
fieldType: 'textarea',
fieldCode: `responseOptions-${modelId}`,
fieldLabel:
'Configure available options. Values should be seperated by new line',
}}
key={modelId}
value={responseOptions}
onChange={(_, newValue) => {
setQuestionProperty(categoryId, modelId, {
responseOptions: newValue,
                }};
}}
/>
</SCOptionInput>
        }}
</div>
</SCQuestion>
  ];
};

export default EligibilityQuestion;

```
<!-- CODESCAN_FILE_END -->

---

### 446. `C:\DevCode\AstroUI\src\components\Membership\EligibilityQuestionCategory.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\EligibilityQuestionCategory.tsx" type=".tsx" size="3916" lines="121" chars="3916" -->
```typescript
import React, { useState } from 'react';
import { SimpleAccordion, DynamicInputField, FieldType } from 'commonui';
import EligibilityQuestion from './EligibilityQuestion';
import { IEligibilityQuestionCategory } from 'components/Membership/types';
import {
SCTitle,
SCCategory,
SCLine,
SCGroupCategory,
} from 'components/Membership/styles';
import { CategorySystemNames } from './types';

const CategoryGroupHelpText =
'# If set to trueln will render a radio option with the category label. when selected, allconfigured questions will be rendered. The answers will be associated to that category.In' +
'# If set to falseln Will render a radio option for each individual question configured. Theanswer will be associated to that category.';

const EligibilityQuestionCategory = ({
model,
setQuestionProperty,
setCategoryProperty,
}: IEligibilityQuestionCategory): JSX.Element => {
const {
enabled,
id: categoryId,
name,
systemName,
questions,
areQuestionsGrouped,
} = model;
const [expanded, setExpanded] = useState<boolean>(!!enabled);
const isZipCodeCategory =
systemName === CategorySystemNames.RESIDENCY_ZIP_CODE;

  [>>
* If we are rendering the zip code category, only allow the admin to configure 1 question
   >[
const questionsToRender = isZipCodeCategory ? [questions[0]] : questions;

  return (
<SCCategory>
<SimpleAccordion
id={categoryId}
title={systemName}
content={
<div>
<DynamicInputField
validateAllFields
dataField={{
disabled: false,
placeholder: 'Please customize the category label',
fieldType: 'text',
fieldCode: `${categoryId}-name`,
fieldLabel: 'Category Label',
}}
key={`${categoryId}_name`}
value={name}
onChange={(_, newValue) => {
setCategoryProperty(categoryId, {
name: newValue,
                }};
}}
/>
<SCGroupCategory>
<DynamicInputField
validateAllFields
dataField={{
disabled: false,
helpText: CategoryGroupHelpText,
fieldType: 'boolean',
fieldCode: `${categoryId}-group`,
fieldLabel: 'Group Category',
options: ['true', 'false'].map((value) => ({
value,
label: value,
                  }}],
}}
key={`${categoryId}_group`}
value={areQuestionsGrouped.toString()}
onChange={(_, newValue) => {
setCategoryProperty(categoryId, {
areQuestionsGrouped: JSON.parse(newValue),
                  }};
}}
/>
</SCGroupCategory>
<SCLine />
{questionsToRender.map((item) => (
<EligibilityQuestion
allowedFieldTypes={
isZipCodeCategory
? [FieldType.ZIP_CODE]
                     ; [
FieldType.SINGLE_SELECT,
FieldType.SINGLE_QUESTION,
FieldType.TEXT,
]
}
model={item}
key={item.id}
setQuestionProperty={setQuestionProperty}
categoryId={categoryId}
/>
            }]}
</div>
}
onSetExpanded={setExpanded}
expandedOverride={expanded}
buttonComponent={
<SCTitle
expanded={expanded}
expandedText={systemName}
collapsedText={systemName}
          [>
}
      [>
</SCCategory>
  ];
};

export default EligibilityQuestionCategory;

```
<!-- CODESCAN_FILE_END -->

---

### 447. `C:\DevCode\AstroUI\src\components\Membership\styles.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\styles.ts" type=".ts" size="1914" lines="113" chars="1914" -->
```typescript
import { AccordionArrowWithText, CoreButton, Theme } from 'commonui';
import styled from 'styled-components';
import { SCActionButton } from '../TableStyles';

const SCQuestion = styled.div`
display: flex;
padding: 15px;
min-width: 600px;
> div {
width: 100%;
}
> div:first-child {
width: 250px;
}
input {
margin-bottom: 10px;
}
`;

const SCOptionInput = styled.div`
margin-top: 20px;
textarea {
white-space: break-spaces;
}
`;

const SCTitle = styled(AccordionArrowWithText)`
font-size: 16px;
color: #576975;
`;

const SCSection = styled.div`
padding: 20px;
margin-bottom: 20px;
box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.2),
0px 1px 1px 0px rgba(0, 0, 0, 0.14), 0px 2px 1px -1px rgba(0, 0, 0, 0.12);
`;
const SCCategory = SCSection;

const SCIconButton = styled(SCActionButton)`
height: 30px;
min-width: 30px;
path {
stroke: white;
}
`;

const SCButton = styled(CoreButton)`
padding: 10px;
min-width: 200px;
`;

const SCDocuments = styled(SCSection)`
${Theme.getFontStyles('body2')}
> div:first-child {
${Theme.getFontStyles('body1')}
margin-bottom: 20px;
}
`;

const SCDocument = styled.div`
display: flex;
align-items: center;
margin-bottom: 10px;
> div,
input {
margin-right: 10px;
}
> div {
display: flex;
align-items: center;
}
`;

const SCDetail = styled.div`
input {
width: 500px;
}
`;

const SCLine = styled.div`
margin-top: 10px;
border-top: 1px solid #eee;
height: 2px;
`;

const SCGroupCategory = styled.div`
margin-top: 10px;
`;

const SCEligibilityQuestionHeader = styled.div`
display: flex;
justify-content: space-between;
> button {
margin-right: 24px;
}
`;

export {
SCEligibilityQuestionHeader,
SCQuestion,
SCOptionInput,
SCTitle,
SCCategory,
SCIconButton,
SCButton,
SCDocument,
SCDocuments,
SCDetail,
SCLine,
SCGroupCategory,
};

```
<!-- CODESCAN_FILE_END -->

---

### 448. `C:\DevCode\AstroUI\src\components\Membership\types.ts`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\types.ts" type=".ts" size="2424" lines="105" chars="2424" -->
```typescript
import { FieldType, IOption } from 'commonui';

export enum CategorySystemNames {
RESIDENCY_ZIP_CODE = 'Residency Zip Code',
}

export interface IQuestionModel {
enabled: boolean;
customValue: any;
id: string;
value: any;
errors?: string;
responseOptions: any;
fieldType?: string;
}

export interface IEligibilityDocument {
id: string;
name: string;
enabled: boolean;
errors?: string;
}

export interface IEligibilityCustomDocument
extends Omit<IEligibilityDocument, 'id'> {
id: string | null;
}

export interface ICategoryModel {
areQuestionsGrouped: boolean;
enabled: boolean;
id: string;
name: string;
questions: IQuestionModel[];
systemName: string;
}

export type ISetQuestionProperty = (
categoryId: string,
questionId: string,
newQuestion: Partial<IQuestionModel> & { errors?: string },
) => void;

export type ISetCustomIdentification = (
idx: any,
newDocument: Partial<IEligibilityCustomDocument> & { errors?: string },
) => void;

export interface ICategoryValue {
name: string;
areQuestionsGrouped: boolean;
}

export type ISetCategoryProperty = (
categoryId: string,
categoryValue: Partial<ICategoryValue>,
) => void;

export interface IEligibilityQuestionCategory {
model: ICategoryModel;
setQuestionProperty: ISetQuestionProperty;
setCategoryProperty: ISetCategoryProperty;
}

export interface IEligibilityQuestion {
allowedFieldTypes?: FieldType[];
categoryId: string;
model: IQuestionModel;
options?: IOption[];
setQuestionProperty: ISetQuestionProperty;
}

export interface IEligibilityDocuments {
addCustomIdentification: () => void;
setCustomIdentification: ISetCustomIdentification;
setIdentification: any;
setDeleteCustomIdentification: any;
identificationDocuments: IEligibilityDocument[];
customIdentificationDocuments: IEligibilityCustomDocument[];
}

export interface IEligibilityDetail {
id: number;
key: string;
value: string;
description: string;
error?: string;
}

export interface IEligiblityModel {
state: string;
questionCategories: ICategoryModel[];
identificationDocuments: IEligibilityDocument[];
customIdentificationDocuments: IEligibilityCustomDocument[];
membershipDetails: IEligibilityDetail[];
}

export interface IEligibilityDetailsComponent {
model: IEligibilityDetail[];
setDetails: (
key: string,
detail: { description?: string; value?: string },
) => void;
}

```
<!-- CODESCAN_FILE_END -->

---

### 449. `C:\DevCode\AstroUI\src\components\Membership\useEligibility.tsx`

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\useEligibility.tsx" type=".tsx" size="10588" lines="395" chars="10588" -->
```typescript
import React, { useContext, useEffect, useState } from 'react';
import {
IEligiblityModel,
ISetCategoryProperty,
ISetQuestionProperty,
IEligibilityDetail,
ISetCustomIdentification,
ICategoryModel,
IQuestionModel,
} from 'components/Membership/types';
import {
eligibilityQuestionGroup,
IMembershipEligibilityWizard,
Modals,
ModalContext,
IOption,
} from 'commonui';
import { useAppContext } from 'context/app-context';
import { isValidURL } from 'helpers/validations';
import { client2 } from 'utils/api-client';
import { sanitizeURL } from 'utils/sanitization';
import * as validation from './validate-question';
import { IDataField } from 'commonui/build/core/entities/loanApplication';

const isKeyLink = (key: string): boolean => key.endsWith('LINK');

const useEligibility = (tenantId: string) => {
const [loading, setLoading] = useState(true);
const [serverMsg, setServerMsg] = useState<any>(null);
const [alert, setAlert] = useState<any>(null);
const [hasError, setHasError] = useState<boolean>(false);
const [openErrorDialog, setOpenErrorDialog] = useState(false);
const [openConfirmationDialog, setOpenConfirmationDialog] = useState(false);
const { close, openAppModal } = useContext(ModalContext);
const [model, setModel] = useState<IEligiblityModel>({
state: 'Active',
questionCategories: [],
identificationDocuments: [],
customIdentificationDocuments: [],
membershipDetails: [],
  }};

  const { tenant, withinTenantContext, setPageTitle } = useAppContext();
const titleList = new Map();

  const setQuestionProperty: ISetQuestionProperty = (
categoryId,
questionId,
newQuestion,
) => {
const categories = model.questionCategories;
const newCategories = categories.map((c) => {
if (c.id === categoryId) {
const newQuestions = c.questions.map((q) => {
if (q.id === questionId) {
const question = { ...q, ...newQuestion };
return {
...question,
errors: validation.validateQuestion(question),
};
}

          return q;
        }];
return { ...c, questions: newQuestions };
}
return c;
    }};
setModel({ ...model, questionCategories: newCategories });
};

  const setCategoryProperty: ISetCategoryProperty = (
categoryId,
newCategory,
) => {
const categories = model.questionCategories;
console.log({ categories });
const newCategories = categories.map((c) => {
if (c.id === categoryId) {
return { ...c, ...newCategory };
}

      return c;
    }};
console.log({ newCategories });

    setModel({ ...model, questionCategories: newCategories });
};

  const setIdentification = (docId: string, value: boolean): void => {
const newIdentificationDocuments = model.identificationDocuments.map(
(document) => ({
...document,
enabled: docId === document.id ? value : document.enabled,
      }],
    ];

    setModel({ ...model, identificationDocuments: newIdentificationDocuments });
};

  const addCustomIdentification = (): void => {
const emptyDocument = {
id: null,
name: '',
enabled: true,
};

    setModel({
...model,
customIdentificationDocuments: [
         ..(model.customIdentificationDocuments Il [J),
emptyDocument,
],
    }};
};

  const setCustomIdentification: ISetCustomIdentification = (
idx,
newCustomIdentification,
) => {
const newCustomDocuments = model.customIdentificationDocuments.map(
(document, documentIndex) => ({
...document,
...(idx === documentIndex ? newCustomIdentification : {}),
      }],
    ];

    setModel({ ...model, customIdentificationDocuments: newCustomDocuments });
};

  const setDeleteCustomIdentification = (idx: any): void => {
model.customIdentificationDocuments.splice(idx, 1);
setModel({ ...model });
};

  const setDetails = (
key: string,
newDetail: Partial<Omit<IEligibilityDetail, 'key'>>,
): void => {
const { membershipDetails } = model;
const newDetails = membershipDetails.map((detail) => {
if (detail.key === key) {
return { ...detail, ...newDetail };
}
return detail;
    }};
setModel({ ...model, membershipDetails: newDetails });
};

  const validate = (): boolean => {
let rez = true;

    for (const category of model.questionCategories) {
for (const question of category.questions) {
if (question.enabled) {
rez = rez && validation.validateQuestion(question) === '';
}
}
}

    for (const [
index,
{ name },
] of model.customIdentificationDocuments.entries()) {
if (!name) {
rez = false;
setCustomIdentification(index, {
errors: 'Document name must be defined',
        }];
}

      if (name && name.length > 100) {
rez = false;
setCustomIdentification(index, {
errors: 'Value must be less than 100 characters long.',
        }];
}

      if (rez) {
setCustomIdentification(index, { errors: '' });
}
}

    for (const detail of model.membershipDetails) {
if (isKeyLink(detail.key) && detail.value && !isValidURL(detail.value)) {
rez = false;
setDetails(detail.key, { error: 'Please enter a valid URL' });
}
}

    return rez;
};

  const handleSaveDraftClicked = (): void => {
validateAndSave('Draft');
};

  const handleSaveClicked = (): void => {
validateAndSave('Active');
};

  const validateAndSave = (stateToSave = 'Active') => {
if (!validate()) {
setOpenErrorDialog(true);
return;
}
if (model.state == 'Active') {
setOpenConfirmationDialog(true);
return;
}
sendSaveRequest(stateToSave);
};

  // fetch eligibility model
useEffect(() => {
if (!loading) return;
if (!tenantId) return;

    withinTenantContext(
tenantId,
() => {
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
          };
titleList.set(`Eligibility`, `/admin/tenant/${tenantId}/membership`);
setPageTitle(titleList);
client2(
`${process.env.REACT_APP_MEMBERIZATION_API_BASE_URL}/membership-eligibility`,
'GET',
{ headers: { 'X-TENANT-ID': tenantId } },
        }
.then((data) => {
setModel({ ...model, ...data.payload });
setLoading(false);
          }]
.catch((error) => {
console.log(error);
setHasError(true);
setLoading(false);
          }];
},
() => {
setHasError(true);
setLoading(false);
},
    ];
}, [loading]);

  const sanitizePayload = (
stateToSave: IEligiblityModel,
): IEligiblityModel => ({
...stateToSave,
membershipDetails: stateToSave.membershipDetails.map((detail) => ({
...detail,
value: isKeyLink(detail.key) ? sanitizeURL(detail.value) : detail.value,
    }}],
  }};

  const sendSaveRequest = async (stateToSave = 'Active') => {
if (tenant) {
setServerMsg(null);
const url = `${process.env.REACT_APP_MEMBERIZATION_API_BASE_URL}/membership-eligibility`;
const recordToSave = { ...sanitizePayload(model), state: stateToSave };
client2(url, 'POST', {
body: recordToSave,
headers: { 'X-TENANT-ID': tenant.id },
      }]
.then((data) => {
console.log(data);
setLoading(true);
        }]
.catch((e) => {
setServerMsg(
<div id="serverError">
<h4>
Server returned error while processing data. Please try again.
</h4>
</div>,
          };
        }];
}
};

  const hideAlert = (): void => {
setAlert(null);
};

  const discardChanges = (): void => {
setAlert(null);
setLoading(true);
};

  const repsonseOptionsToDataFieldOptions = (
responseOptions: string,
): IOption[] => [
...responseOptions
.split('\n')
.map((option) => ({ label: option, value: option })),
];

  const categoryQuestionToDataField = ({
id,
customValue,
value,
fieldType = '',
responseOptions,
}: IQuestionModel): IDataField => ({
fieldCode: `${id}`,
fieldLabel: customValue || value,
fieldType: fieldType,
options: repsonseOptionsToDataFieldOptions(responseOptions),
presentationOrder: 1,
required: true,
value: '',
  }};

  const categoryToFieldGroup = ({
areQuestionsGrouped,
name,
systemName,
questions,
}: ICategoryModel): eligibilityQuestionGroup | any => ({
areQuestionsGrouped,
groupCode: systemName,
groupTitle: name,
hidden: false,
required: true,
dataFields: questions
.filter(({ enabled }) => enabled)
.map(categoryQuestionToDataField),
  }};
const categories = model.questionCategories;
const groupedCategories = categories.filter(
({ areQuestionsGrouped }) => areQuestionsGrouped,
  ];
const nonGroupedQuestions = categories
.filter(({ areQuestionsGrouped }) => !areQuestionsGrouped)
.flatMap(({ questions }) => questions)
.filter(({ enabled }) => enabled);

  const modalProps: IMembershipEligibilityWizard = {
description: <>This is an eligibility description</>,
title: <>Eligibility</>,
handleRedirect: close,
eligibilitySegment: {},
eligibilityQuestions: nonGroupedQuestions.map(categoryQuestionToDataField),
eligibilityQuestionGroups: groupedCategories.map(categoryToFieldGroup),
fetching: false,
saveEligibilityAnswer: () => Promise.resolve(),
skipLastStep: true,
};

  const openEligibilityParams = {
name: Modals.MEMBERSHIP_ELIGIBILITY,
...modalProps,
};
const openEligibility = (): void => openAppModal(openEligibilityParams);

  return {
addCustomIdentification,
alert,
discardChanges,
handleSaveClicked,
handleSaveDraftClicked,
hasError,
hideAlert,
model,
openEligibility,
openErrorDialog,
openConfirmationDialog,
loading,
sendSaveRequest,
serverMsg,
setAlert,
setCategoryProperty,
setDetails,
setHasError,
setIdentification,
setLoading,
setModel,
setOpenConfirmationDialog,
setOpenErrorDialog,
setQuestionProperty,
setServerMsg,
setCustomIdentification,
setDeleteCustomIdentification,
validate,
validateAndSave,
};
};

export { useEligibility, isKeyLink };

```
<!-- CODESCAN_FILE_END -->

---

### 45o.‘C:\DevCode\AstroUI\src\components\Membershiplvalidate-question.ts'

<!-- CODESCAN_FILE_START path="C:\DevCode\AstroUI\src\components\Membership\validate-question.ts" type=".ts" size="333" lines="14" chars="333" -->
```typescript
import { IQuestionModel } from 'components/Membership/types';
export const validateQuestion = (
newQuestion: Partial<IQuestionModel>,
): string => {
if (
newQuestion.fieldType === 'text' ||
(newQuestion && newQuestion?.responseOptions?.length > 0)
  ] {
return '';
}

  return 'At least one option is required';
};

```
<!-- CODESCAN_FILE_END -->
