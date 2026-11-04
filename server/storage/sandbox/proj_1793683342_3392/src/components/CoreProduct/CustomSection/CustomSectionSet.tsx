







































    _setExpanded((state) => {
      return {
          .state,
        [i]: value,
      };
    }};
  },[};

  const setAllExpandedTo = React.useCallback((value: boolean) =>
    _setExpanded((state) => {
      const newstate: any = {};
      Object.keys(state).forEach((i) => {
        newState[i] = value;
      }};
      return newstate;
    }};
  },[);

  return {
    expandedstate,
    setExpanded,
    setAllExpandedTo,



















  const renderViewField = (field: CustomSectionField) => {
    const secondaryId = utils.getSecondaryFieldId(field);
    const secondaryValue = secondaryId
      ? sectionSetState[secondaryId]
      : undefined;
    const htmlId = utils.htmlId(sectionSetIndex, field.id);
    return(
      <React.Fragment key={field.id}>
        <CustomSectionViewField
          key={htmlId}
          htmlId={htmlId}
          field={field}
          sectionSetIndex={sectionSetIndex}
          value={sectionSetState[field.id]}
          secondaryValue={secondaryValue}
        [>
  </React.Fragment>
    };
};

  const renderEditField = (field: CustomSectionField) => {
    const htmlId = utils.htmlId(sectionSetIndex, field.id);
const secondaryId = utils.getSecondaryFieldId(field);
return (
<CustomSectionEditField
key={htmlId}
sectionSetIndex={sectionSetIndex}
field={field}
value={sectionSetState[field.id]}
errorMsg={utils.extractErrorMsg(sectionSetState, field.id)}
secondaryValue={secondaryId ? sectionSetState[secondaryId] : undefined}
secondaryErrorMsg={
secondaryId
? utils.extractErrorMsg(sectionSetState, secondaryId)
: undefined
}
      [>
    };
};

  const renderSetFieldColumns = () => {
return viewMode === 'view' ? (
<GridContainer style={{ width: 'calc(100% + 80px)' }}>
<GridItem xs={6}>{sectionSetFieldsCol1.map(renderViewField)}</GridItem>
<GridItem xs={6}>{sectionSetFieldsCol2.map(renderViewField)}</GridItem>
</GridContainer>
    } : {
<GridContainer>
<GridItem xs={6}>{sectionSetFieldsCol1.map(renderEditField)}</GridItem>
<GridItem xs={6}>{sectionSetFieldsCol2.map(renderEditField)}</GridItem>
</GridContainer>
    };
};

  const renderDimensionedTables = () => {
if (!tableConfig) return;
if (!dimensionSpec) return;
const tables = sectionSetState.tables;
const sectionSetTablesList = tables ? Object.values(tables) : [];
const displayFilter = extraDimensions.length > 1;
const chipFactory = getDimensionChipFactory(extraDimensions);
const tableElements = sectionSetTablesList.map((tableState, i) => {
const { dimensions: tableDimensions } = tableState;
if (!tableDimensions) throw new Error('no dimensions for table found');
if (filterMgmt.filterOut(tableDimensions)) {
return;
}
const chips = tableDimensions.map((dim, i) => {

dimensionConfigMap[dim.dimensionName as DimensionName]?.labelFN(
dim,
) ?? '';
return chipFactory(chipLabel);
      }};
const expanded = extraDimensions.length > 3 ? !!expandedState[i] : true;
return (
<Accordion
key={`table-expansion-${i}`}
expanded={expanded}
onChange={() => setExpanded(i, !expandedState[i])}
>
<AccordionSummary
expandIcon={<ExpandMoreIcon />}
aria-controls="panel1a-content"
id="panel1a-header"
>
{chips}
</AccordionSummary>
<AccordionDetails
style={{ display: 'flex', flexDirection: 'column' }}
>
<CustomSectionTable
              key={'section-${sectionSetIndex + 1}-table-${i + 1}'}
              sectionSetIndex={sectionSetIndex}
              tableIndex={i}
              tablestate={tablestate}
            [>
          </AccordionDetails>
        </Accordion>
      };
    }};

    return(
      >>
        {displayFilter &&(
          <DimensionFilter {...filterMgmt} dimensions={extraDimensions} />
        }}
{tableElements}
      >[>
    };
  };

  const renderTables = () => {
    if (!tableConfig) return;
    const tables = sectionSetstate.tables;
    const sectionSetTablesList = tables ? Object.values(tables) : [l;
const showAddtableBtn =
viewMode !== 'view' &&
sectionSetTablesList.length < tableConfig.tablesPerSet;
const showRemovetableBtn =
viewMode !== 'view' && sectionSetTablesList.length > 1;
const tableElements = sectionSetTablesList.map((tableState, i) => {
return (
<React.Fragment key={i}>
<CustomSectionTable
key={`section-${sectionSetIndex + 1}-table-${i + 1}`}
sectionSetIndex={sectionSetIndex}
tableIndex={i}
tableState={tableState}
          [>
<GridItem xs={12} lg={12}>
{showRemovetableBtn && (
<Button
id={`${sectionSetIndex + 1}-table-${i + 1}-remove-button`}
round
color="danger"
style={{ marginBottom: '24px' }}
onClick={() =>
stateDispatch({
type: 'TABLE_REMOVED',
sectionSetIndex,
tableIndex: i,
                  }]
}
>
<Delete /> Remove Table
</Button>
            ]}
</GridItem>
</React.Fragment>
      };
    }};
return (
      >>
{tableElements}
{showAddtableBtn && (
<GridItem xs={12} lg={12}>

















};

  return (
<div>
{renderSetFieldColumns()}
{dimensionSpec ? renderDimensionedTables() : renderTables()}
</div>
  };
};

export default React.memo(CustomSectionSet);
