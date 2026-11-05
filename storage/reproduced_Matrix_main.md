
















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































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