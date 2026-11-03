import React, { useCallback, useState } from 'react';
import { INotification, NotificationDisplay } from 'core/entities/notification';
import { isEqual } from 'lodash';
import { INotificationContext, NotificationContext } from './NotificationContext';

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
const [notificationList, setNotificationList] = useState<INotification[]>([]);

  const addNotification = useCallback((notification: INotification) => {
setNotificationList((notificationList) => {
























const isItemToRemove = isEqual(notification, notificationToRemove);
if (isItemToRemove && notification.onDismissAction) {
notification.onDismissAction();
}
return !isItemToRemove;
});
});
}, []);

  const removeNotificationsById = useCallback((notificationId: string | string[]) => {
const removeIds = Array.isArray(notificationId) ? notificationId : [notificationId];
setNotificationList((currentNotifications) => {
const newNotificationsList = currentNotifications.filter((currentNotification) => {
const remove = !currentNotification.id || !removeIds.includes(currentNotification.id);
if (remove) {
currentNotification.onDismissAction?.();
}
return remove;
});

      if (newNotificationsList.length === currentNotifications.length) {
return currentNotifications;
}
return newNotificationsList;
























initNotifications,
notificationIsSuppressed,
notificationList,
removeNotification,
removeNotificationsById,
};

  return <NotificationContext.Provider value={context}>{children}</NotificationContext.Provider>;
});
