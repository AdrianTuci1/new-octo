export function timelineMessageTime(message: { createdAt?: string; id: string }) {
  if (message.createdAt) {
    const createdAt = Date.parse(message.createdAt);
    if (Number.isFinite(createdAt)) {
      return createdAt;
    }
  }

  const idParts = message.id.split('-');
  const timestamp = Number(idParts[idParts.length - 1]);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
