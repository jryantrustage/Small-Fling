import { Core } from 'commonui';
import ViewMode from 'context/view-mode';
import { RecordState } from 'types';

export interface IDynamicFormSetting {
context: {
addSettingValidationListener: any;
getErrorState: (settingCode: string) => string;
getSettingValue: (settingCode: string) => string;
notifyChange: (settingCode: string, value: string) => void;
state: {
requestedState: RecordState;
settingsMap: Map<string, { value: string }>;
};
updateError: (settingCode: string, error: any) => string;
};
setting: {
settingCode: string;
segment: Core.LoanApplicationEntities.ISectionSegment;
};
viewMode: ViewMode;
}
