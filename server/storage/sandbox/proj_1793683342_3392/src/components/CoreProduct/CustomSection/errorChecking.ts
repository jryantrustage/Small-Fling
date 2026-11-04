import CustomSectionField, {
CustomSectionMultiSelect,
SwitchableInput,
TextField,
} from './types/CustomSectionField';
import * as A from './actions';
import {
GenericSectionSetState,
SectionSetState,
SectionTableState,
} from './types';
import customSectionTableCellMap, {
TableCellType,
} from './CustomSectionTableCell';
import { setErrorMsg, deleteErrorMsg, extractErrorMsg } from './utils';
import { IS_DEFAULT_COLUMN_FIELD_KEY } from './dimensions/ProductTableColumnDictionary';

const unpackCustomValues = (valuesStr: string) => {
if (valuesStr === '') return [];
return valuesStr.split(',').map((s) => s.trim());
};

const tryHandleMultiSelect = (
value: any,
fieldId: string,
fields: CustomSectionField[],
draft: any,
checkRequired = false,
): boolean => {
const multiSelectThatChanged = fields.find(
(f) => f.id === fieldId && f.type === 'multiselect',
  };
const customFieldThatChanged = fields.find(
(f) => (f as CustomSectionMultiSelect).customFieldId === fieldId,
  };

  if (multiSelectThatChanged) {
const field = multiSelectThatChanged as CustomSectionMultiSelect;
let values = value as string[];
if (field.customFieldId) {
const valuesStr = draft[field.customFieldId];
if (valuesStr === undefined)
throw new Error(
`Custom field value was not found in state draft with customFieldId: ${field.customFieldId}`,
        };
values = values.concat(unpackCustomValues(draft[field.customFieldId]));
}
if (field.required && values.length === 0) {
setErrorMsg(draft, field.id, 'Required');
} else {
deleteErrorMsg(draft, field.id);
}
return true;
} else if (customFieldThatChanged) {
const field = customFieldThatChanged as CustomSectionMultiSelect;
const values = unpackCustomValues(value);
values.concat(draft[field.id]);
if (field.required && values.length === 0) {
setErrorMsg(draft, field.id, 'Required');
} else {
deleteErrorMsg(draft, field.id);
}
return true;
}
return false;
};

const tryHandleSecondaryField = (
value: string,
fieldId: string,
fields: CustomSectionField[],
draft: any,

const firstFieldThatChanged = fields.find(
(f) => f.id === fieldId && f.type === 'text' && f.secondaryField,
  };
const secondFieldThatChanged = fields.find(
(f) => (f as TextField).secondaryField?.id === fieldId,
  };

  const _field = firstFieldThatChanged
? firstFieldThatChanged
: secondFieldThatChanged;
if (!_field) return false;
const field = _field as TextField;
const secondaryField = field.secondaryField;
if (!secondaryField) throw new Error('To appease the compiler');
// After this line we are working with a Text field with a secondary field configured, even
// though the compiler is not picking that up

  const firstId = field.id;
const secId = secondaryField.id;

  if (field.required && draft[firstId] === '' && draft[secId] === '') {
setErrorMsg(draft, firstId, 'Required');
setErrorMsg(draft, secId, 'Required');
return true;
} else {
deleteErrorMsg(draft, firstId);
deleteErrorMsg(draft, secId);
}

  let handled = false;
if (draft[firstId] !== '' && field.fieldValidation) {
handled = true;
const toCheck = firstFieldThatChanged ? value : draft[firstId];
const { validWhen, method, message, arg } = field.fieldValidation;
if (method(toCheck, arg) === validWhen) {
deleteErrorMsg(draft, firstId);
} else {
setErrorMsg(draft, firstId, message);
}
}

  if (draft[secId] !== '' && secondaryField.fieldValidation) {
handled = true;
const toCheck = secondFieldThatChanged ? value : draft[secId];
const { validWhen, method, message, arg } = secondaryField.fieldValidation;

deleteErrorMsg(draft, secId);
} else {
setErrorMsg(draft, secId, message);
}
}
return handled;
};

