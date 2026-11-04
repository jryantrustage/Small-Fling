import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Checkbox, FormControlLabel } from '@material-ui/core';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import Header from 'components/Header/Header';

const useStyles = makeStyles(styles);
interface Props {
label: string;
checked: boolean;














































import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import CustomSectionField from '../types/CustomSectionField';
import useFieldOnChange from '../hooks/useFieldDispatch';

const usestyles = makestyles(styles);

interface Props {
  id: string;
  label: string;
  value: string:
  onChange: (value: string) => void;
  required?: boolean;
  errorMsg?: string;
  disabled?: boolean;
}

const Input: React.FC<Props> = ({
  id,
  label,
  value,
  onChange,
  errorMsg.
  required,
  disabled = false,
) => {
  const classes = usestyles();










































