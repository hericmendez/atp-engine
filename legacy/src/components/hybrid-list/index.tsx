// src/app/components/hybrid-list/index.tsx
"use client";

import { useEffect, useState } from "react";
import GridView from "./grid-view";
import TableView from "./table-view";
import InfiniteGridView from "./inifinite-scroll-grid-view";
import VirtualizedGridView from "./virtualized-grid-view";
import { Button } from "@/components/ui/button";
import { Field } from "./types";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { Game } from "@/types/Game";
import { ContextMenuItemType } from "../context-menu/types";

interface HybridListProps {
    data: Game[];
    fields?: Field<Game>[];
    contextMenu: (game: Game) => ContextMenuItemType[];
    onViewGame?: (game: Game) => void;
    onLoadMore?: () => void
}


export default function HybridList({
    data,
    fields = [],
    contextMenu,
    onLoadMore

}: HybridListProps) {
    const [view, setView] = useState<
        "grid" | "table" | "infinite-scroll" | "virtualized"
    >("virtualized");




    const [selected, setSelected] = useState<React.Key[]>([]);
    const [search, setSearch] = useState("");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(6);

    const toggle = (item: Game) => {
        setSelected(prev =>
            prev.includes(item._id)
                ? prev.filter(k => k !== item._id)
                : [...prev, item._id]
        );
    };

    const nameField = fields.find(f => f.key === "name");

    const filteredData = search && nameField
        ? data.filter(item =>
            String(nameField.sortValue?.(item) ?? "")
                .includes(search.toLowerCase())
        )
        : data;

    const sortedData = nameField
        ? [...filteredData].sort((a, b) => {
            const av = nameField.sortValue?.(a);
            const bv = nameField.sortValue?.(b);
            if (av! < bv!) return sortDir === "asc" ? -1 : 1;
            if (av! > bv!) return sortDir === "asc" ? 1 : -1;
        return 0;
        })
        : filteredData;

    const totalPages = Math.ceil(sortedData.length / pageSize);
    const paginatedData = sortedData.slice(
        (page - 1) * pageSize,
        page * pageSize
    );

    useEffect(() => {
        setPage(1);
    }, [search, sortDir, pageSize]);

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input
                    placeholder="Buscar por nome..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                <Button variant="outline">
                    <Search size={16} />
                </Button>

                <Button
                    variant="outline"
                    onClick={() =>
                        setSortDir(prev => (prev === "asc" ? "desc" : "asc"))
                    }
                >
                    Ordem: {sortDir === "asc" ? "A → Z" : "Z → A"}
                </Button>
            </div>

            <Select onValueChange={v => setView(v as any)}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="View" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="table">Table</SelectItem>
                    <SelectItem value="grid">Grid</SelectItem>
                    <SelectItem value="infinite-scroll">Infinite Scroll</SelectItem>
                    <SelectItem value="virtualized">Virtualized</SelectItem>
                </SelectContent>
            </Select>

            {view === "grid" && (
                <GridView
                    data={paginatedData}
                    selectedKeys={selected}
                    toggle={toggle}
                    contextMenu={contextMenu}
                />
            )}

            {view === "table" && (
                <TableView
                    data={paginatedData}
                    fields={fields}
                    selectedKeys={selected}
                    toggle={toggle}
                    contextMenu={contextMenu}
                />
            )}

            {view === "infinite-scroll" && (
                <InfiniteGridView
                    data={sortedData}
                    selectedKeys={selected}
                    toggle={toggle}
                    contextMenu={contextMenu}
                />
            )}

            {view === "virtualized" && (
                <VirtualizedGridView
                    data={sortedData}
                    selectedKeys={selected}
                    toggle={toggle}
                    contextMenu={contextMenu}
                    onLoadMore={onLoadMore}
                />
            )}

            {view !== "infinite-scroll" && view !== "virtualized" && (
                <div className="flex gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                    >
                        Anterior
                    </Button>

                    {Array.from({ length: totalPages }).map((_, i) => {
                        const p = i + 1;
                        return (
                            <Button
                                key={p}
                                size="icon"
                                variant={p === page ? "default" : "outline"}
                                onClick={() => setPage(p)}
                            >
                                {p}
                            </Button>
                        );
                    })}

                    <Button
                        variant="outline"
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Próxima
                    </Button>

                    <Select
                        value={String(pageSize)}
                        onValueChange={v => {
                            setPageSize(Number(v));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Itens / página" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="6">6</SelectItem>
                            <SelectItem value="12">12</SelectItem>
                            <SelectItem value="24">24</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}