const tryHandleSwitchableField = (
value: string,
fieldId: string,
fields: CustomSectionField[],
draft: any,
): boolean => {
const inputThatChanged = fields.find(
(f) => f.id === fieldId && f.type === 'switchableInput',
  };
const switchThatChanged = fields.find(
(f) => (f as SwitchableInput).switchField?.id === fieldId,
  };
const field = (inputThatChanged ? inputThatChanged : switchThatChanged) as
| SwitchableInput
| undefined;

  if (!field) return false;

  const isOn = draft[field.switchField.id];
if (isOn && draft[field.id] === '') {
setErrorMsg(draft, field.id, 'Required');
} else if (isOn && field.fieldValidation) {
const { validWhen, method, message, arg } = field.fieldValidation;
if (method(value, arg) === validWhen) {
deleteErrorMsg(draft, field.id);
} else {
setErrorMsg(draft, field.id, message);
}
} else {
deleteErrorMsg(draft, field.id);
}

  return true;
};

export const checkFieldError = (
action: Omit<A.SetFieldValueChanged, 'type'>,
draft: SectionSetState | GenericSectionSetState,
fields: CustomSectionField[],
checkRequired = false,
) => {
const { value, fieldId } = action;

  if (tryHandleSecondaryField(value, fieldId, fields, draft)) {
return;
}

  if (tryHandleMultiSelect(value, fieldId, fields, draft)) {
return;
}

  if (tryHandleSwitchableField(value, fieldId, fields, draft)) {
return;
}

  const mainField = fields.find((f) => f.id === fieldId);
const secondaryField = fields.find(
(f) => (f as TextField).secondaryField?.id === fieldId,
  };
    f (secondaryField) return;

  if (!mainField)
    throw new Error(
      'checkFieldError: Could not find field for action: ${JsoN.stringify('
        action,
      }}`,
    };
  const { fieldValidation } = mainField;
  if (fieldValidation){
    const { validwhen, method, message, arg  = fieldValidation;
    if (method(value, arg) === validwhen){
      deleteErrorMsg(draft, fieldId);
    else {
      setErrorMsg(draft, fieldId, message);
    }
  }
  if (checkRequired && mainField.required && value === -') {
    setErrorMsg(draft, fieldId,'Required');
  }
  if (value !==  && extractErrorMsg(draft, fieldId) === 'Required') {











































};

export const checkTableCellError = (
  action: Omit<A.TableCellValueChanged, 'type'>,
  tableColDraft: any,
  cellType: TableCellType,
} => {
  const { value, colFieldKey } = action;
  const valid =
    customSectionTableCellMap[cellType].isValid?.(value, tableColDraft) ?? true;
  if(valid){
    deleteErrorMsg(tableColDraft, colFieldKey);
   } else {
    setErrorMsg(tableColDraft, colFieldKey, 'Invalid format');
  }
};

[>>
>
  @param draft
   @returns
>[
export const checkTableSpecializedRowError = (draft: SectionTablestate) => l
const { columns } = draft;
console.dir(JSON.parse(JSON.stringify(columns)));
if (columns.some((col) => col.hasOwnProperty(IS_DEFAULT_COLUMN_FIELD_KEY))) {
const noDefaultSet =
columns.filter((col) => col[IS_DEFAULT_COLUMN_FIELD_KEY] === true)
.length === 0;
console.dir({ noDefaultSet });
if (noDefaultSet) {
columns.forEach((col) =>
setErrorMsg(col, IS_DEFAULT_COLUMN_FIELD_KEY, 'No Default Selected'),
      };
} else {
columns.forEach((col) =>
deleteErrorMsg(col, IS_DEFAULT_COLUMN_FIELD_KEY),
      };
}
}
};
