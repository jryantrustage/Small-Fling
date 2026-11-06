typescript
import { Add } from '@material-ui/icons';
import { DynamicInputField, Icon, ICON_TYPES, Table } from 'commonui';
import { CardSection } from 'components/Card/CardSection';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import {
SCActionButton,
SCActions,
  SCHeader,
SCTableOverride,
} from 'components/TableStyles';
import React, { ReactElement } from 'react';
import { validationUtils } from '../../helpers/validation/ValidationUtils';
import { SCActionsContainer, SCButton, SCCancelButton } from './styles';
import './TaskTemplates.css';
import { useTaskTemplates } from './useTaskTemplates';

const TaskTemplates = (): ReactElement => {
const {
taskTemplates,
taskTypes,
loading,
errorResponse,
classes,
addTaskTemplate,
setTaskTemplates,
saveChanges,
removeTaskTemplate,
discardChangesWarning,
validate,
} = useTaskTemplates();

  const formatdata = (): any =>
taskTemplates.map((taskTemplate, index) => {
return {
...taskTemplate,
title: (
<DynamicInputField
dataField={{
placeholder: 'Enter task title',
fieldType: 'text',
fieldCode: `title-input-${index}`,
maxLength: 100,
}}
error={validate && !taskTemplate.title ? 'Required' : undefined}
validateAllFields
value={taskTemplate.title}
onChange={(_, newValue) => {
taskTemplate.title = newValue;
setTaskTemplates([...taskTemplates]);
}}
          [>
        },
description: (
<DynamicInputField
dataField={{
placeholder: 'Enter description',
fieldType: 'text',
fieldCode: `description-input-${index}`,
maxLength: 500,
}}
value={taskTemplate.description}
onChange={(_, newValue) => {
taskTemplate.description = newValue;
setTaskTemplates([...taskTemplates]);
}}
          [>
        },
type: (
<DynamicInputField
dataField={{
placeholder: 'Select Task Type',
fieldType: 'single-select',
fieldCode: `type-select-${index}`,
options: taskTypes.map((taskType) => ({
value: `${taskType.id}`,
label: taskType.name,
              }]},
}}
error={validate && !taskTemplate.typeId ? 'Required' : undefined}
validateAllFields
value={`${taskTemplate.typeId}`}
onChange={(_, newValue) => {
taskTemplate.typeId = validationUtils.validateIsNumber(newValue)
? (newValue as unknown as number)
: undefined;
setTaskTemplates([...taskTemplates]);
}}
          [>
        },
actions: (
<SCActions>
<SCActionButton
id={`task-template-delete-button-${index}`}
onClick={async () => {
await removeTaskTemplate(taskTemplate);
}}
color="red"
aria-label="Delete Task Template"
>
<Icon size={10} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
</SCActions>
        },
};
    }};

  const staticColumn = {
filterable: false,
sortable: false,
};

  return (
<div>
<CardSection title="Task Templates">
        >>
<SCButton
id="add-task-template-button"
color="success"
onClick={() => addTaskTemplate()}
>
Add
<Add className={classes.icons} />
</SCButton>
<SCTableOverride>
<Table
data={formatdata()}
filterable={false}
sortable={false}
minRows={0}
columns={[
{
...staticColumn,
Header: <SCHeader>Title*</SCHeader>,
accessor: 'title',
},
{
...staticColumn,
Header: <SCHeader>Description</SCHeader>,
accessor: 'description',
},
{
...staticColumn,
Header: <SCHeader>Task Type*</SCHeader>,
accessor: 'type',
maxWidth: '400px',
},
{
...staticColumn,
Header: '',
maxWidth: '75px',
accessor: 'actions',
},
]}
pageSize={25}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
/>
</SCTableOverride>
        >[>
</CardSection>
<SCActionsContainer>
<SCCancelButton
isSecondary
id="cancel-task-templates-changes"
onClick={discardChangesWarning}
>
Cancel
</SCCancelButton>
<SCButton id="save-task-templates" onClick={saveChanges}>
Save
</SCButton>
</SCActionsContainer>
{(loading || errorResponse) && (
<FullPageStatus errorResponse={errorResponse} />
      ]}
</div>
  ];
};

export default TaskTemplates;
