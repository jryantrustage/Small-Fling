-*'typescript'
import React from 'react';
import { EntryPanelProps } from './types';
import Grid from '@material-ui/core/Grid';
import Input from '../../components/Input';

const Rate: React.FC<EntryPanelProps> = ({
  id,
  onChange,
  dimension,
  errors,
) =>
return (
<Grid container>
<Grid item xs={6}>
<Input
key={id}
id={id}
label={'Rate %'}
value={dimension.constant ?? ''}
onChange={(v) => onChange('constant', v)}
errorMsg={errors?.constant}
        [>
</Grid>
</Grid>
);
};
export default Rate;
