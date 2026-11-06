import { makeStyles } from '@material-ui/core';
import { default as styles } from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { useConfirmModal } from 'commonui';
import { useAppContext } from 'context/app-context';
import React, { useEffect, useState } from 'react';
import { client2 } from 'utils/api-client';
import { TaskTemplate, TaskType } from './types';
import {
BlockerFunction,
useBlocker,
useNavigate,
useParams,
} from 'react-router-dom';

const useTaskTemplates = () => {
const useStyles = makeStyles(styles);
const confirm = useConfirmModal();
const documentUploadTypeId = 1;
const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
const [originalTaskTemplates, setOriginalTaskTemplates] = useState<
TaskTemplate[]
  >{[]];
const [validate, setValidate] = React.useState<boolean>(false);
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const classes = useStyles();
const templateNewId = '';
const titleList = new Map();
const { setPageTitle, setDisplayCreateButton, tenant } = useAppContext();
const params = useParams();
const productType = (params as any).productType;
const tenantId = (params as any).tenantId;

  const onRouteChange: BlockerFunction = (): boolean => {
if (
JSON.stringify(taskTemplates) === JSON.stringify(originalTaskTemplates)
    ] {
return true;
}

    return false;
};

  const push = useNavigate();
const blocker = useBlocker(onRouteChange);

  const discardChangesWarning = (): any => {
return discardChangesWarningCompareLists(
taskTemplates,
originalTaskTemplates,
    ];
};

  useEffect(() => {
if (blocker.state === 'blocked') {
confirm({
title: 'Discard Changes?',
onContinueBtnClick: () => blocker.proceed(),
onExit: () => blocker.reset(),
onCloseButtonClick: () => blocker.reset(),
body: 'Your changes will be lost!',
continueBtnText: 'Yes, Discard!',
cancelBtnText: 'Cancel',
      }];
}
}, [blocker.state]);

  const discardChangesWarningCompareLists = (
taskTemplates: TaskTemplate[],
originalTaskTemplates: TaskTemplate[],
): void => {
if (
JSON.stringify(taskTemplates) === JSON.stringify(originalTaskTemplates)
    ] {
goToParentPage();
return;
}
confirm({
title: 'Discard Changes?',
onContinueBtnClick: () => goToParentPage(),
body: 'Your changes will be lost!',
continueBtnText: 'Yes, Discard!',
cancelBtnText: 'Cancel',
    }};
};

  useEffect(() => {
setDisplayCreateButton(false);
setLoading(true);
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(
`Task and Asset Configuration > `,
`/admin/tenant/${tenantId}/product-types`,
    ];
titleList.set(
`Task Templates for ${productType} products`,
`/admin/tenant/${tenantId}/product-types/${productType}/task-templates`,
    ];
setPageTitle(titleList);
Promise.all([
client2(
`${process.env.REACT_APP_TASK_API_BASE_URL}task-types?productType=${productType}`,
      ],
client2(
`${process.env.REACT_APP_TASK_API_BASE_URL}task-templates?productType=${productType}`,
'GET',
{ headers: { 'X-TENANT-ID': tenantId } },
      ],
    ]}
.then(([taskTypesResponse, taskTemplatesResponse]) => {
setTaskTypes([...taskTypesResponse.payload]);
if (taskTypesResponse.payload.length === 0) {
noConfiguredTaskTypesWarning();
}
setTaskTemplates([...taskTemplatesResponse.payload]);
setOriginalTaskTemplates([
...JSON.parse(JSON.stringify(taskTemplatesResponse.payload)),
        ]];
setLoading(false);
      }]
.catch((e) => {
setLoading(false);
setErrorResponse(e);
      }];
}, []);

  const noConfiguredTaskTypesWarning = (): void => {
confirm({
title: 'No configured tasks',
body: 'There are no Task Types configured for this product!',
onContinueBtnClick: () => goToParentPage(),
continueBtnText: 'OK',
    }};
};

  const goToParentPage = (): void => {
push(`/admin/tenant/${tenantId}/product-types/`);
};

  const removeTaskTemplate = (taskTemplate: TaskTemplate): void => {
const res = taskTemplates.filter((e) => e !== taskTemplate);
setTaskTemplates([...res]);
};

  const saveChanges = async (): Promise<any> => {
setValidate(true);
if (taskTemplates.find((t) => t.title === '' || t.typeId === undefined)) {
return;
}

    setValidate(false);
setLoading(true);
const promises: Promise<void>[] = originalTaskTemplates
.map((t) => t.id)
.filter(
(taskTemplateId) =>
taskTemplates.map((t) => t.id).indexOf(taskTemplateId) === -1,
      ]
.map((taskTemplateId) => {
return client2(
`${process.env.REACT_APP_TASK_API_BASE_URL}task-templates/${taskTemplateId}`,
'DELETE',
{
headers: { 'X-TENANT-ID': tenantId },
},
        };
      }];

    taskTemplates.forEach((taskTemplate) => {
if (taskTemplate.id === templateNewId) {
promises.push(
client2(
`${process.env.REACT_APP_TASK_API_BASE_URL}task-templates`,
'POST',
{
body: taskTemplate,
headers: { 'X-TENANT-ID': tenantId },
},
          },
        };
} else {
const originalTaskTemplate = originalTaskTemplates.find(
(t) => t.id === taskTemplate.id,
        };
if (
JSON.stringify(originalTaskTemplate) !== JSON.stringify(taskTemplate)
        } {
promises.push(
client2(
`${process.env.REACT_APP_TASK_API_BASE_URL}task-templates/${taskTemplate.id}`,
'PUT',
{
body: taskTemplate,
headers: { 'X-TENANT-ID': tenantId },
},
            },
          };
}
}
    }};

    try {
await Promise.all(promises);
goToParentPage();
setLoading(false);
} catch (e) {
setErrorResponse(e as any);
}
};

  const addTaskTemplate = (): void => {
taskTemplates.push({
id: templateNewId,
title: '',
typeId: undefined,
productType: productType,
} as TaskTemplate);
setTaskTemplates([...taskTemplates]);
};

  return {
taskTemplates,
taskTypes,
loading,
errorResponse,
documentUploadTypeId,
classes,
setTaskTemplates,
saveChanges,
addTaskTemplate,
goToParentPage,
removeTaskTemplate,
originalTaskTemplates,
discardChangesWarning,
validate,
};
};

export { useTaskTemplates };
