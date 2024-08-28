import { decode } from 'decode-formdata'
import { _tanstackInternalsCookie } from './utils'
import { ServerValidateError } from './error'
import type {
  FormOptions,
  FormValidationError,
  ValidationError,
  Validator,
} from '@tanstack/form-core'
import type { FetchFn } from '@tanstack/start'
import type { ServerFormState } from './types'

type Ctx = Parameters<FetchFn<FormData, unknown>>[1]

type OnServerValidateFn<TFormData> = (props: {
  value: TFormData
}) => ValidationError

interface CreateServerValidateOptions<
  TFormData,
  TFormValidator extends Validator<TFormData, unknown> | undefined = undefined,
> extends FormOptions<TFormData, TFormValidator> {
  onServerValidate: OnServerValidateFn<TFormData>
}

const isFormValidationError = (
  error: unknown,
): error is FormValidationError<unknown> => {
  return typeof error === 'object'
}

export const createServerValidate =
  <
    TFormData,
    TFormValidator extends
      | Validator<TFormData, unknown>
      | undefined = undefined,
  >(
    defaultOpts: CreateServerValidateOptions<TFormData, TFormValidator>,
  ) =>
  async (ctx: Ctx, formData: FormData, info?: Parameters<typeof decode>[1]) => {
    const { validatorAdapter, onServerValidate } = defaultOpts

    const runValidator = (propsValue: { value: TFormData; api: 'form' }) => {
      if (validatorAdapter && typeof onServerValidate !== 'function') {
        return validatorAdapter().validate(propsValue, onServerValidate)
      }

      return (onServerValidate as OnServerValidateFn<TFormData>)(propsValue)
    }

    const referer = ctx.request.headers.get('referer')!

    const data = decode(formData, info) as never as TFormData

    const onServerError = runValidator({ value: data, api: 'form' })

    if (!onServerError) return

    const onServerErrorStr =
      onServerError &&
      typeof onServerError !== 'string' &&
      isFormValidationError(onServerError)
        ? onServerError.form
        : onServerError

    const formState: ServerFormState<TFormData> = {
      errorMap: {
        onServer: onServerError,
      },
      values: data,
      errors: onServerErrorStr ? [onServerErrorStr] : [],
    }

    const cookie = await _tanstackInternalsCookie.serialize(formState)

    throw new ServerValidateError({
      response: new Response('ok', {
        headers: {
          Location: referer,
          'Set-Cookie': cookie,
        },
        status: 302,
      }),
      formState: formState,
    })
  }
