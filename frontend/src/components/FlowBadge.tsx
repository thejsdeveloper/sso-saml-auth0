import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoginFlow } from "@/api";

const FLOW_STYLES: Record<LoginFlow, { label: string; className: string }> = {
  "sp-initiated": {
    label: "SP-initiated login",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  "idp-initiated": {
    label: "IdP-initiated login",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};

export function FlowBadge({ flow, className }: { flow: LoginFlow; className?: string }) {
  const { label, className: flowClass } = FLOW_STYLES[flow];
  return <Badge className={cn(flowClass, className)}>{label}</Badge>;
}
