"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type NotificationType = "success" | "error" | "info";

type NotificationOptions = {
  type: NotificationType;
  title: string;
  message: string;
};

type Notification = NotificationOptions & { id: number };

type NotificationContextValue = {
  notify: (notification: NotificationOptions) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const notificationStyles: Record<
  NotificationType,
  { icon: typeof CheckCircle2; classes: string }
> = {
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-white text-emerald-700",
  },
  error: {
    icon: AlertCircle,
    classes: "border-rose-200 bg-white text-rose-700",
  },
  info: {
    icon: Info,
    classes: "border-blue-200 bg-white text-blue-700",
  },
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (notification: NotificationOptions) => {
      const id = ++nextId.current;
      setNotifications((current) => [...current, { ...notification, id }].slice(-4));
      const timer = window.setTimeout(() => dismiss(id), 5200);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div
        className="notification-viewport print:hidden"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Notifications"
      >
        {notifications.map((notification) => {
          const { icon: Icon, classes } = notificationStyles[notification.type];
          return (
            <section
              key={notification.id}
              className={`notification-card ${classes}`}
              role={notification.type === "error" ? "alert" : "status"}
            >
              <span className="notification-icon">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="notification-title">{notification.title}</p>
                <p className="notification-message">{notification.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(notification.id)}
                className="notification-dismiss"
                aria-label="Fermer la notification"
              >
                <X className="h-4 w-4" />
              </button>
            </section>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications doit être utilisé dans NotificationProvider.",
    );
  }
  return context;
}
