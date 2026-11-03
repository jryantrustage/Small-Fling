/**
* Returns the ArrayBuffer promise from Blob
























```typescript
import { DateTime } from 'luxon';

export default (dateToFormat: string | undefined): string =>
dateToFormat
? new Date(dateToFormat).toLocaleString('en-us', {
month: 'long',
year: 'numeric',
day: 'numeric',
})
: '';

/**
*
* @param myDate date string you want to compare to now()
* @param showRelative optional defaults to false - determines whether the function returns time from now or just a datetime
* Returns formatted datetime or 'time ago' strings
*/
export const formatDatetime = (
myDate: string,
showRelative: boolean = false,
separateDayTime: boolean = false,
separateDayShort: boolean = false
) => {
























if (datetime > now.minus({ weeks: 1 }) && datetime < now.plus({ weeks: 1 })) {
return `${datetime.toFormat('MMM d')} at ${datetime.toFormat('h:mm a')}`;
}
return `${datetime.toFormat('MMM d, yyyy')} at ${datetime.toFormat('h:mm a')}`;
}

  if (separateDayShort) {
const formatted = separateDayTime ? '' : datetime.toFormat('MM/dd/yyyy [at] h:mm a');
return formatted.replace('AM', 'a.m.').replace('PM', 'p.m.');
}

  if (datetime.hasSame(now, 'day')) return `Today, ${datetime.toFormat('h:mm a')}`;
if (datetime.hasSame(now.plus({ days: 1 }), 'day')) return `Tomorrow, ${datetime.toFormat('h:mm a')}`;
if (datetime.hasSame(now.minus({ days: 1 }), 'day')) return `Yesterday, ${datetime.toFormat('h:mm a')}`;
if (datetime > now.minus({ weeks: 1 }) && datetime < now.plus({ weeks: 1 })) {
return `${datetime.toFormat('MMM d')}, ${datetime.toFormat('h:mm a')}`;
}
return `${datetime.toFormat('MMM d, yyyy')}, ${datetime.toFormat('h:mm a')}`;
};
