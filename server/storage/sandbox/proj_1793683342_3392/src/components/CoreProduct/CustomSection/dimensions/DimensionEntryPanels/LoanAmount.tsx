import React from 'react';
import { EntryPanelProps } from './types';
import Grid from '@material-ui/core/Grid';
import Input from '../../components/Input';

const LoanAmount: React.FC<EntryPanelProps> = ({
id,
id2,
onChange,
dimension,























































id={id}
label={'Starting %'}
value={dimension.start ?? ''}
onChange={(v) => onChange('start', v)}
errorMsg={errors?.start}
        [>
</Grid>
<Grid item xs={6}>
<Input
key={id2}
id={id2}
label={'Ending %'}
value={dimension.end ?? ''}
onChange={(v) => onChange('end', v)}
errorMsg={errors?.end}
        [>
</Grid>
</Grid>
  };
};
export default LTVEntryPanel;
