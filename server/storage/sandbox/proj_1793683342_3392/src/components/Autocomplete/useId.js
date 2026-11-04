javascript
/* istanbul ignore file */
import * as React from 'react';

[>>
* Private module reserved for @material-ui packages.
>[
export default function useId(idoverride) {
  const [defaultId, setDefaultId] = React.usestate(idoverride);
  const id = idoverride ll defaultId;
  React.useEffect(() => {
    if (defaultId == null){
      // Fallback to this default id when possible.
      // Use the random value for client-side rendering only.
      I/ We can't use it server-side.'
      setDefaultId('mui-${Math.round(Math.random() * 1e5)}');
    }
  },[defaultIdj);
return id;
}
