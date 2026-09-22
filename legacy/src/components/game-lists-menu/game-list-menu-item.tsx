"use client";

import Link from "next/link";
import { useState } from "react";
import CustomContextMenu from "@/components/context-menu";
import { useGameListsStore, GameList } from "@/stores/useGameListsStore";
import { Input } from "@/components/ui/input";

export function GameListMenuItem({
  list,
  isOpen
}: {
  list: GameList;
  isOpen?: boolean;
}) {
  const { updateList, deleteList } = useGameListsStore();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(list.name);

  const contextItems = [
    {
      label: "Renomear",
      onClick: () => {
        setValue(list.name);
        setEditing(true);
      }
    },
    {
      label: "---"
    },
    {
      label: "Excluir lista",
      onClick: () => {
        deleteList(list._id);
      }
    }
  ];

  const save = async () => {
    if (!value.trim() || value === list.name) {
      setEditing(false);
      return;
    }

    await updateList(list._id, value);
    setEditing(false);
  };

  return (
    <CustomContextMenu items={contextItems}>
      <div className="w-full px-4 py-1">
        {editing ? (
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8"
          />
        ) : (
          <Link
            href={`/game-lists/${list._id}`}
            className="block truncate text-sm"
          >
            {list.name}
          </Link>
        )}
      </div>
    </CustomContextMenu>
  );
}
