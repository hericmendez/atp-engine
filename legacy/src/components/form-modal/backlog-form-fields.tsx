"use client";

import { Controller, useFormContext } from "react-hook-form";
import * as z from "zod";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,

  InputGroupText,
  InputGroupTextarea
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import GameCoverSearch from "@/lib/scrapers/tests/game-cover-search-test";
import { useGameListsStore } from "@/stores/useGameListsStore";
import { gameFormSchema } from "./form-props";
import { buildHLTBSearchUrl } from "@/lib/utils";

type FormData = z.infer<typeof gameFormSchema>;

export default function BacklogFormFields() {
  const { control, watch, setValue } = useFormContext<FormData>();
  const { lists, loadLists, createList } = useGameListsStore();

  const gameName = watch("game_data.name");

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLists();
  }, [loadLists, createList]);

  async function handleFetchPreview() {
    if (!gameName) return;

    try {
      setLoading(true);

      const res = await fetch(
        `/api/scraper/game-search?title=${encodeURIComponent(gameName)}`
      );

      if (!res.ok) throw new Error("Erro ao buscar metadados");
      console.log("res ==> ", res);

      const data = await res.json();
      console.log("game preview ==> ", data);



      setPreviewData(data);
      setPreviewOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleNewListDialog() {
    setNewListOpen(true)
  }

  function applyPreview() {
    if (!previewData) return;

    setValue("game_data.name", previewData.name);
    setValue("game_data.release_date", previewData.release_date);
    setValue("game_data.developers", previewData.developers?.join(", "));
    setValue("game_data.genres", previewData.genres?.join(", "));
    setValue("game_data.platforms", previewData.platforms?.join(", "));
    setValue("game_data.publishers", previewData.publishers?.join(", "));;
    setValue("game_data.summary", previewData.summary);

    if (previewData.cover) {
      setValue("game_data.cover", {
        url: previewData.cover.url,
        source: previewData.cover.source,
        confidence: previewData.cover.confidence
      });
    }

    setPreviewOpen(false);
  }

  function addNewList() {
    if (newListName) {
      const trimmed = newListName.trim();
      if (!trimmed) return;

      createList(trimmed);
      setNewListOpen(false)
    }

  }

  return (
    <>
      {/* ===== DADOS DO JOGO ===== */}

      <div className="flex flex-col gap-5 ">
        <Card className="p-5 w-100">
          <CardHeader>
            <CardTitle>Dados do jogo</CardTitle>
            <CardDescription>
              Metadados do jogo obtidos via scraping.
            </CardDescription>
          </CardHeader>

          <CardContent>


            <Controller
              name="game_data.name"
              control={control}
              render={({ field, fieldState }) => (
                <div >
                  <Field className="pb-5" data-invalid={fieldState.invalid}>
                    <FieldLabel>Nome do jogo</FieldLabel>
                    <div className="flex md-flex-row gap-3">
                      <Input {...field} className="w-[90%]" />
                      <Button type="button"
                        variant="secondary"
                        className="w-[10%]"
                        onClick={handleFetchPreview}
                        disabled={loading || !gameName}>      {loading ? '...' : <Search />}</Button>

                    </div>

                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}


                  </Field>

                </div>
              )}
            />


            <Controller
              name="game_data.developers"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Desenvolvedores</FieldLabel>
                  <Input {...field}
                  />
                </Field>
              )}
            />

            <Controller
              name="game_data.publishers"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Publishers</FieldLabel>
                  <Input {...field} />
                </Field>
              )}
            />
            <Controller
              name="game_data.genres"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Gêneros</FieldLabel>
                  <Input {...field}
                  />
                </Field>
              )}
            />
            <Controller
              name="game_data.platforms"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Platforms</FieldLabel>
                  <Input {...field} />
                </Field>
              )}
            />
            <Controller
              name="game_data.release_date"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Ano de lançamento</FieldLabel>
                  <Input
                    type="text"
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? String(e.target.value) : undefined
                      )
                    }
                  />
                </Field>
              )}
            />


            <Controller
              name="game_data.cover"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Capa do jogo</FieldLabel>
                  <GameCoverSearch
                    query={gameName}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />

            <Controller
              name="game_data.summary"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Resumo</FieldLabel>
                  <InputGroup>
                    <InputGroupTextarea
                      {...field}
                      rows={4}
                      className="resize-none"
                    />
                    <InputGroupAddon align="block-end">
                      <InputGroupText>
                        {field.value?.length ?? 0}/500
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              )}
            />
          </CardContent>
        </Card>
        <Card className="p-5 w-100">
          <CardHeader>
            <CardTitle>Dados do jogador</CardTitle>
            <CardDescription>
              Suas experiências e impressões gerais sobre o jogo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="player_data.status"
              control={control}
              render={({ field, fieldState }) => (
                <Field className="pb-5" data-invalid={fieldState.invalid}>
                  <FieldLabel>Game status</FieldLabel>
                  <Input
                    {...field}
                    placeholder="Ex: jogando, zerado, dropado, etc."
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="player_data.hours_played"
              control={control}
              render={({ field, fieldState }) => (
                <Field className="" data-invalid={fieldState.invalid}>
                  <FieldLabel>Horas jogadas</FieldLabel>
                  <div>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="Ex: 40"

                    />
                    {gameName && (
                      <a
                        href={buildHLTBSearchUrl(gameName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground underline pb-5"
                      >
                        Ver tempo médio de <strong>{gameName || "Game"}  </strong> no HowLongToBeat
                      </a>
                    )}
                  </div>


                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>

              )}
            />
            <div className="flex md-flex-row gap-4">
              <Controller
                name="player_data.times_finished"
                control={control}
                render={({ field }) => (
                  <Field className="py-5">
                    <FieldLabel>Quantas vezes completou</FieldLabel>
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

                    />
                  </Field>
                )}
              />

              <Controller
                name="player_data.rating"
                control={control}
                render={({ field }) => (
                  <Field className="py-5">
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
            </div>


            <Controller
              name="player_data.review"
              control={control}
              render={({ field }) => (
                <Field className="pb-5">
                  <FieldLabel>Review pessoal</FieldLabel>
                  <InputGroup>
                    <InputGroupTextarea
                      {...field}
                      rows={5}
                      className="resize-none"
                      placeholder="O que você achou do jogo?"
                    />
                    <InputGroupAddon align="block-end">
                      <InputGroupText>
                        {field.value?.length ?? 0}/500
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    Impressões pessoais, sem compromisso com a crítica.
                  </FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="player_data.listIds"
              control={control}
              render={({ field }: any) => (
                <Field className="w-full">
                  <FieldLabel>Adicionar à lista</FieldLabel>
                  <div className="flex flex-row gap-3">
                    <div className="w-[90%]">
                      <Select
                        value={field.value?.[0]}
                        onValueChange={(value) => field.onChange([value])}
                      >
                        <SelectTrigger >
                          <SelectValue placeholder="Escolha uma lista" />
                        </SelectTrigger>
                        <SelectContent >
                          <SelectGroup >
                            {lists.map((list) => (
                              <SelectItem key={list._id} value={list._id}>
                                {list.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>

                      </Select>

                    </div>
                    <div className="w-[10%]">
                      <Button type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={handleNewListDialog}
                        disabled={loading}>      {loading ? '...' : "+ Nova Lista"}</Button>
                    </div>
                  </div>


                </Field>

              )}

            />
          </CardContent>
        </Card>
      </div>

      {/* ===== PREVIEW DIALOG ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{previewData?.name}</DialogTitle>
            <DialogDescription>
              {previewData?.release_date} ·{" "}
              {previewData?.developers?.join(", ")}
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm leading-relaxed">
            {previewData?.summary}
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={applyPreview}>
              Aplicar ao formulário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== NEW LIST DIALOG ===== */}
      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova lista</DialogTitle>
            <DialogDescription>
              Digite o nome da nova lista.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm leading-relaxed">
            <Input onChange={(e) => setNewListName(e.target.value)} />
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewListOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={addNewList}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
