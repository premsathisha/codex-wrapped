import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:border-white/15 group-[.toaster]:bg-[#0c0f14] group-[.toaster]:text-[#FAFAFA] group-[.toaster]:shadow-lg",
          title: "text-sm font-semibold",
          description: "text-xs leading-5 text-[#E2E8F0]",
          success: "group-[.toaster]:border-emerald-400/30 group-[.toaster]:bg-emerald-500/12",
          error: "group-[.toaster]:border-amber-400/35 group-[.toaster]:bg-amber-500/12",
          closeButton:
            "group-[.toaster]:border-white/15 group-[.toaster]:bg-transparent group-[.toaster]:text-[#E2E8F0] hover:group-[.toaster]:bg-white/10",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
