//src/app/components/hybrid-list/grid-view.tsx
//talvez eu mantenha como fallback do infinite scroll
"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import CustomContextMenu from "../context-menu";
import { Field } from "./types";
import { Game } from "@/types/Game";
import { ContextMenuItemType } from "../context-menu/types";
interface Props {
  data: Game[]
  selectedKeys: React.Key[]
  toggle: (item: Game) => void
  contextMenu: (item: Game) => ContextMenuItemType[]
}

export default function GridView({ data, selectedKeys, toggle, contextMenu }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {data.map(item => {
        console.log("item ==> ", item);
        const selected = selectedKeys.includes(item._id);

        return (
          <CustomContextMenu key={item._id} items={contextMenu(item)}>
            <div
              onClick={() => toggle(item)}
              className={`relative cursor-pointer rounded overflow-hidden border
                ${selected ? "border-primary" : "border-muted"}`}
            >
              <Image
                src={item.game_data.cover?.url}
                alt={item.game_data.name}
                width={400}
                height={600}
                className="object-cover"
              />
              <div className="absolute bottom-0 w-full bg-black/50 p-2 text-white text-xs">
                <div>{item.game_data.name}</div>
              </div>

              <Button size="icon" variant="ghost" className="absolute top-2 right-2">
                {selected ? "✓" : "+"}
              </Button>
            </div>
          </CustomContextMenu>
        );
      })}
    </div>
  );
}
