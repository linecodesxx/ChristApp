const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_HAS_LETTER_REGEX = /[A-Za-z]/
const PASSWORD_HAS_DIGIT_REGEX = /\d/

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
    errors.email = "Введите email"
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Введите корректный email"
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

  const username = trimValue(values.username)

  if (!username) {
    errors.username = "Введите username"
  } else if (!USERNAME_REGEX.test(username)) {
    errors.username = "Username: 3-20 символов, только латиница, цифры и _"
  }

  if (values.password && values.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Пароль не должен быть длиннее ${PASSWORD_MAX_LENGTH} символов`
  } else if (values.password) {
    if (!PASSWORD_HAS_LETTER_REGEX.test(values.password) || !PASSWORD_HAS_DIGIT_REGEX.test(values.password)) {
      errors.password = "Пароль должен содержать минимум 1 букву и 1 цифру"
    }
  }

  return errors
}
