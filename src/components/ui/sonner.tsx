import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "rgb(15 23 42 / 0.96)",
          "--normal-text": "rgb(245 243 255)",
          "--normal-border": "rgb(216 180 254 / 0.18)",
          "--border-radius": "0.75rem",
          "--width": "min(48rem, calc(100vw - 2rem))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group/toast !w-fit !max-w-full !gap-3 !px-4 !py-3.5 !shadow-[0_16px_40px_rgb(0_0_0/0.35)] !backdrop-blur-xl",
          content: "!min-w-0 !gap-0",
          title: "!leading-5 !font-medium !text-purple-50",
          icon: "!text-purple-300",
          actionButton:
            "!h-8 !rounded-lg !border !border-purple-300/25 !bg-purple-400/10 !px-3 !font-semibold !text-purple-50 hover:!bg-purple-400/20 focus-visible:!shadow-[0_0_0_2px_rgb(216_180_254/0.55)]",
          closeButton:
            "!static !order-last !ml-1 !h-8 !w-8 !shrink-0 !self-center !transform-none !border-0 !bg-transparent !text-purple-200/60 hover:!bg-purple-400/10 hover:!text-purple-100 focus-visible:!shadow-[0_0_0_2px_rgb(216_180_254/0.55)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
