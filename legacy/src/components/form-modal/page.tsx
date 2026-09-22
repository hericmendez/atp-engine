"use client"

import { FormProvider } from "react-hook-form"
import { Button } from "@/components/ui/button"
import useFormModal from "@/hooks/use-form-modal"
import { FieldGroup } from "@/components/ui/field"
import { z } from "zod"

type FormPageProps<T extends z.ZodType<any, any, any>> = {
  schema: T
  defaultValues: z.infer<T>
  onSubmit: (data: z.infer<T>) => Promise<void> | void
  children: React.ReactNode
}

export function FormPage<T extends z.ZodType<any, any, any>>({
  schema,
  defaultValues,
  onSubmit,
  children,
}: FormPageProps<T>) {
  const formLogic = useFormModal<T>({
    schema,
    defaultValues,
    onSubmit,
  })

  return (
    <FormProvider {...formLogic.form as any}>
      <form onSubmit={formLogic.submitProps.onSubmit}>
        <FieldGroup>{children}</FieldGroup>

        <div className="flex justify-end mt-6">
          <Button type="submit">
            Salvar
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
