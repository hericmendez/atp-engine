"use client";

import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { ContextMenuItemType } from "./types";

interface Props {
  items: ContextMenuItemType[];
  children: React.ReactNode;
}

export default function CustomContextMenu({ items, children }: Props) {
  const renderItems = (list: ContextMenuItemType[]) =>
    list.map((item, i) => {
      if (item.label === "---") return <ContextMenuSeparator key={i} />;

      if (item.children?.length) {
        return (
          <ContextMenuSub key={i}>
            <ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {renderItems(item.children)}
            </ContextMenuSubContent>
          </ContextMenuSub>
        );
      }

      return (
        <ContextMenuItem key={i} onClick={item.onClick}>
          {item.label}
        </ContextMenuItem>
      );
    });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]">
        {renderItems(items)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
