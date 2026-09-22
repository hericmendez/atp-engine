"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGameListsStore } from "@/stores/useGameListsStore";

interface NewListButtonProps {
  isOpen: boolean | undefined;
}

export function NewListButton({ isOpen }: NewListButtonProps) {
  const createList = useGameListsStore(s => s.createList);

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    createList(trimmed);
    setName("");
    setIsCreating(false);
  }

  function cancel() {
    setName("");
    setIsCreating(false);
  }

  if (!isOpen) return null;

  return (
    <div className="pl-6">
      {isCreating ? (
        <Input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nova lista"
          className="h-8"
          onKeyDown={e => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
          onBlur={cancel}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setIsCreating(true)}
        >
          <Plus size={14} className="mr-2" />
          Nova lista
        </Button>
      )}
    </div>
  );
}
