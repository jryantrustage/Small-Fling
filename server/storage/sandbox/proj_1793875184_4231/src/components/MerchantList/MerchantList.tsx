import React, { ReactElement, useEffect, useState } from 'react';
import { Icon, ICON_TYPES, IRow, Table } from 'commonui';
import {
Link,
generatePath,
useLocation,
useNavigate,
useParams,
} from 'react-router-dom';

import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import Primary from 'components/Typography/Primary';
import Success from 'components/Typography/Success';
import {
SCActionButtonLink,
SCActions,
SCHeader,
} from 'components/TableStyles';
import { getPhysicalAddressOneLine } from 'helpers/addresshelper';
import { useAppContext } from 'context/app-context';

import { client2 } from 'utils/api-client';
import { Merchant } from './types';
import { SCMerchantList } from './styles';
import { Paths } from 'layouts/RouterSwitch';

const MerchantList = (): ReactElement => {
const {
tenant,
setDisplayCreateButton,
createButtonClicked,
setCreateButtonClicked,
setPageTitle,
} = useAppContext();

  const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [tableData, setTableData] = useState<Merchant[] | []>([]);
const push = useNavigate();
const location = useLocation();
const titleList = new Map();
const tenantId = useParams()?.tenantId;

  //call service to get the list of merchants for tenant.
useEffect(() => {
setDisplayCreateButton(true);
setLoading(true);

    if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(`Merchants`, `/admin/tenant/${tenantId}/merchant`);
setPageTitle(titleList);
//Enable for Dev testing
client2(
`${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants?tenantId=${tenantId}`,
    ]
.then((data) => {
setTableData(data.payload);
setLoading(false);
      }]
.catch((error) => {
console.error(error);
setLoading(false);
setErrorResponse(error);
      }];

    //Enable for local testing
//setData(new FakeTenants().getMerchants(tenantId))
//setLoading(false)
}, []);

  // configure the create button action

  /* istanbul ignore next */
useEffect(() => {
if (!createButtonClicked) return;
setCreateButtonClicked(false);
push(`${location.pathname}/create`);
}, [createButtonClicked]);

  const formatdata = (data: Merchant[]): IRow[] =>
data.map(({ id, legalName, merchantTypeName, recordState, addresses }) => {
const tenantId = tenant?.id ?? '';
const merchantId = id;
const viewLink = generatePath(Paths.MerchantView, {
tenantId,
merchantId,
      }];
const editLink = generatePath(Paths.MerchantEdit, {
tenantId,
merchantId,
      }];
return {
id: id,
name: <Link to={viewLink}>{legalName}</Link>,
address: getPhysicalAddressOneLine(addresses),
type: merchantTypeName,
legalName,
status:
'Active' === recordState ? (
<Success>
<b>{recordState}</b>
</Success>
          } ; {
<Primary>
<b>{recordState}</b>
</Primary>
          },
actions: (
// we've added some custom button actions
<SCActions id={id}>
{/* use this button to add a like kind of action */}
<SCActionButtonLink
id={`${id}_view`}
to={viewLink}
title="View Merchant"
aria-label="view-merchant"
color="blue"
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>{' '}
{/* use this button to add a edit kind of action */}
<SCActionButtonLink
id={`${id}_edit`}
title="Edit Merchant"
aria-label="edit-merchant"
to={editLink}
color="green"
>
<Icon size={14} name={ICON_TYPES.EDIT} />
</SCActionButtonLink>
</SCActions>
        },
};
    }};

  useEffect(() => {
if (
(!tableData || tableData.length === 0) &&
tenant?.id &&
!loading &&
!errorResponse
    ] {
const createLink = generatePath(Paths.MerchantCreate, {
tenantId: tenant.id,
      }];

      push(createLink);
}
}, [tableData, tenant, loading, errorResponse]);

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  const staticColumn = {
filterable: false,
sortable: false,
};

  return (
<SCMerchantList role="table-container" aria-label="merchantListGrid">
{tableData && (
<Table
data={formatdata(tableData)}
filterable
sortable
columns={[
{
Header: <SCHeader>Name</SCHeader>,
accessor: 'name',
serialize: ({ legalName }) => legalName,
},
{
Header: <SCHeader>Address</SCHeader>,
accessor: 'address',
serialize: ({ address }) => address,
},
{
...staticColumn,
Header: <SCHeader>Type</SCHeader>,
accessor: 'type',
maxWidth: '250px',
},
{
...staticColumn,
Header: <SCHeader>Status</SCHeader>,
accessor: 'status',
maxWidth: '100px',
},
{
...staticColumn,
Header: '',
accessor: 'actions',
maxWidth: '120px',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
getTrGroupProps={() => {
return {
style: { height: '65px' },
};
}}
        [>
      ]}
</SCMerchantList>
  ];
};

export default MerchantList;
