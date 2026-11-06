import CoreProduct from 'components/CoreProduct/CoreProduct';
import CoreProductsList from 'components/CoreProductsList/CoreProductsList';
import CreateMerchant from 'components/CreateMerchant/CreateMerchant';
import CreditScoreRanges from 'components/CreditScoreRanges/CreditScoreRanges';
import DSFReports from 'components/DSFReports/DSFReports';
import EntityUpgraderReports from 'components/EntityUpgraderReports/EntityUpgraderReports';
import LoanAppForm from 'components/LoanAppForm/LoanAppForm';
import LoanAppFormsList from 'components/LoanAppFormsList/LoanAppFormsList';
import LosStatusMappingList from 'components/LosStatusMappings/LosStatusMappingList';
import ManageTenant from 'components/ManageTenant/ManageTenant';
import { MapCoreProductTemplates } from'components/MapCoreProductTemplates/MapCoreProductTemplates';
import MapLoanTemplates from 'components/MapLoanTemplates/MapLoanTemplates';
import Eligibility from 'components/Membership/Eligibility';
import MerchantList from 'components/MerchantList/MerchantList';
import System from 'components/System/System';
import { DocumentsList } from 'components/Documents/DocumentsList';
import SystemRole from 'components/SystemRoles/Role';
import TenantBranding from 'components/TenantBranding/TenantBranding';
import ViewMerchant from 'components/ViewMerchant/ViewMerchant';
import ViewTenant from 'components/ViewTenant/ViewTenant';
import { ProductTypes } from 'components/ProductTypes/ProductTypes';
import { SmsAllowlist } from 'components/SmsAllowlist/SmsAllowlist';
import TaskTemplates from 'components/ProductTypes/TaskTemplates';
import Reports from 'components/Reports/Reports';
import CreateTenant from 'views/CreateTenant/CreateTenant';
import LoanTemplatesList from 'components/LoanTemplatesList/LoanTemplatesList';
import IntegrationTemplatesList from'components/IntegrationTemplatesList/IntegrationTemplatesList';
import ViewLoanFormTemplate from 'components/LoanFormTemplate/ViewLoanFormTemplate';
import ViewIntegrationTemplate from 'components/IntegrationTemplate/ViewIntegrationTemplate';
import { CoreProductTemplates } from 'components/CoreProductTemplates';
import { TenantRolesList } from 'components/TenantRoles/TenantRolesList';
import TenantIntegrationProfilesList from'components/LoadTenantIntegrationProfiles/TenantIntegrationProfilesList';
import TenantIntegrationProfile from'components/LoadTenantIntegrationProfiles/TenantIntegrationProfile';
import { useGetFeatureFlags } from 'utils/launchDarkly';
import { useEffect, useState } from 'react';
import { DashRoutes } from './types';
import { Paths } from './paths';
import AssetTypes from 'components/ProductTypes/AssetTypes';
import Decisioning from 'components/Decisioning/Decisioning';
import LosStatusMappings from 'components/LosStatusMappings/LosStatusMappings';
import { LosIdEnum } from 'types';

