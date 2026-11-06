import { Core } from 'commonui';

const HomeBankingDataField = {
fieldCode: 'homeBanking',
fieldLabel: 'Home Banking',
fieldType: 'single-select',
value: '',
presentationOrder: 1,
required: true,
options: [
{
label: 'Q2',
value: 'Q2',
},
{
label: 'Fiserv',
value: 'Fiserv',
},
{
label: 'Banno',
value: 'Banno',
},
{
label: 'NCR Digital Insight',
value: 'NCR Digital Insight',
},
{
label: 'Lumin',
value: 'Lumin',
},
{
label: 'Mahalo',
value: 'Mahalo',
},
],
};

const HomeBankingExtensionUrlHelpText =
"To properly redirect consumers through the Credit Union's home banking portal to the digitalstorefront, a url is needed that points directly to the storefront extension." +
  '\nin' +
'In Q2 for example, the url may be found by clicking the storefront extension in the sidebar.The url in the browser might look like' +
'<p style="font-size: 12px">'https://online.mycu.com/mycu/uux.aspx#/extension/Digital_Storefront/Main'</p>' +
  'Inin' +
'The storefront can also be displayed in a widget format inside of Q2.' +
'<p style="font-size: 12px">'https://online.mycu.com/mycu/uux.aspx? widget_location=dashboard.right&widget_name=Digital_Storefront.Main#/landingPage'</p>';

const HomeBankingExtensionUrl = {
fieldCode: 'homeBankingStorefrontUrl',
fieldLabel: 'Home Banking Storefront Url',
helpText: HomeBankingExtensionUrlHelpText,
fieldType: 'text',
value: '',
blockField: true,
hidden: true,
required: false,
presentationOrder: 2,
presentationRules: [
{ field: 'homeBanking', value: 'Q2', required: true, hidden: false },
],
};

const HomeBankingFiId = {
fieldCode: 'homeBankingFiId',
fieldLabel: 'Home Banking FI ID',
fieldType: 'text',
value: '',
required: false,
blockField: true,
presentationOrder: 3,
};

const coreBankingProvider = {
fieldLabel: 'Core Banking Provider',
fieldType: 'single-select',
fieldCode: 'coreBankingProvider',
options: [
{
label: 'Fiserv DNA',
value: 'FISERV',
},
{
label: 'Symitar',
value: 'SYMITAR',
},
],

  value: '',
required: false,
presentationOrder: 4,
};

const TenantIntegrations: Core.LoanApplicationEntities.IFieldGroup[] = [
{
groupCode: 'TENANT-INTEGRATIONS-HOME-BANKING',
groupTitle: '',
hidden: false,
required: true,
dataFields: [
HomeBankingDataField,
HomeBankingExtensionUrl,
HomeBankingFiId,
],
},
{
groupCode: 'TENANT-INTEGRATIONS-CORE-BANKING',
groupTitle: '',
hidden: false,
required: true,
dataFields: [coreBankingProvider],
},
];

export { TenantIntegrations };
