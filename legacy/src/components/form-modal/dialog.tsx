// src/components/form-modal/dialog.tsx
"use client";

import { FormProvider } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";

type FormDialogProps = {
  buttonName: string;
  dialogTitle: string;

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

export default function FormDialog({
  buttonName,
  dialogTitle,
  formModal,
  children
}: FormDialogProps) {
  const { dialogProps, form, submitProps, cancelProps } = formModal;

  return (
    <Dialog {...dialogProps}>
      <DialogTrigger asChild>
        <Button variant="outline">{buttonName}</Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-[50vw] overflow-y-auto "
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <FormProvider {...form}>
          <form onSubmit={submitProps.onSubmit}>
            <FieldGroup>{children}</FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={cancelProps.onCancel}
              >
                Cancelar
              </Button>

              <Button type="submit" disabled={submitProps.isSubmitting}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
