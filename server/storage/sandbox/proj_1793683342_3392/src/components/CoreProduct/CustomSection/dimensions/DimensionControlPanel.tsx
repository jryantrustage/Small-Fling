path="C:\DevCode\AstroUI\src\components\CoreProduct\CustomSection\dimensions\DimensionControlPanel.ts"


















import { dimensionConfigMap } from './configuration/dimensionConfigMap';
import { dimensionColumnConfigMap } from './configuration/dimensionColumnConfigMap';
import useDimensionRowConfigMap from './configuration/useDimensionRowConfigMap';
import {
dimensionEntryPanelConfigMap,
isEntryPanelDisabled,
} from './configuration/dimensionEntryPanelConfigMap';
import { useCustomSectionConfig } from '../CustomSection';
import { createDimensionSpecDelta, DimensionSpecDelta } from '../utils';

const useStyles = makeStyles((theme: Theme) =>
createStyles({
root: {
flexGrow: 1,
},
  }},
};

export interface GeneratedResult {
result: DimensionSpecification;
delta?: DimensionSpecDelta;
}

interface Props {
  onGenerate: (result: GeneratedResult) => void;
  currentDimensionSpec?: DimensionSpecification;
}

const dimensionInList = (
  dimToCheck: DimensionConfig,
  dimList: Array<DimensionConfig I 'unselected'>,
} => {
  for (const dimItem of dimList) {
    if (dimItem === 'unselected') continue;
    if (dimItem.dimensionName === dimToCheck.dimensionName) return true;
  }
  return false;
};

