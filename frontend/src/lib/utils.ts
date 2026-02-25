export function getInitials(fullName?: string) {
  const normalizedName = fullName?.trim().replace(/\s+/g, " ")
  if (!normalizedName) return "U"

  const parts = normalizedName.split(" ").filter(Boolean)
  if (parts.length === 0) return "U"

  const firstName = parts[0]
  const firstLetter = firstName.charAt(0)

  if (parts.length > 1) {
    const lastName = parts[parts.length - 1]
    const lastLetter = lastName.charAt(0)
    return `${firstLetter}${lastLetter}`.toUpperCase()
  }

  const cleanedFirstName = firstName.replace(/[-_'.]/g, "")
  const secondLetter = cleanedFirstName.length > 1 ? cleanedFirstName.charAt(1) : ""

  return `${firstLetter}${secondLetter || firstLetter}`.toUpperCase()
}

export function formatMemberSince(value?: string | Date | null) {
  if (!value) return ""

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}
