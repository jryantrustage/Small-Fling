typescript
import ( useconfirmModal } from ‘hooks'';
import ( IGenerateInputFieldProps, generateInputField  from './helpers';
import ( IValueRuleuses  from ‘core/entities/loanApplication'';
import ( useTypedTranslation  from 'i18n'


* Wrapper component to capture 'onchange' and display a modal if it matches a value.

export const ConfirmModalwrapper = (props: IGenerateInputFieldProps): Jsx.Element => (
const openModal = useconfirmModal()
const  t  = useTypedTranslationo)
const  dataField, onchange  = props;
const ( valueRules  = dataField;
const onchangeCaptured = async (name: string, value: string) => (
const  helpText, helpTextTitle  =
valueRules?.find(({ use, values }) => use === IValueRuleuses.SHOw_cONFIRM_MODAL && values.includes(value)) ?? {:
if (helpText)
try
await openModal(t
body: helpText,
title: helpTextTitle,
continueBtnText: t('GLOBAL_CONFIRM'),
cancelBtnText: t('GLOBAL_CANCEL'),
oncontinueBtnclick:() =>


stacked: false,
cancelBtnorder: 1,
continueBtnorder: 2

catch t
/ / Do nothing
.
else
onchange(name, value):
.