const extractInitialSpec = (spec?: DimensionSpecification) => {
  let column: DimensionConfig I 'unselected' = 'unselected';
  let row: DimensionConfig | 'unselected' = 'unselected';
  let extraDimensions: Array<DimensionConfig I 'unselected'> = [];
  let dimensions: Dimension[] = [];
  if (spec?.column){
    column = dimensionConfigMap[spec.column.dimensionName];
    dimensions = [...dimensions, ...spec.column.dimensions];
  }
  if (spec?.row && spec?.row.dimensionName && spec?.row.dimensions) {
    row = dimensionConfigMap[spec.row.dimensionName];
    dimensions = [...dimensions, ...spec.row.dimensions];
  }
  if (spec?.extraDimensions) {
    extraDimensions = Object.keys(spec.extraDimensions).map(
      (name) => dimensionConfigMap[name as DimensionName] ?? 'unselected',
    };
    // dimensions = Object.values(spec.extraDimensions).reduce((pv, cv) => [...pv, ...cv], []);
dimensions = [
      ...dimensions,
       ..(Object.values(spec.extraDimensions).flatMap((d) => d) as Dimension[l),













































































      {>} =>
        columnDimKeys.includes(o.dimensionName) && !o.excludeAsColumnDimension,
    };
const columnOptions = configToOptions(columnDimOptions);

const rowDimKeys = Object.keys(dimensionRowConfigMap);
const rowDimOptions = allDimOptions
.filter((o) => rowDimKeys.includes(o.dimensionName))
.filter((o) =>
        columnDimConfig === 'unselected'
? true
: o dimensionName == columnDimConfig.dimensionName,
      };
const rowOptions = configToOptions(rowDimOptions);

const columnValue =
columnDimConfig === 'unselected' ? 'unselecte'
: 'unselecte'
; columnDimConfig dimensionName;
const rowValue =
      rowDimConfig === 'unselected' ? 'unselected' : rowDimConfig.dimensionName;
const colEditDisabled =
columnDimConfig === 'unselected' ||
isEntryPanelDisabled(columnDimConfig.dimensionName, 'column');
const rowEditDisabled =
rowDimConfig === 'unselected' ||
      isEntryPanelDisabled(rowDimConfig.dimensionName, 'row');

    const colErrorMsg =
columnDimConfig === 'unselected' ? 'Required' : undefined;

    return (
      >>
<Grid container>
<Grid item xs={8}>
<CustomSectionSelect
key={`dimension-select-column`}
id="dimension-select-column"
disabled={!allowEdits}
label={`Column Dimension`}
options={columnOptions}
value={columnValue}
helperText={dimensionHelperText(columnDimConfig)}
errorMsg={colErrorMsg}
onChange={(dimName) => {
                if(dimName !== 'unselected'){
                  setColumnDimConfig(
                   dimensionConfigMap[dimName as DimensionName].
                  ];
                  if(
                   rowDimConfig !== 'unselected' &&
                   rowDimConfig.dimensionName === dimName
                  ] {
                   setRowDimConfig('unselected');
                  }
                 filterDimConfigSelects((config) =>
                   config === 'unselected'
                     ? true
                       config.dimensionName !== dimName,
                  ];
                } else {
                  setColumnDimConfig('unselected');
                }
                setError(undefined);
              }}
            [>
</Grid>
<Grid item xs={2}>
{allowEdits && (
<AddBtn
id={`dimension-edit-column`}
label={'Edit'}
disabled={colEditDisabled}
onClick={() => {
if (columnDimConfig === 'unselected') return;
setEditModalDimName(columnDimConfig.dimensionName);
}}
              [>
            ]}
</Grid>
</Grid>
<Grid container>
<Grid item xs={8}>
<CustomSectionSelect
key={`dimension-select-row`}
id="dimension-select-row"
label={`Row Dimension`}
options={rowOptions}

















                label={'Edit'}
                disabled={rowEditDisabled}
                onclick={()=> {
rowDimConfig === 'unselected' ||
isEntryPanelDisabled(rowDimConfig.dimensionName, 'row');
                }}
              [>
            ]}
          </Grid>
        </Grid>
      >[>
    };
  };

  const renderDimensionFields = () => {
    const availableOptions = Object.values(dimensionConfigMap)
      .filter(
        (config)=>
          !dimensionInList(config, [
             ..dimConfigSelects,
            columnDimConfig,
            rowDimConfig,
          ]],
      }
      .filter((config) => !config.excludeAsExtraDimension);
    return dimConfigSelects.map((config, selectedConfigIndex) => {
      const options = [
        { label: ', value: 'unselected' },
          .availableOptions.map((o) => ({
          label: o.displayName,
          value: o.dimensionName,
        }]],
      ];
if (config !== 'unselected') {
options.push({
label: config.displayName,
value: config.dimensionName,
        }];
}
const value = config === 'unselected' ? '' : config.dimensionName;
return (
<Grid key={`extra-dim-select-${selectedConfigIndex}`} container>
<Grid item xs={8}>
<CustomSectionSelect
key={`custom-section-select-${selectedConfigIndex}`}
id={`dimension-select-extra-${selectedConfigIndex}`}
label={`Extra Dimension ${selectedConfigIndex + 1}`}
disabled={!allowEdits}
options={options}
value={value}
helperText={dimensionHelperText(config)}
onChange={(dimName) => {
setSelectedConfigByIndex(
selectedConfigIndex,
dimName === 'unselected'
? 'unselected'















}}
              [>
            ]}
</Grid>
<Grid item xs={1}>
{allowEdits && (
<DeleteBtn
key={`dimension-delete-btn-${selectedConfigIndex}`}
label={''}
onClick={() => {
if (config !== 'unselected') {
removeDimsByPredicate(
(d) => d.dimensionName !== config.dimensionName,
                    ];
}
removeSelectedConfigByIndex(selectedConfigIndex);
}}
              [>
            ]}
</Grid>
</Grid>
});
    }};



    if (columnDimConfig === 'unselected'){
      return 'please select a column dimension';
    }
    if (dimConfigSelects.some((c) => c === 'unselected')) {
      return 'please select a dimension for all extra dimension fields';
    }

    let row: DimensionSpecification['row'];
    if (rowDimConfig !== 'unselected'){
      row = {
        dimensionName: rowDimConfig.dimensionName,
        dimensions: dimensions.filter(
          (d) => d.dimensionName === rowDimConfig.dimensionName,
        },
      };
    }

const extraDimensions: DimensionSpecification['extraDimensions'] = {};
    dimConfigSelects.forEach((s) => {
      if (s === 'unselected') return;
      extraDimensions[s.dimensionName] = dimensions.filter(
        (d) => d.dimensionName === s.dimensionName,





        dimensions: dimensions.filter(
          (d) => d.dimensionName === columnDimConfig.dimensionName,
        },
      },
      row,
      extraDimensions,
    };

    if(
      !columnDimConfig.columnOverride &&
      result.column.dimensions.length === 0
    } {
      return 'please add at least one column value to the selected column dimension';
    }

    // Object.entries(result.extraDimensions ?? {}).forEach(([dimName, dimList]) => {
    for (const [dimName, dimList] of Object.entries(
      result.extraDimensions ?? {},
    }} {
      const config = dimensionConfigMap[dimName as DimensionName];
      if (dimList?.length === 0) {
        return 'please add at least one value for dimension ${config.displayName}';
      }





























item
xs={6}
style={{ display: 'flex', flexDirection: 'column', padding: 5 }}
>
{renderTableSelects()}
<h4>Add Extra Dimensions</h4>
{renderDimensionFields()}
<Grid item>
            {allowEdits &&(
              <AddBtn
                label={'Add Dimension'}
                onclick={() => appendDimConfig('unselected')}
              [>
            ]}
</Grid>
</Grid>
</Grid>
<Grid justifyContent={'flex-end'} container>
<Grid item>
          {allowEdits &&(
            <GenericBtn
              label={'Generate'}
              onclick={()=>{
                const result = parseResult();
                if (typeof result === 'string') {
                  setError(result);
                  return;
                }
                if (currentDimensionSpec){
                 const delta = createDimensionSpecDelta(
                   currentDimensionSpec,
                   result,
                 ];
                 if (delta.requiresDataRebuild) {
                   setPendingResult({
                     result,
                     delta,
                   }];
                 } else {
                   onGenerate({ result, delta });
                 }
                 return;
               }
onGenerate(pendingResult);
}}
            [>
          ]}
        </Grid>
</Grid>
      <Divider />
      <Grid container>
        {editModalDimName &&(
          <dustomSectionModal
title={`Edit ${dimensionConfigMap[editModalDimName].displayName} Values`}
isOpen={editModalDimName !== null}
onClose={() => setEditModalDimName(null)}
>
<DimensionEntryPanel
dimensionName={editModalDimName}
dimensions={dimensions}
onSave={(newDims) => {
setDimensions(newDims);
setEditModalDimName(null);
setError(undefined);
}}
            [>
</CustomSectionModal>
        }}
</Grid>
<Grid container>
<AlertDialog
title={'Table Data Reset'}
content={pendingResultMsg()}
isOpen={pendingResult !== undefined}
onDisagree={() => setPendingResult(undefined)}
onAgree={() => {
if (!pendingResult)
throw new Error('Generated pending result spec was not found');
onGenerate(pendingResult);
setPendingResult(undefined);
}}
        [>
</Grid>
</div>
  };
};

export default DimensionControlPanel;
