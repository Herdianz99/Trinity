// Utilidades para abrir un chat de WhatsApp con el mensaje ya escrito (sin API de Meta:
// sale del WhatsApp del empleado, no cuesta nada).

// Número para WhatsApp: asume Venezuela (+58). Quita símbolos, el 0 inicial y antepone 58.
// Devuelve '' si no parece un número válido (58 + 10 dígitos como mínimo).
export function waPhone(raw: string | null | undefined): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (!d.startsWith('58')) {
    if (d.startsWith('0')) d = d.slice(1);
    d = '58' + d;
  }
  return d.length >= 12 ? d : '';
}

// En el teléfono abre la app (wa.me); en la PC, WhatsApp Web.
// Llamarlo directo desde el clic (sin await antes): si no, el navegador lo bloquea como emergente.
export function openWhatsAppChat(phone: string, text: string) {
  const t = encodeURIComponent(text);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const url = isMobile
    ? `https://wa.me/${phone}?text=${t}`
    : `https://web.whatsapp.com/send?phone=${phone}&text=${t}`;
  window.open(url, '_blank');
}
