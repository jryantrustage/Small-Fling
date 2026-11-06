[>>
* The core product setting types
>
* ! This list may not be complete. !
>[
enum CoreProductSettingTypes {
DYNAMIC_FORM = 'dynamic-form',
TEXT_ENTRY = 'text-entry',
TEXTBOX = 'textbox',
NUMBER = 'number',
ON_OFF = 'on-off',
SINGLE_SELECT = 'single-select-list',
MULTI_SELECT = 'multi-select-list',
COMBOX_TEXT = 'combo-text-field',
ADD_OPTION = 'add-option',
}

[>>
* The core product setting value types
>
* ! This list may not be complete. !
>[
enum CoreProductSettingValueTypes {
BOOLEAN = 'boolean',
CODE = 'code',
DATE = 'date',
INTEGER = 'integer',
NUMBER = 'number',
TEXT_ENTRY = 'text-entry',
URL = 'url',
}

enum RecordState {
Active = 'Active',
Draft = 'Draft',
Inactive = 'Inactive',
NotInUse = 'Not-in-use',
}

enum TenantTypeCodes {
CreditUnion = 'CU',
APIClient = 'APICLIENT',
}

enum LosIdEnum {
ALLEGRO = 'Allegro',
MERIDIANLINK = 'MeridianLink',
SYNC1 = 'Sync1',
TEMENOS = 'Temenos',
}

export {
CoreProductSettingTypes,
CoreProductSettingValueTypes,
RecordState,
TenantTypeCodes,
LosIdEnum,
};
