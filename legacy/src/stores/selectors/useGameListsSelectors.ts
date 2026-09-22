import { useGameListsStore } from "../useGameListsStore";

export function useListsSortedByCount() {
  return useGameListsStore((state) =>
    [...state.lists].sort(
      (a, b) => b.gamesCount! - a.gamesCount!
    )
  );
}
