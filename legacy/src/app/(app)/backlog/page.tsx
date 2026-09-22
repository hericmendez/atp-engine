// src/app/(app)/games/backlog/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContentLayout } from "@/components/admin-panel/content-layout";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import HybridList from "@/components/hybrid-list";
import { Field } from "@/components/hybrid-list/types";
import { Game } from "@/types/Game";
import { useGamesStore } from "@/stores/useGamesStore";
import { useGameListsStore } from "@/stores/useGameListsStore";
import { ContextMenuItemType } from "@/components/context-menu/types";

import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import GameDetails from "@/components/game-details";

export default function BacklogPage() {
  const [showGame, setShowGame] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  console.log("selectedGame ==> ", selectedGame);



  const { games, loadGames, addGameToList, removeGameFromList } =
    useGamesStore();

  const { lists, loadLists } = useGameListsStore();

  useEffect(() => {
    loadGames();
    loadLists();
  }, [loadGames, loadLists]);
  const handleViewGame = (game: Game) => {

    setSelectedGame(game);
    setShowGame(true);
  };

  const fields: Field<Game>[] = [
    {
      key: "name",
      title: "Nome",
      accessor: g => g.game_data.name,
      sortValue: g => g.game_data.name.toLowerCase(),
    },
    {
      key: "status",
      title: "Categoria",
      accessor: g => g.player_data?.status,
    },
    {
      key: "year",
      title: "Ano",
      accessor: g => g.game_data.release_date,
      sortValue: g => g.game_data.release_date,
    },
  ];

  const contextMenu = (game: Game): ContextMenuItemType[] => {
    const currentIds = new Set(game.player_data?.listIds);

    const addable = lists.filter(l => !currentIds.has(l._id));
    const removable = lists.filter(l => currentIds.has(l._id));

    return [
      {
        label: "Ver jogo",
        onClick: () => handleViewGame(game),
      },

      ...(addable.length
        ? [{
          label: "Adicionar a",
          children: addable.map(list => ({
            label: list.name,
            onClick: () => addGameToList(game._id, list._id),
          })),
        }]
        : []),

      ...(removable.length
        ? [{
          label: "Remover de",
          children: removable.map(list => ({
            label: list.name,
            onClick: () => removeGameFromList(game._id, list._id),
          })),
        }]
        : []),
    ];
  };

  return (
    <ContentLayout title="Backlog">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Games</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Backlog</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <HybridList
        data={games}
        fields={fields}
        contextMenu={contextMenu}
      />
      <Sheet open={showGame} onOpenChange={setShowGame}>
        <SheetContent style={{ maxWidth: "80vw", overflowY: "auto" }}>
          <SheetHeader>
            {selectedGame && <GameDetails game={selectedGame} lists={lists} />}
          </SheetHeader>
        </SheetContent>
      </Sheet>

    </ContentLayout>
  );
}
