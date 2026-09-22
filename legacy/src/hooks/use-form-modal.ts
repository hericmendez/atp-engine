
//src/hooks/use-form-modal.ts
import { useState } from "react"
import { useForm, UseFormReturn, FieldValues, DefaultValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

type UseFormModalProps<TSchema extends z.ZodTypeAny> = {
  schema: TSchema
  defaultValues: DefaultValues<z.infer<TSchema>>

  onSubmit: (
    data: z.infer<TSchema>,
    helpers: UseFormReturn<z.infer<TSchema>>
  ) => Promise<void> | void

  onSuccess?: (
    data: z.infer<TSchema>,
    helpers: UseFormReturn<z.infer<TSchema>>
  ) => void

  onError?: (
    error: unknown,
    helpers: UseFormReturn<z.infer<TSchema>>
  ) => void

  closeOnSuccess?: boolean
}

export default function useFormModal<
  TSchema extends z.ZodTypeAny
>({
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
  onError,
  closeOnSuccess = true,
}: UseFormModalProps<TSchema>) {
  const [open, setOpen] = useState(false)

  const form = useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  async function handleSubmit(data: z.infer<TSchema>) {
    try {
      await onSubmit(data, form)
      onSuccess?.(data, form)

      if (closeOnSuccess) {
        setOpen(false)
      }
    } catch (err) {
      onError?.(err, form)
    }
  }

  function closeForm() {
    form.reset()
    setOpen(false)
  }

  return {
    open,
    setOpen,

    form,

    submitProps: {
      onSubmit: form.handleSubmit(handleSubmit),
      isSubmitting: form.formState.isSubmitting,
    },

    cancelProps: {
      onCancel: closeForm,
    },

    dialogProps: {
      open,
      onOpenChange: (next: boolean) => {
        if (next) setOpen(true)
      },
    },
  }
}

