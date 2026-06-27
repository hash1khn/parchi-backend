export function formatPakistaniPhone(
  phone: string | null | undefined,
): string | null {
  if (phone == null || phone.trim() === '') {
    return null;
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }
  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
}

export function isCompletePakistaniPhone(
  phone: string | null | undefined,
): boolean {
  if (!phone) {
    return false;
  }

  return phone.replace(/\D/g, '').length === 11;
}
