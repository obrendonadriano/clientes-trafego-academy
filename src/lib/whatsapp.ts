export function generateWhatsappLink(phone: string, message: string) {
  const sanitizedPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}
