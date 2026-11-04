path="C:\DevCode\AstroUI\src\components\CoreProduct\CustomSection\CustomSection.tsx" type=".tsx"
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import GridContainer from 'components/Grid/GridContainer';
o import GridItem from 'components/Grid/GridItem';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import React from 'react';
import { useEffect } from 'react';
import  CustomSectionstate, ViewMode } from './types';
import { RatesMgmtServiceObjv1 } from './types/RatesMgmtServiceobj';
import CustomSectionField from './types/CustomSectionField';
import * as utils from './utils';
import useCustomSection, {
  Managedstate,
  StateMgmt,
} from './hooks/useCustomSection';
import { client2 } from 'utils/api-client';
import FullPageStatus from 'components/FullPagestatus/FullPageStatus';











































      'Attempting to use custom section state outside of a custom section',
    };
  return state;
};

const CustomSectionstateMgmtCtx = React.createContext<StateMgmt | null>(null);

export const useCustomSectionstateMgmt = () => {
  const stateMgmt = useContext(CustomSectionstateMgmtCtx);
  if (!stateMgmt)
    throw new Error(
      'Attempting to use custom section state mgmt outside of a custom section',
    };
  return stateMgmt;
};

const CustomSectionViewmodeCtx = React.createContext<ViewMode>('view');
const CustomSectionSetFieldsCtx = React.createContext<CustomSectionField[]>([]);
const CustomSectionTableConfigCtx =
  React.createContext<SectionTableConfig<any> | null>(null);

export const useCustomSectionConfig = () => {
const setFields = useContext(CustomSectionSetFieldsCtx);
const tableConfig = useContext(CustomSectionTableConfigCtx);
const viewMode = useContext(CustomSectionViewmodeCtx);
return {
setFields,
tableConfig,
viewMode,
};
};

const CustomSectionDimensionSpecCtx =
React.createContext<DimensionSpecification | null>(null);
export const useCustomSectionDimensions = () => {
const dimensions = useContext(CustomSectionDimensionSpecCtx);
return dimensions;
};

const createListenterValFN = (
sectionName: CustomSectionProps['sectionName'],
customValidator: CustomSectionProps['uploadValidator'],
setFormErrorState: any,
buildCacheFN: () => void,
tablesRequired?: boolean,
) => {
return (context: any) => {
buildCacheFN();

    // fetch the latest state of the product, rates table, and errors from cache
const sectionSetList = utils.getCachedState(context);

    // pull the errors that were created from buildCacheFN from the cache. work around
// to allow the continued use of the context object
const cacheErrors = utils.getErrorCache(context);

    // This is what prevents the product from being uploaded if it has errors
const setCoreProductPageError = (msg: string) =>
context.updateError(sectionName, msg);

    let errors: string[] = [];
if (cacheErrors !== undefined) {
const { foundInvalidErrors, foundRequiredErrors } = cacheErrors;
if (foundInvalidErrors) {
errors.push('- Fix the highlighted errors.');
}






const tablesNotGenerated = sectionSetList.some(
(set) => Object.keys(set.tables).length === 0,
      };
      if (tablesNotGenerated){
        errors.push(
           - Tables for each set must be generated and filled out before submitting',
        };
      }
    }

if (customValidator) {
errors = errors.concat(customValidator(sectionSetList));
}

    setCoreProductPageError(errors.length > 0 ? 'Form errors' : -'');
    setFormErrorState(errors);
  };
};

export interface UploadContext {
coreProductContext: any;
productId: string;
newVersionOfSubcomponents: boolean;
recordState: string;
tableConfig?: SectionTableConfig<any>;
dimensionSpec?: DimensionSpecification;
}

const createCustomUploadFunc = (
customUploadFunction: (
uploadContext: UploadContext,
sectionSets: any[],
) => void,
) => {
return (
context: any,
productId: string,
newVersionOfSubcomponents: boolean,
recordState: string,
) => {
const sets = context.getCachedObject(CACHE_OBJECT_KEY_RATES) as any[];
const tableConfig = context.getCachedObject(
CACHE_OBJECT_KEY_TABLE_CONFIG,
) as SectionTableConfig<any> | undefined;
const dimensionSpec = context.getCachedObject(
CACHE_OBJECT_KEY_DIMENSION_SPEC,
) as DimensionSpecification | undefined;

    const uploadContext: UploadContext = {
coreProductContext: context,
productId,
newVersionOfSubcomponents,
recordState,
tableConfig,
dimensionSpec,
};

    return customUploadFunction(uploadContext, sets);
};
};

const createDefaultUploadFunc = (setType: string) => {
return (



















productId,
type: setType,
specificationJSON: {},
valuesJSON: formattedSet,
metadataJSON: {},
recordState: '',
source: formattedSet.source ?? 'Manually Entered',
startDate: formattedSet.startDate ?? '',
endDate: formattedSet.endDate,
};
utils.setUploadRecordState(setForUpload, recordState);
return setForUpload;
    }};

    const url = `${process.env.REACT_APP_RATES_API_BASE_URL}product-rates/${productId}`;
const config = {
headers: { 'X-TENANT-ID': tenantId } as any,
body: setsForUpload,
};
return client2(url, newVersionOfSubcomponents ? 'POST' : 'PUT', config);
};
};

const addSectionstateToCache = (context: any, state: CustomSectionstate) => {
  const result = Object.values(state);
  context.cacheObject(CACHE_OBJECT_KEY_RATES, result);
  return;
};

