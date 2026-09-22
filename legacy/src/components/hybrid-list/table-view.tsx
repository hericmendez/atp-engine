//src/app/components/hybrid-list/table-view.tsx
"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import CustomContextMenu from "../context-menu";
import { Field } from "./types";
import { ContextMenuItemType } from "../context-menu/types";
import { Game } from "@/stores/useGamesStore";
interface Props {
  data: Game[];
  fields: Field<Game>[];
  selectedKeys: React.Key[];
  toggle: (item: Game) => void;
  contextMenu: (item: Game) => ContextMenuItemType[];
}

export default function TableView({ data, fields, selectedKeys, toggle, contextMenu }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {fields.map(f => <TableHead key={f.key}>{f.title}</TableHead>)}
        </TableRow>
      </TableHeader>

      <TableBody>
        {data.map(item => {
          const selected = selectedKeys.includes(item._id);

          return (
            <CustomContextMenu key={item._id} items={contextMenu(item)}>
              <TableRow onClick={() => toggle(item)} className="cursor-pointer">
                <TableCell>{selected ? "✓" : "+"}</TableCell>
                {fields.map(f => (
             <TableCell key={f.key}>
               {f.cell ? f.cell(item) : f.accessor(item)}
             </TableCell>
           ))}
              </TableRow>
            </CustomContextMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}
