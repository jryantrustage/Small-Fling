typescript
import { NotificationDisplay, NotificationType } from 'core/entities/notification';

export enum IconvertPosition

Bottom = - flex-end'',
Top = flex-start''
.


* Properties interface for the 'Notifications' component.

export interface IDynamicNotificationsProps (
className? : string

* Limits the number of notifications displayed.

limit? : number;

* Specifies what notification display locations to listen to.

display?: NotificationDisplay | string;

* Determines vertical styling position of icon.

iconvertPosition?:IconvertPosition
.

export interface Isccolorscheme

* pecifies the color scheme of the notification

colorscheme: NotificationType:
global?: boolean;
.
