import { CustomSectionState } from './types';

export interface SectionErrorCheck {
type: 'SECTION_ERROR_CHECK';
}

export interface SectionRemovedAction {
type: 'SECTION_REMOVED';
sectionIndex: number;
}

export interface StateResetAction {
type: 'STATE_RESET';
newState: CustomSectionState;
}

export interface SectionSetAdded {
type: 'SECTION_SET_ADDED';
}

export interface SetFieldValueChanged {
type: 'SET_FIELD_VALUE_CHANGED';
  sectionSetIndex: number;
  fieldId: string;
value: string;
}

export interface TableAdded {
type: 'TABLE_ADDED';
  sectionSetIndex: number;
}





















value: string;
}

export type CustomSectionAction =
| SectionRemovedAction
| StateResetAction
| SectionSetAdded
| SetFieldValueChanged
| TableAdded
| TableRemoved
| TableFieldValueChanged
| TableCellValueChanged
| SectionErrorCheck;
