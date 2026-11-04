  'typescript'
import  FieldValidationResult } from '../configuration/dimensionEntryPanelConfigMap';
import { Dimension } from '../Dimensions';

export interface EntryPanelProps {
  id: string;
  id2: string;
  dimension: Dimension;
  onChange: (dataKey: keyof Dimension, value: string | boolean) => void;
  errors?: FieldValidationResult;
  preconfiguredConstants?: string[];
  lineIndex: number;
  isLastLine: boolean;
}
