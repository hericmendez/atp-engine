// src/components/form-modal/drawer.tsx (form wrapper)
"use client";

import { FormProvider } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { FieldGroup } from "@/components/ui/field";

type FormSheetProps = {
  buttonName: string;
  drawerTitle: string;

  formModal: {
    dialogProps: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    };
    form: any;
    submitProps: {
      onSubmit: () => void;
      isSubmitting: boolean;
    };
    cancelProps: {
      onCancel: () => void;
    };
  };

  children: React.ReactNode;
};

export default function FormSheet({
  buttonName,
  drawerTitle,
  formModal,
  children
}: FormSheetProps) {
  const { dialogProps, form, submitProps, cancelProps } = formModal;

  return (
    <Sheet {...dialogProps}>
      <SheetTrigger asChild>
        <Button variant="outline">{buttonName}</Button>
      </SheetTrigger>

      <SheetContent style={{ maxWidth: "70vw", overflowY: "auto" }}>
        <SheetHeader>
          <SheetTitle>{drawerTitle}</SheetTitle>
        </SheetHeader>

        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submitProps.onSubmit)}>
            <FieldGroup>{children}</FieldGroup>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={cancelProps.onCancel}
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                onClick={()=>console.log(JSON.stringify(form.errors))}
                disabled={submitProps.isSubmitting}
              >
                Salvar
              </Button>
            </div>
          </form>
        </FormProvider>

      </SheetContent>
    </Sheet>
  );
}