const addTableConfigToCache = (
  context: any,
  tableConfig?: SectionTableConfig<any>,
} => {
  context.cacheObject(CACHE_OBJECT_KEY_TABLE_CONFIG, tableConfig);
};

const addDimensionSpecToCache = (
  context: any,
  spec?: DimensionSpecification,
} => {
  context.cacheObject(CACHE_OBJECT_KEY_DIMENSION_SPEC, spec);
};

const CustomSection: React.FC<CustomSectionProps> = ({
  sectionSetType,
  sectionSetFields,
  context,
  uploadValidator,
  viewMode,
  sectionName,
  tableConfig,
  children,
customFetchFunction(
  customUploadFunction,
  customstateListener,
  dimensionSpecificationData,
  tablesRequired,
) =>
  const [loading, setLoading] = React.usestate(true);
  const [errorResponse, setErrorResponse] = React.usestate(null);

  const dimensionSpecification = dimensionSpecificationData?.result;

  const { state, stateMgmt } = useCustomSection(
    sectionSetFields,
context,
tableConfig,
dimensionSpecification,
customStateListener,
  };
const { stateDispatch } = stateMgmt;
const { formErrors } = state;

  addSectionStateToCache(context, state.sectionState);
addTableConfigToCache(context, tableConfig);
addDimensionSpecToCache(context, dimensionSpecification);

  useEffect(() => {
if (!tableConfig) return;
if (!dimensionSpecificationData) return;
const { delta, result: dimensionSpec } = dimensionSpecificationData;
if (delta) {
stateDispatch({
type: 'STATE_RESET',
newState: utils.rebuildTableStateFromDelta(
dimensionSpec,
delta,
          tableConfig.
          state.sectionstate,
        },
      }};
    else {
      stateDispatch(
        type: 'STATE_RESET',
        newState: {
          0: {
            ...utils.defaultStateFromFields(sectionSetFields),
            tables: utils.initTableStateFromDimensions(
              dimensionSpec,
              tableConfig,
            ],
          },
        },
      }};
    }
   ,[dimensionSpecificationData]);

  useEffect(() => {
    context.addValidationListener(
      createListenterValFN(
        sectionName,
uploadValidator,
stateMgmt.setFormErrors,
() => stateDispatch({ type: 'SECTION_ERROR_CHECK' }),
tablesRequired,
      },
    };

    context.addUploadListener(
customUploadFunction
? createCustomUploadFunc(customUploadFunction)
: createDefaultUploadFunc(sectionSetType),
    };
}, []);

  useEffect(() => {
if (!loading) return;
if (viewMode === 'view') {
if (customFetchFunction) {
customFetchFunction(
context,
viewMode,
(newState: CustomSectionState) =>
stateDispatch({ type: 'STATE_RESET', newState }),
          setErrorResponse,
          () => {,
).then(() => setLoading(false));
} else {
defaultFetchSetsRatesMgmt(
context,
(newState: CustomSectionState) =>
stateDispatch({ type: 'STATE_RESET', newState }),
setErrorResponse,
() => {},
).then(() => setLoading(false));
}
return;
}

    const setDefaultState = () => {
stateDispatch({
type: 'STATE_RESET',
        newState: {
          0: {
             ..utils.defaultStateFromFields(sectionSetFields),
           tables: {},
          },
        },
      }};
    };

    if (viewMode === 'create'){
      if (tableConfig && dimensionSpecification) {
        stateDispatch({
          type: 'STATE_RESET',
          newstate: {
           0:
               ..utils.defaultStateFromFields(sectionSetFields),
              tables: utils.initTableStateFromDimensions(
               dimensionSpecification,
               tableConfig,
              ],
            },
          },
        }];
       else if (customFetchFunction) {
        customFetchFunction(
          context,
          viewMode,
          (newState: CustomSectionState) =>
            stateDispatch({ type: 'STATE_RESET', newState }),
          setErrorResponse,
          setDefaultState,
        ).then(() => setLoading(false));
      else {
        setDefaultState();
      }
      setLoading(false);
    } else if (viewMode === 'edit'){
      if (customFetchFunction){
        customFetchFunction(
          context,
          viewMode,
          (newState: CustomSectionState) =>
            stateDispatch({ type: 'STATE_RESET', newState }),
          setErrorResponse,
          setDefaultState,
        ).then(() => setLoading(false));















































}
close={true}
color="danger"
closeNotification={() => stateMgmt.setFormErrors([])}
                  [>
</GridItem>
</GridContainer>
            ]}
{children}
          >[>
</CardBody>
</Card>
    };
};

  return (
<CustomSectionDimensionSpecCtx.Provider
value={dimensionSpecification ?? null}
>
<CustomSectionSetFieldsCtx.Provider value={sectionSetFields}>
<CustomSectionStateMgmtCtx.Provider value={stateMgmt}>
<CustomSectionTableConfigCtx.Provider value={tableConfig ?? null}>
<CustomSectionViewmodeCtx.Provider value={viewMode}>
<CustomSectionStateCtx.Provider value={state}>
{renderCard()}
</CustomSectionStateCtx.Provider>
</CustomSectionViewmodeCtx.Provider>
</CustomSectionTableConfigCtx.Provider>
</CustomSectionStateMgmtCtx.Provider>
</CustomSectionSetFieldsCtx.Provider>
</CustomSectionDimensionSpecCtx.Provider>
  };
};

export default CustomSection;
