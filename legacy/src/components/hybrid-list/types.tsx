import { Game } from "@/types/Game";
import React from "react";

export interface BaseItem {
  key: React.Key;
  name: string;
  image: string;
  category: string;
  year: number;
}

export interface Field<T> {
  key: string
  title: string
  accessor: (item: T) => React.ReactNode
  sortValue?: (item: T) => string | number
  cell?: (game: Game) => any
}
