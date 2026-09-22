"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
} from "@/components/ui/collapsible";

interface SidebarSectionProps {
  icon: LucideIcon;
  label: string;
  isOpen: boolean | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SidebarSection({
  icon: Icon,
  label,
  isOpen,
  defaultOpen = true,
  children
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!isOpen) {
    // Sidebar colapsada → não renderiza conteúdo
    return (
      <Button
        variant="ghost"
        className="w-full justify-center h-10 mb-1"
      >
        <Icon size={18} />
      </Button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start h-10 mb-1"
        >
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center">
              <span className="mr-4">
                <Icon size={18} />
              </span>
              <p className="max-w-[160px] truncate">{label}</p>
            </div>
            <ChevronDown
              size={16}
              className={cn(
                "transition-transform",
                open && "rotate-180"
              )}
            />
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="ml-6 space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
