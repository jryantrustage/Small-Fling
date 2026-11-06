import React, { ReactElement, useEffect, useState } from 'react';
import { getPhysicalAddressOneLine } from 'helpers/addresshelper';
import { Table, Icon, ICON_TYPES, DynamicNotification } from 'commonui';
import {
SCActions,
SCActionButton,
SCHeader,
SCPending,
SCStatus,
SCActionButtonLink,
SCButton,
SCRightRow,
} from '../TableStyles';
import { useTenantsList } from './useTenantsList';
import { Paths } from 'layouts/RouterSwitch';
import { Link, generatePath } from 'react-router-dom';
import { useAppContext } from 'context/app-context';
import { Tenant, TenantsListProps } from './types';
import { useTenantTypeModal } from './TenantTypeModal';

interface FormattedData extends Record<string, any> {
id: string;
}

const TenantsList = ({ data }: TenantsListProps): ReactElement => {
const { rePublishTenantCreationEvent, rePublishAllTenants } =
useTenantsList();

  const RepublishAllTenantsButton = ({
tenantEntries,
}: {
tenantEntries: Tenant[];
}): ReactElement => {
const allTenants = tenantEntries.map(({ id }) => id);
return (
<SCButton
id={`re_publish_all_tenants`}
aria-label="publishAll"
title="RePublish All Tenants"
color="green"
onClick={() => {
rePublishAllTenants(allTenants);
}}
>
<Icon size={20} name={ICON_TYPES.UPLOAD_CLOUD} /> Republish Tenants
</SCButton>
    ];
};

  const formatdata = (tenantEntries: Tenant[]): FormattedData[] =>
tenantEntries.map(
      [{
id,
legalName,
addresses,
tenantTypeName,
creationPending,
contractNumber,
recordState,
      )=>(
id,
legalName,
name: (
<Link to={generatePath(Paths.TenantView, { tenantId: id })}>
{legalName}
</Link>
        },
address: getPhysicalAddressOneLine(addresses),
type: tenantTypeName,
creationPending,
contractNumber,
creationPendingElement: (
<SCPending pending={creationPending}>
{creationPending ? 'Yes' : 'No'}
</SCPending>
        },
republishTenant: (
<SCActionButton
id={`${id}_re_publish`}
aria-label="publish"
title="RePublish Tenant"
color="green"
onClick={() => {
rePublishTenantCreationEvent(id);
}}
>
<Icon size={20} name={ICON_TYPES.UPLOAD_CLOUD} />
</SCActionButton>
        },
status: <SCStatus status={recordState}>{recordState}</SCStatus>,
actions: (
<SCActions id={id}>
<SCActionButtonLink
title="View Tenant"
id={`${id}_view`}
aria-label="view"
color="blue"
to={generatePath(Paths.TenantView, { tenantId: id })}
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
<SCActionButtonLink
title="Edit Tenant"
id={`${id}_edit`}
aria-label="edit"
color="green"
to={generatePath(Paths.TenantEdit, { tenantId: id })}
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
</SCActions>
        },
      }],
    ];

  const staticColumn = {
filterable: false,
sortable: false,
};

  const { createButtonClicked, setCreateButtonClicked } = useAppContext();

  useEffect(() => {
if (!createButtonClicked) return;
setCreateButtonClicked(false);
}, [createButtonClicked]);

  useTenantTypeModal(createButtonClicked);

  return (
    >>
<DynamicNotification limit={1} />
<SCRightRow>
<RepublishAllTenantsButton tenantEntries={data} />
</SCRightRow>
<Table
data={formatdata(data)}
filterable
sortable
columns={[
{
Header: <SCHeader>Name</SCHeader>,
accessor: 'name',
serialize: (row) => row?.legalName ?? '',
},
{
Header: <SCHeader>Contract Number</SCHeader>,
accessor: 'contractNumber',
},
{
Header: <SCHeader>Address</SCHeader>,
accessor: 'address',
},
{
...staticColumn,
Header: <SCHeader>Type</SCHeader>,
accessor: 'type',
maxWidth: '100px',
},
{
...staticColumn,
Header: <SCHeader>Pending</SCHeader>,
accessor: 'creationPendingElement',
maxWidth: '100px',
},
{
...staticColumn,
Header: '',
accessor: 'republishTenant',
maxWidth: '80px',
},
{
...staticColumn,
Header: <SCHeader>Status</SCHeader>,
accessor: 'status',
maxWidth: '80px',
},
{
...staticColumn,
Header: '',
accessor: 'actions',
maxWidth: '120px',
},
]}
      [>
</>
  ];
};

export default TenantsList;
