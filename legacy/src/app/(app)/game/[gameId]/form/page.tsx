//src/app/(app)/game/[gameId]/page.tsx
"use client";

import { FormProvider } from "react-hook-form";
import useFormModal from "@/hooks/use-form-modal";
import BacklogFormFields from "@/components/form-modal/backlog-form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { defaultValues, gameFormSchema } from "@/components/form-modal/form-props";
import { toast } from "sonner";
import Link from "next/link";
import { useGamesStore } from "@/stores/useGamesStore";

import { ContentLayout } from "@/components/admin-panel/content-layout";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function NewPostPage() {
  const router = useRouter()
  const { loadGameById } = useGamesStore()
  const { gameId } = useParams()

  const isEditing = gameId !== 'new'
  console.log("isEditing ==> ", isEditing);

  const formModal = useFormModal({
    schema: gameFormSchema,
    defaultValues,
    onSubmit: async (data) => {
      console.log("data ==> ", data);
      const res = await fetch(`/api/games/${isEditing ? gameId : ''}`, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const error = await res.json();
        throw error;
      }

      console.log("res ==> ", res);
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`${data?.game_data?.name || "Jogo"} salvo com sucesso!`);
      router.back()
    },
    onError: (errors) => {
      console.log("ERROS DO FORM", errors);
      toast.error("Erro ao salvar jogo!");
    }

  });

  useEffect(() => {
    async function fetchGame() {
      if (!isEditing) return;

      const game = await loadGameById(gameId as string);
      console.log("game ==> ", game);

      if (!game) return;

      formModal.form.reset(game as any);
    }

    fetchGame();

  }, [gameId, loadGameById, formModal.form]);

  return (
    <ContentLayout title="New Post">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/game">Game</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem> <BreadcrumbPage>{isEditing ? "Editar" : "Novo"}</BreadcrumbPage>
           </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="w-100 p-8">


        <FormProvider {...formModal.form}>
          <form /* onSubmit={formModal.form.handleSubmit(
            (data) => {
              console.log("SUBMIT OK", data);
            },
            (errors) => {
              console.log("FORM ERRORS", errors);
            }
          )}  */ onSubmit={formModal.submitProps.onSubmit} >
            <FieldGroup>
              <BacklogFormFields />
            </FieldGroup>

            <div className="flex gap-2 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={formModal.cancelProps.onCancel}
              >
                Resetar
              </Button>

              <Button type="submit" disabled={formModal.submitProps.isSubmitting}>
                Salvar
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </ContentLayout>
  );
}
