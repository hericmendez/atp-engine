"use client";

import { useEffect } from "react";
import { useGameListsStore } from "@/stores/useGameListsStore";
import { GameListMenuItem } from "./game-list-menu-item";

export function GameListsMenuSection({ isOpen }: { isOpen?: boolean }) {
  const { lists, loadLists } = useGameListsStore();

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  return (
    <>
      {lists.map(list => (
        <GameListMenuItem
          key={list._id}
          list={list}
          isOpen={isOpen}
        />
      ))}
    </>
  );
}
