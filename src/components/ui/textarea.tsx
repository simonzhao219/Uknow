import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // 手機 16px 避免 iOS 聚焦縮放；桌機 md:text-sm。
        "resize-none border-input placeholder:text-muted-foreground focus-visible:border-sel focus-visible:ring-sel aria-invalid:ring-destructive-border aria-invalid:border-destructive-border flex field-sizing-content min-h-16 w-full rounded-md border bg-input-background px-3 py-2 text-[16px] transition-[color,box-shadow] outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
