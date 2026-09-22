// src/app/(app)/components/form-modal-test/page.tsx
"use client";

import useFormModal from "@/hooks/use-form-modal";
import FormSheet from "@/components/form-modal/sheet";
import BacklogFormFields from "@/components/form-modal/backlog-form-fields";
import {
  defaultValues,
  gameFormSchema
} from "@/components/form-modal/form-props";
import { toast } from "sonner";


export default function FormModalTestPage() {

  const drawerForm = useFormModal({
    schema: gameFormSchema,
    defaultValues,
    onSubmit: async (data) => {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
    },
        body: JSON.stringify(data),
  });

      if (!res.ok) {
        const error = await res.json();
        throw error;
      }

      const createdGame = await res.json();
      return createdGame;
    },

    onSuccess: (data) => {
      console.log("Drawer sucesso");
      toast.success(`${data?.game_data?.name || "Jogo"} adicionado com sucesso!`);

    },
    onError: (errors) => {
      console.log("ERROS DO FORM", errors);
      toast.error("Erro ao cadastrar jogo!");
    }
  });



  return (
    <div className="flex gap-6 p-8">


      <FormSheet
        buttonName="Abrir Drawer"
        drawerTitle="Editar jogo (Drawer)"
        formModal={drawerForm}
      >
        <BacklogFormFields />
      </FormSheet>
    </div>
  );
}
