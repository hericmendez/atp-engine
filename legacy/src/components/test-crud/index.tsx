"use client";

import { useEffect, useState } from "react";
import { useGamesStore } from "@/stores/useGamesStore";
import { useGameListsStore } from "@/stores/useGameListsStore";

export default function TestCrudPage() {
  const {
    games,

    loadGames,
    createGame,
    updateGame,
    deleteGame,
    addGameToList,
    removeGameFromList
  } = useGamesStore();

  const { lists, loadLists, createList, updateList, deleteList, resolveGameLists } =
    useGameListsStore();
  console.log("test crud lists ==> ", lists);
  console.log("test crud games ==> ", games);
  const [newListName, setNewListName] = useState("");

  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedListId, setSelectedListId] = useState("");

  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameName, setEditingGameName] = useState("");

  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState("");

  useEffect(() => {
    loadGames();
    loadLists();
  }, [loadGames, loadLists]);

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1>🧪 Test CRUD (Game / Lists)</h1>

      {/* CRIAÇÃO */}
      <section style={{ display: "flex", gap: 32 }}>
        <div></div>

        <div>
          <h3>Criar Lista</h3>
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nome da lista"
          />
          <button
            onClick={() => {
              if (!newListName) return;
              createList(newListName);
              setNewListName("");
            }}
          >
            Criar
          </button>
        </div>
      </section>

      <hr />

      {/* ASSOCIAÇÃO */}
      <h3>Adicionar jogo à lista</h3>

      <select
        value={selectedGameId}
        onChange={(e) => setSelectedGameId(e.target.value)}
      >
        <option value="">Selecione um jogo</option>
        {games.map((game) => (
          <option key={game._id} value={game._id}>
            {game.game_data.name}
          </option>
        ))}
      </select>

      <select
        value={selectedListId}
        onChange={(e) => setSelectedListId(e.target.value)}
      >
        <option value="">Selecione uma lista</option>
        {lists.map((list) => (
          <option key={list._id} value={list._id}>
            {list.name}
          </option>
        ))}
      </select>

      <button
        onClick={() => {
          if (!selectedGameId || !selectedListId) return;
          addGameToList(selectedGameId, selectedListId);
          setSelectedGameId("");
          setSelectedListId("");
        }}
      >
        Adicionar
      </button>

      <hr />

      {/* JOGOS */}
      <h2>Jogos</h2>

      {games.map((game) => (

        <div
          key={game._id}
          style={{
            border: "1px solid #ccc",
            padding: 12,
            marginBottom: 12
          }}
        >
          {/* NOME */}
          {editingGameId === game._id ? (
            <>
              <input
                value={editingGameName}
                onChange={(e) => setEditingGameName(e.target.value)}
              />
              <button
                onClick={() => {
                  updateGame(game._id, editingGameName);
                  setEditingGameId(null);
                }}
              >
                Salvar
              </button>
            </>
          ) : (
            <>
              <strong>{game.game_data.name}</strong>
              <button
                onClick={() => {
                  setEditingGameId(game._id);
                  setEditingGameName(game.game_data.name);
                }}
              >
                ✏️
              </button>
              <button onClick={() => deleteGame(game._id)}>🗑</button>
            </>
          )}

          {/* LISTAS */}
          <div style={{ marginTop: 8 }}>
            Listas:
            {game.player_data.listIds?.length === 0 && " nenhuma"}
            {game.player_data.listIds?.map((listId) => {
              const list = lists.find((l) => l._id === listId);
              if (!list) return null;

              return (
                <span key={listId} style={{ marginLeft: 8 }}>
                  {list.name}
                  <button onClick={() => removeGameFromList(game._id, listId)}>
                    ❌
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ))}

      <hr />

      {/* LISTAS */}
      <h2>Listas</h2>

      {lists.map((list) => (
        <div key={list._id} style={{ marginBottom: 8 }}>
          {editingListId === list._id ? (
            <>
              <input
                value={editingListName}
                onChange={(e) => setEditingListName(e.target.value)}
              />
              <button
                onClick={() => {
                  updateList(list._id, editingListName);
                  setEditingListId(null);
                }}
              >
                Salvar
              </button>
            </>
          ) : (
            <>
              {list.name} ({list.gamesCount})
              <button
                onClick={() => {
                  setEditingListId(list._id);
                  setEditingListName(list.name);
                }}
              >
                ✏️
              </button>
              <button onClick={() => deleteList(list._id)}>🗑</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
