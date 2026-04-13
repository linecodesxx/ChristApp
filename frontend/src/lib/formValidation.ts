const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Латиниця, цифри, підкреслення; 3–20 — збігається з backend. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72

type LoginValues = {
  email: string
  password: string
}

type RegisterValues = {
  email: string
  username: string
  password: string
}

export type LoginFieldErrors = Partial<Record<keyof LoginValues, string>>
export type RegisterFieldErrors = Partial<Record<keyof RegisterValues, string>>

function trimValue(value: string): string {
  return value.trim()
}

export function validateLoginForm(values: LoginValues): LoginFieldErrors {
  const errors: LoginFieldErrors = {}
  const email = trimValue(values.email)

  if (!email) {
    errors.email = "Введите email или username"
  } else if (!EMAIL_REGEX.test(email) && !USERNAME_REGEX.test(email)) {
    errors.email = "Введите корректный email или username"
  }

  if (!values.password) {
    errors.password = "Введите пароль"
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Пароль должен быть не короче ${PASSWORD_MIN_LENGTH} символов`
  }

  return errors
}

export function validateRegisterForm(values: RegisterValues): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {
    ...validateLoginForm({ email: values.email, password: values.password }),
  }

  const email = trimValue(values.email)
  if (!email) {
    errors.email = "Введите email"
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Введите корректный email"
  }

  const username = trimValue(values.username)

  if (!username) {
    errors.username = "Введите username"
  } else if (!USERNAME_REGEX.test(username)) {
    errors.username = "Username: 3-20 символов, только латиница, цифры и _"
  }

  if (values.password && values.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Пароль не должен быть длиннее ${PASSWORD_MAX_LENGTH} символов`
  }

  return errors
}