export const baseDashRoutes: DashRoutes[] = [
{
path: Paths.System,
name: 'System',
icon: 'Key',
component: System,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.SystemDocuments,
name: 'Document Management',
icon: '',
component: DocumentsList,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.SmsAllowlist,
name: 'Sms Allowlist',
icon: '',
component: SmsAllowlist,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.Reports,
name: 'Reports',
icon: '',
component: Reports,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.DSFReports,
name: 'DSF Reports',
icon: '',
component: DSFReports,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.EntityUpgraderReports,
name: 'EntityUpgrader Reports',
icon: '',
component: EntityUpgraderReports,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.IntegrationTemplates,
name: 'Integration Templates',
icon: '',
component: IntegrationTemplatesList,
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
{
path: Paths.LoanFormTemplates,
name: 'Loan Form Templates',
icon: '',
component: LoanTemplatesList,
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
{
path: Paths.SystemCoreProductTemplates,
name: 'Core Product Templates',
component: CoreProductTemplates,
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
{
path: Paths.LoanFormTemplatesCreate,
name: '',
component: ViewLoanFormTemplate,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.LoanFormTemplatesManage,
name: '',
component: ViewLoanFormTemplate,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.IntegrationTemplatesCreate,
name: '',
component: ViewIntegrationTemplate,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.IntegrationTemplatesManage,
name: '',
component: ViewIntegrationTemplate,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.SystemRolesCreate,
name: '',
component: SystemRole,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.SystemRoles,
name: '',
component: SystemRole,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.TenantCreate,
name: '',
component: CreateTenant,
hidden: true,
isHomeRoute: true,
},
{
path: Paths.Tenant,
name: 'Tenants',
icon: 'Key',
component: ManageTenant,
hidden: false,
isHomeRoute: true,
},
{
path: Paths.TenantView,
name: 'View Tenant',
component: ViewTenant,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.TenantEdit,
name: 'Edit Tenant',
icon: '',
component: CreateTenant,
hidden: true,
isTenantRoute: true,
},
{
path: Paths.CoreProductAssociation,
name: 'Core Product Association',
icon: '',
component: MapCoreProductTemplates,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.CoreProducts,
name: 'Core Products',
icon: '',
component: CoreProductsList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.CoreProductTemplate,
name: '',
component: CoreProduct,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.CoreProductsManage,
name: '',
component: CoreProduct,
hidden: true,
useTenantContainer: true,
selfSubNavName: 'Configuration',
},
{
path: Paths.Merchants,
name: 'Merchants',
icon: '',
component: MerchantList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.CreditScoreRanges,
name: 'Credit Score Ranges',
icon: '',
component: CreditScoreRanges,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.MerchantEdit,
name: '',
component: CreateMerchant,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.MerchantCreate,
name: '',
component: CreateMerchant,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.MerchantView,
name: '',
component: ViewMerchant,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.TenantBranding,
name: 'Branding',
icon: '',
component: TenantBranding,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.MapLoanTemplates,
name: 'Loan Template Association',
icon: '',
component: MapLoanTemplates,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.LoanAppForms,
name: 'Loan App Forms',
icon: '',
component: LoanAppFormsList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.CoreProductLoanAppForm,
name: 'Loan App Forms',
icon: '',
component: LoanAppForm,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.LoanAppForm,
name: 'Loan App Forms',
icon: '',
component: LoanAppForm,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.UpgradeLoanAppForm,
name: 'Loan App Forms',
icon: '',
component: LoanAppForm,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.LosStatusMappings,
name: 'Loan App Status Mapping',
icon: '',
component: LosStatusMappingList,
hidden: false,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.MeridianLinkStatusMappings,
name: 'Meridian Link Loan App Status Mapping',
icon: '',
component: LosStatusMappings,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
parent: Paths.LosStatusMappings,
props: { losId: LosIdEnum.MERIDIANLINK },
},
{
path: Paths.AllegroStatusMappings,
name: 'Allegro Loan App Status Mapping',
icon: '',
component: LosStatusMappings,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
parent: Paths.LosStatusMappings,
props: { losId: LosIdEnum.ALLEGRO },
},
{
path: Paths.TemenosStatusMappings,
name: 'Temenos Loan App Status Mapping',
icon: '',
component: LosStatusMappings,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
parent: Paths.LosStatusMappings,
props: { losId: LosIdEnum.TEMENOS },
},
{
path: Paths.Sync1StatusMappings,
name: 'Sync1 Loan App Status Mapping',
icon: '',
component: LosStatusMappings,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
parent: Paths.LosStatusMappings,
props: { losId: LosIdEnum.SYNC1 },
},
{
path: Paths.Membership,
name: 'Membership',
icon: '',
component: Eligibility,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.ProductTypes,
name: 'Task and Asset Configuration',
icon: '',
component: ProductTypes,
hidden: false,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.TaskTemplates,
name: 'Task Templates',
icon: '',
component: TaskTemplates,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.AssetTypes,
name: 'Asset Types',
icon: '',
component: AssetTypes,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.TenantRoles,
name: 'User Role Association',
icon: '',
component: TenantRolesList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.TenantIntegrationProfiles,
name: 'Integration Profiles',
icon: '',
component: TenantIntegrationProfilesList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
{
path: Paths.TenantIntegrationProfileManage,
name: '',
component: TenantIntegrationProfile,
hidden: true,
useTenantContainer: true,
},
{
path: Paths.TenantDocuments,
name: 'Documents',
icon: '',
component: DocumentsList,
hidden: true,
isTenantRoute: true,
useTenantContainer: true,
},
];

const decisioningRoutes: DashRoutes[] = [
{
path: Paths.RuleSetList,
name: 'Decisioning',
icon: '',
component: Decisioning,
hidden: false,
isTenantRoute: true,
useTenantContainer: true,
},
];

export const useRoutes = (): {
routes: DashRoutes[];
decisionRoutes: DashRoutes[];
} => {
const decisioningActive = useGetFeatureFlags('DECISIONING');
const [decisionRoutes, setDecisionRoutes] = useState<DashRoutes[]>([]);

  useEffect(() => {
if (decisioningActive) {
setDecisionRoutes(decisioningRoutes);
}
}, [decisioningActive]);

  return {
routes: baseDashRoutes,
decisionRoutes,
};
};
