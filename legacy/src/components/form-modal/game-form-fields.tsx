//src/app/(app)/game/details/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea
} from "@/components/ui/input-group";
import { useGamesStore } from "@/stores/useGamesStore";
import { useGameListsStore } from "@/stores/useGameListsStore";
import { useEffect, useState } from "react";

const formSchema = z.object({
  game_data: z.object({
    id: z.number(),
    name: z.string().min(1, "Nome do jogo é obrigatório."),
    summary: z.string().optional(),
    release_date: z.string().optional(),
    developers: z.string().optional(),
    total_rating: z.number().min(0).max(100).optional(),
    cover: z.string().url().optional()
  }),

  player_data: z.object({
    status: z.string(),
    hours_played: z.number().min(0, "Horas jogadas não pode ser negativo."),
    rating: z.number().min(0).max(10).optional(),
    review: z.string().max(500).optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export default function GameForm() {
  const { lists, loadLists } = useGameListsStore();

  const [selectedListId, setSelectedListId] = useState("");
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const gameId = params?.gameId;

  return (
    <>
      <Controller
        name="game_data.name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Nome do jogo</FieldLabel>
            <Input {...field} placeholder="Ex: Metroid Prime 4" />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="game_data.id"
        control={form.control}
        render={({ field }) => (
          <Field className="hidden">
            <FieldLabel>ID do jogo (IGDB)</FieldLabel>
            <Input
              type="number"
              {...field}
              onChange={(e) => field.onChange(Number(e.target.value))}
              placeholder="Ex: 123456"
            />
          </Field>
        )}
      />
      <Controller
        name="game_data.release_date"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Ano de lançamento</FieldLabel>
            <Input
              type="number"
              placeholder="Ex: 2024"
              {...field}
              onChange={(e) =>
                field.onChange(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </Field>
        )}
      />

      <Controller
        name="game_data.total_rating"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Nota geral (0–100)</FieldLabel>
            <Input
              type="number"
              min={0}
              max={100}
              {...field}
              onChange={(e) =>
                field.onChange(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </Field>
        )}
      />

      <Controller
        name="game_data.cover"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>URL da capa</FieldLabel>
            <Input {...field} placeholder="https://..." />
          </Field>
        )}
      />

      <Controller
        name="game_data.summary"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Resumo</FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                {...field}
                rows={4}
                className="resize-none"
                placeholder="Descrição do jogo"
              />
              <InputGroupAddon align="block-end">
                <InputGroupText>{field.value?.length ?? 0}/500</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        )}
      />

      <Controller
        name="player_data.status"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Status</FieldLabel>
            <select
              {...field}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="Wishlist">Wishlist</option>
              <option value="Jogando">Jogando</option>
              <option value="Zerado">Zerado</option>
              <option value="Dropado">Dropado</option>
            </select>
          </Field>
        )}
      />

      <Controller
        name="player_data.hours_played"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Horas jogadas</FieldLabel>
            <Input
              type="number"
              min={0}
              {...field}
              onChange={(e) => field.onChange(Number(e.target.value))}
              placeholder="Ex: 40"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="player_data.rating"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Sua nota (0–10)</FieldLabel>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.5}
              {...field}
              onChange={(e) =>
                field.onChange(
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
              placeholder="Ex: 8.5"
            />
          </Field>
        )}
      />

      <Controller
        name="player_data.review"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Review pessoal</FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                {...field}
                rows={5}
                className="resize-none"
                placeholder="O que você achou do jogo?"
              />
              <InputGroupAddon align="block-end">
                <InputGroupText>{field.value?.length ?? 0}/500</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              Impressões pessoais, sem compromisso com a crítica.
            </FieldDescription>
          </Field>
        )}
      />
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
    </>
  );
}
