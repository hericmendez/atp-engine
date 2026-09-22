//src/app/components/hybrid-list/inifinite-scroll-grid-view.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import CustomContextMenu from "../context-menu";
import { BaseItem } from "./types";
import { ContextMenuItemType } from "../context-menu/types";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Game } from "@/types/Game";
interface Props {
  data: Game[]
  selectedKeys: React.Key[]
  toggle: (item: Game) => void
  contextMenu: (item: Game) => ContextMenuItemType[]
  batchSize?: number;
}

export default function InfiniteGridView({
  data,
  selectedKeys,
  toggle,
  contextMenu,
  batchSize = 12,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // reset quando o dataset muda (busca, ordenação etc.)
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [data, batchSize]);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(v =>
            Math.min(v + batchSize, data.length)
          );
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [data.length, batchSize]);

  const visibleData = data.slice(0, visibleCount);
  console.log("visibleData ==> ", visibleData.length);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visibleData.map(item => {
          const selected = selectedKeys.includes(item._id)
          console.log("render item", item._id);
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

                <div className="absolute bottom-0 w-full bg-black/70 p-2 text-white text-sm">
                  {item.game_data.name}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                >
                  {selected ? "✓" : "+"}
                </Button>
              </div>
            </CustomContextMenu>
          );
        })}
      </div>

      {/* sentinela */}
      {visibleCount < data.length && (
        <div ref={sentinelRef} className="h-10" />
      )}
    </>
  );
}
