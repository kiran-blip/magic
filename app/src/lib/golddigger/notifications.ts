/**
 * In-memory notification system for Gold Digger
 * Stores up to 100 notifications with read/unread status
 */

export interface Notification {
  id: string;
  type: "trade_executed" | "opportunity" | "risk_alert" | "fleet_update" | "milestone";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: "low" | "medium" | "high";
  payload?: Record<string, unknown>;
}

// In-memory store (resets on server restart)
const notifications: Notification[] = [];
const MAX_NOTIFICATIONS = 100;

/**
 * Add a new notification to the store
 */
export function addNotification(
  notification: Omit<Notification, "id" | "timestamp" | "read">
): Notification {
  const newNotification: Notification = {
    ...notification,
    id: crypto.randomUUID?.() || `notif-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    read: false,
  };

  notifications.unshift(newNotification);

  // Keep only the most recent notifications
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.splice(MAX_NOTIFICATIONS);
  }

  return newNotification;
}

/**
 * Get recent notifications (newest first)
 */
export function getNotifications(limit: number = 50): Notification[] {
  return notifications.slice(0, limit);
}

/**
 * Mark a notification as read
 */
export function markRead(id: string): void {
  const notif = notifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
  }
}

/**
 * Mark all notifications as read
 */
export function markAllRead(): void {
  notifications.forEach((n) => {
    n.read = true;
  });
}

/**
 * Get count of unread notifications
 */
export function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length;
}

/**
 * Clear all notifications (admin/dev use)
 */
export function clearNotifications(): void {
  notifications.length = 0;
}

/**
 * Get notifications by type
 */
export function getNotificationsByType(
  type: Notification["type"],
  limit: number = 50
): Notification[] {
  return notifications.filter((n) => n.type === type).slice(0, limit);
}

/**
 * Get unread notifications
 */
export function getUnreadNotifications(limit: number = 50): Notification[] {
  return notifications.filter((n) => !n.read).slice(0, limit);
}
