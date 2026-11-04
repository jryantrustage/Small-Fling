/* eslint react/display-name:warn */
import React from 'react';
import { Theme, withStyles } from '@material-ui/core';
import Chip from '@material-ui/core/Chip';
import { Dimension } from './Dimensions';
import { groupDimensionsFromList } from '../utils';
import { dimensionConfigMap } from './configuration/dimensionConfigMap';

interface ChipColor {
color: string;
}

const chipColorList: ChipColor[] = [
{
color: '#04a791',
},
{
color: '#2B303A',
},
{
color: '#D14081',
},
{
color: '#EF798A',
},
{
color: '#F9F5E3',
},
];

const getDimensionChipFactory = (dims: Dimension[]) => {
const { dimNames, groupedDims } = groupDimensionsFromList(dims);
const labelColorMap: any = {};
dimNames.forEach((name) => {
const dims = groupedDims[name];
dims.forEach((dim, i) => {
const config = dimensionConfigMap[dim.dimensionName];
if (!config)
throw new Error(`Dimension ${dim.dimensionName} is not configured!`);
const label = config.labelFN(dim);
const color =

labelColorMap[label] = color;
    }};
  }};
return (label: string): React.ReactChild => {
const color =
labelColorMap[label]?.color ??
chipColorList[chipColorList.length - 1].color;
const StyledChip = React.memo(
withStyles((theme: Theme) => ({
root: {
minWidth: 150,
// maxWidth: 400,
color: theme.palette.getContrastText(color),
backgroundColor: color,
'font-weight': 'bold',
},
}))(Chip),
    };
return <StyledChip key={`dimension-chip-${label}`} label={label} />;
};
};

export default getDimensionChipFactory;
