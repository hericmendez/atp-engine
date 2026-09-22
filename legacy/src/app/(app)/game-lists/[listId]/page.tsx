//src/app/(app)/game-lists/[listid]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from 'next/navigation'; // For App Router
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
import { Star } from "lucide-react";

export default function BacklogPage() {

  const params = useParams();
  const listId = params?.listId as string | undefined;

  const [showGame, setShowGame] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);


  const { games, loadGames, loadGameById, addGameToList, removeGameFromList } =
    useGamesStore();

  const {
    lists,
    loadLists,
    loadGamesFromList,
    gamesByList
  } = useGameListsStore();

  const gamesFromList = listId ? gamesByList[listId] : null;

  useEffect(() => {
    loadLists();

    if (listId) {
      loadGamesFromList(listId);
    } else {
      loadGames();
    }

  }, [listId, loadGames, loadGamesFromList, loadLists]);

  const data = listId ? gamesFromList ?? [] : games;
  console.log("data ==> ", data);
  const router = useRouter();
  const handleViewGame = async (gameId: string) => {

    const fullGame = await loadGameById(gameId)
    console.log("fullGame ==> ", fullGame);

    if (fullGame) {
      setSelectedGame(fullGame);
    }

    setShowGame(true);
  };

  const fields: Field<Game>[] = [

    {
      key: "game",
      title: "Game",
      accessor: g => g.game_data?.name,
      cell: (game: Game) => (
        <div className="flex gap-5 items-center">
          <img
            src={game.game_data.cover?.url}
            className="w-20 h-30 object-cover rounded"
          />

          <div className="flex flex-col leading-tight">
            <span className="text-lg">
              {game.game_data.name}
            </span>

            <span className="text-sm text-muted-foreground">
              {game.game_data.genres}
            </span>

            <span className="text-sm text-muted-foreground">
              {game.game_data.platforms} ({game.game_data.release_date})
            </span>
          </div>
        </div>
      )
    },

    {
      key: "status",
      title: "Status",
      accessor: g => g.player_data?.status,
      cell: (game: Game) => (
        <p className="text-lg">


          {game?.player_data?.status}

        </p>
      )
    },
    {
      key: "rating",
      title: "Nota Pessoal",
      accessor: g => g.player_data?.rating,
      sortValue: g => g.player_data?.rating,
      cell: (game: Game) => (
        <p className="flex items-center gap-2">

          <span className="flex items-center text-yellow-400 text-xl">
            <Star className="fill-yellow-400 mr-1" />
            {game?.player_data?.rating}
          </span>
        </p>

      )
    },
  ];

  const contextMenu = (game: Game): ContextMenuItemType[] => {
    const currentIds = new Set(game?.player_data?.listIds);

    const addable = lists.filter(l => !currentIds.has(l._id));
    const removable = lists.filter(l => currentIds.has(l._id));

    return [
      {
        label: "Ver jogo",
        onClick: () => handleViewGame(game._id),
      },
      {
        label: "Editar",
        onClick: () => router.push(`/game/${game._id}/form`),
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
            <BreadcrumbPage>
              {listId ? "Lista" : "Backlog"}
            </BreadcrumbPage>
          </BreadcrumbItem>

        </BreadcrumbList>
      </Breadcrumb>

      <HybridList
        data={data}
        fields={fields}
        contextMenu={contextMenu}
        onLoadMore={() => {
          if (!listId) return

          const state = useGameListsStore.getState()

          const nextPage = (state.pageByList[listId] ?? 1) + 1

          if (state.hasMoreByList[listId]) {
            state.loadGamesFromList(listId, nextPage)
          }
        }}
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