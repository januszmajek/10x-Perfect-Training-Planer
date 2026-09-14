import { useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { ToastNotification } from "@/lib/toast-notifications";

interface Props {
  notification?: ToastNotification | null;
}

export default function StatusToast({ notification = null }: Props) {
  useEffect(() => {
    if (!notification) return;

    toast[notification.kind](notification.message, { duration: 5_000 });
  }, [notification]);

  return <Toaster closeButton duration={5_000} position="top-right" theme="dark" />;
}
